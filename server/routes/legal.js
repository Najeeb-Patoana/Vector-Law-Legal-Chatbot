// routes/legal.js
require("dotenv").config();
const express   = require("express");

const { createEmbedding }          = require("../helpers/embedding");
const { generate }                 = require("../helpers/llmManager");
const { searchGlobalLegalContext } = require("../helpers/qdrant");
const { rerank }                   = require("../helpers/reranker");
const { pool }                     = require("../db");
const { optionalAuth }             = require("../middleware/auth");
const { isCasual }                 = require("../helpers/chatFilter"); // <-- Added this
const { askLimiter }               = require("../middleware/rateLimiters");

const { SYSTEM_INSTRUCTION, buildRagPrompt } = require("../prompts/prompts");

const router = express.Router();

// ── Guest limit — single source of truth (server owns this value) ─────────────
const GUEST_LIMIT = parseInt(process.env.GUEST_LIMIT ?? "4", 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientIp(req) {
    let ip = req.ip || req.socket?.remoteAddress || "";
    if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
    if (ip === "::1") ip = "127.0.0.1";
    return ip;
}

function sanitize(str, maxLen = 2000) {
    if (typeof str !== "string") return "";
    let clean = str.trim().slice(0, maxLen);
    clean = clean.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return clean;
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
router.post("/ask", askLimiter, optionalAuth, async (req, res) => {
    try {
        const question = sanitize(req.body?.question, 1000);
        if (!question) return sendError(res, 400, "Question cannot be empty.");

        console.log(`[ASK] New query (${question.length} chars)`);

        // ── Guest Limit Enforcement — single atomic round-trip ────────────────
        let currentGuestUsage = undefined;

        if (!req.user) {
            const ip = getClientIp(req);
            console.log(`[GUEST LIMIT] Client IP: "${ip}"`);

            const result = await pool.query(
                `INSERT INTO vl_guest_limits (ip, message_count)
                 VALUES ($1, 1)
                 ON CONFLICT (ip) DO UPDATE
                   SET message_count = vl_guest_limits.message_count + 1,
                       last_request  = NOW()
                 RETURNING message_count`,
                [ip]
            );
            const newCount = result.rows[0].message_count;

            if (newCount > GUEST_LIMIT) {
                await pool.query(
                    "UPDATE vl_guest_limits SET message_count = $1 WHERE ip = $2",
                    [GUEST_LIMIT, ip]
                );
                return sendError(res, 403, "Free limit reached. Please sign in to continue.");
            }

            currentGuestUsage = newCount;
        }

        // ── Intent 1: Local Semantic Chat Filter ──────────────────────────────
        // Shortcut: If it's over 120 chars, it's definitely not a simple hello.
        const isLengthy = question.length > 120;
        const isCasualGreeting = !isLengthy && (await isCasual(question));

        if (isCasualGreeting) {
            console.log("[ASK] Semantic filter flagged casual chat — skipping Qdrant.");
            const chatResponse = await generate(question, SYSTEM_INSTRUCTION, 0.7);
            return res.status(200).json({
                success:    true,
                answer:     chatResponse.answer,
                guestUsage: currentGuestUsage,
                guestLimit: GUEST_LIMIT,
            });
        }

        // ── Intent 2: Legal query — embed → search → rerank → generate ────────
        console.log("[ASK] Legal query — embedding…");
        const queryVector = await createEmbedding(question);

        console.log("[ASK] Searching knowledge base…");
        const rawCandidates = await searchGlobalLegalContext(queryVector, 50);

        let contextPayloads;
        try {
            contextPayloads = await rerank(question, rawCandidates);
        } catch (rerankerErr) {
            console.error("[ASK] Reranker failed, falling back to top-10:", rerankerErr.message);
            contextPayloads = rawCandidates.slice(0, 10);
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

        const prompt = buildRagPrompt(contextBlock, question);

        console.log("[ASK] Generating answer…");
        const aiResponse = await generate(prompt, SYSTEM_INSTRUCTION, 0.1);

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