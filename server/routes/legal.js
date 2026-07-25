require("dotenv").config();
const express   = require("express");
const jwt       = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const { createEmbedding }         = require("../helpers/embedding");
const { generate }                = require("../helpers/llmManager");
const { searchGlobalLegalContext } = require("../helpers/qdrant");
const { rerank }                  = require("../helpers/reranker");
const { pool }                    = require("../db");

const router = express.Router();

// ── Guest limit — single source of truth (server owns this value) ─────────────
// The frontend reads it from the API response (guestLimit / limit fields) so
// the hardcoded "4" only lives here, not duplicated in the client.
const GUEST_LIMIT = parseInt(process.env.GUEST_LIMIT ?? "4", 10);

// ── Rate limiter — for the /ask endpoint only ─────────────────────────────────
const askLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many questions. Please slow down." },
});

// ── Intent Detection ──────────────────────────────────────────────────────────
const CASUAL_PATTERNS = [
    /^\s*(h(i|ello|ey|owdy)|good\s*(morning|afternoon|evening|night)|what'?\s*s?\s*up|yo|sup|greetings)/i,
    /^\s*(how\s+are\s+you|how'?\s*s?\s*it\s+going|how\s+do\s+you\s+do|what'?\s*s?\s*good)/i,
    /^\s*(thanks?|thank\s+you|thx|ty|bye|goodbye|see\s+you|take\s+care|have\s+a\s+(good|nice|great)\s+(day|one|evening))/i,
    /^\s*(nice\s+to\s+meet\s+you|pleased\s+to\s+meet|who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do)/i,
];

function isCasualChat(text) {
    const trimmed = text.trim();
    if (trimmed.length > 120) return false;
    return CASUAL_PATTERNS.some((re) => re.test(trimmed));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientIp(req) {
    let ip = req.ip || req.socket?.remoteAddress || "";
    if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
    if (ip === "::1") ip = "127.0.0.1";
    return ip;
}

function sanitize(str, maxLen = 2000) {
    if (typeof str !== "string") return "";
    return str.trim().slice(0, maxLen);
}

function safeErrorMessage(err) {
    const status = err?.status ?? err?.response?.status ?? 500;
    if (status === 429) return "API rate limit reached. Please wait 30 seconds and try again.";
    if (status === 400 || status === 422) return err?.publicMessage ?? "Invalid request.";
    return "An error occurred while processing your request.";
}

function sendError(res, status, publicMessage) {
    return res.status(status).json({ success: false, message: publicMessage });
}

// ── System Instruction (UPL Guardrails) ───────────────────────────────────────
const systemInstruction = `You are a professional US Legal Information Assistant. 

INTENT AND TONE:
- For general legal questions, provide an objective, authoritative, and educational summary of the law using ONLY the provided context.
- The UI already displays a permanent legal disclaimer, so DO NOT add your own legal disclaimers or state that you are an AI/not an attorney UNLESS the user is actively asking for advice on a specific personal situation, asking what action they should take, or asking you to predict a case outcome.

CRITICAL BOUNDARIES:
1. Provide objective legal INFORMATION only. NEVER provide tailored legal advice.
2. Never tell the user what they "should", "must", or "need to" do regarding their personal circumstances.
3. If the user asks for advice on a specific personal legal crisis or asks you to predict a specific court outcome, gracefully decline by stating that you cannot provide legal advice or strategy for specific situations.
4. Always cite your matching context source citations inline when outputting legal details.
5. Absolute Factual Grounding: If the retrieved database context lacks clear evidence to answer the user's question, state plainly that you cannot locate sufficient supporting documentation in the indexed dataset. Do NOT rely on your general training data to make up laws, rules, or citations.`;

// ── GET /api/legal/guest-status ───────────────────────────────────────────────
router.get("/guest-status", async (req, res) => {
    try {
        const ip = getClientIp(req);
        const result = await pool.query(
            "SELECT message_count FROM vl_guest_limits WHERE ip = $1",
            [ip]
        );
        const count = result.rows[0]?.message_count ?? 0;
        res.status(200).json({ usage: count, limit: GUEST_LIMIT });
    } catch (err) {
        console.error("[GUEST STATUS] error", err);
        res.status(500).json({ usage: 0, limit: GUEST_LIMIT });
    }
});

// ── POST /api/legal/ask ───────────────────────────────────────────────────────
//
// Dual-intent routing:
//   1. Casual chat → direct LLM response (no Qdrant lookup)
//   2. Legal query → embed → Qdrant search → rerank → contextual LLM response
//
router.post("/ask", askLimiter, async (req, res) => {
    try {
        const question = sanitize(req.body?.question, 1000);
        if (!question) return sendError(res, 400, "Question cannot be empty.");

        console.log(`[ASK] New query (${question.length} chars)`);

        // ── Guest Limit Enforcement ────────────────────────────────────────
        const authHeader = req.headers.authorization;
        let isAuthenticated = false;
        let currentGuestUsage = undefined;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            try {
                jwt.verify(token, process.env.JWT_SECRET);
                isAuthenticated = true;
            } catch {
                // Invalid token — treat as guest
            }
        }

        if (!isAuthenticated) {
            const ip = getClientIp(req);
            console.log(`[GUEST LIMIT] Client IP: "${ip}"`);
            const limitResult = await pool.query(
                "SELECT message_count FROM vl_guest_limits WHERE ip = $1",
                [ip]
            );
            const count = limitResult.rows[0]?.message_count ?? 0;

            if (count >= GUEST_LIMIT) {
                return sendError(res, 403, "Free limit reached. Please sign in to continue.");
            }

            await pool.query(
                `INSERT INTO vl_guest_limits (ip, message_count)
                 VALUES ($1, 1)
                 ON CONFLICT (ip) DO UPDATE
                   SET message_count = vl_guest_limits.message_count + 1,
                       last_request  = NOW()`,
                [ip]
            );
            currentGuestUsage = count + 1;
        }

        // ── Intent 1: Casual chat ─────────────────────────────────────────
        if (isCasualChat(question)) {
            console.log("[ASK] Detected casual chat — skipping Qdrant.");
            const chatResponse = await generate(question, systemInstruction, 0.7);
            return res.status(200).json({
                success:    true,
                answer:     chatResponse.answer,
                guestUsage: currentGuestUsage,
                guestLimit: GUEST_LIMIT,
            });
        }

        // ── Intent 2: Legal query ─────────────────────────────────────────
        console.log("[ASK] Legal query — embedding…");
        const queryVector = await createEmbedding(question);

        console.log("[ASK] Searching knowledge base…");
        const rawCandidates = await searchGlobalLegalContext(queryVector, 50);

        let contextPayloads;
        try {
            contextPayloads = await rerank(question, rawCandidates);
        } catch (rerankerErr) {
            console.error("[ASK] Reranker failed, falling back to top-15:", rerankerErr.message);
            contextPayloads = rawCandidates.slice(0, 15);
        }

        let contextBlock = "";
        if (contextPayloads.length > 0) {
            console.log(
                `[ASK] Retrieved ${contextPayloads.length} items. Scores: ${contextPayloads
                    .map((p) => Number(p._score).toFixed(3))
                    .join(", ")}`
            );
            contextBlock = contextPayloads
                .map((p, i) => {
                    const type     = p.documentType || "Unknown";
                    const citation = p.citation     || "No citation";
                    const text     = p.text         || "";
                    const score    = p._score ? ` (Score: ${Number(p._score).toFixed(3)})` : "";
                    return `--- RETRIEVED ITEM ${i + 1}${score} ---\n[Type]: ${type}\n[Citation]: ${citation}\n\n${text}`;
                })
                .join("\n\n");
        }

        const prompt = contextBlock
            ? `The following legal context was retrieved from an authoritative indexed database. Use ONLY this context to answer the user's question. Cite the [Citation] values inline.\n\n${contextBlock}\n\n---\nUser Question: ${question}`
            : `No matching legal context was found in the indexed database for this query.\n\nUser Question: ${question}`;

        console.log("[ASK] Generating answer…");
        const aiResponse = await generate(prompt, systemInstruction, 0.1);

        console.log("[ASK] Done.");
        return res.status(200).json({
            success:    true,
            answer:     aiResponse.answer,
            guestUsage: currentGuestUsage,
            guestLimit: GUEST_LIMIT,
        });

    } catch (err) {
        console.error(`[ASK] error status=${err?.status ?? "unknown"}`);
        const status = err?.status === 429 ? 429 : 500;
        return sendError(res, status, safeErrorMessage(err));
    }
});

module.exports = router;
