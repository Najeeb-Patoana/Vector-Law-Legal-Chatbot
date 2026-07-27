require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");

// ── Startup-time initializers ─────────────────────────────────────────────────
const { initDB }             = require("./db");
const { initializeQdrant }   = require("./helpers/qdrant");
const { initializeReranker } = require("./helpers/reranker");

// ── Route modules ─────────────────────────────────────────────────────────────
const authRouter  = require("./routes/auth");
const chatRouter  = require("./routes/chat");
const legalRouter = require("./routes/legal");

// ── Config ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

app.use(cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
}));

app.use(express.json({ limit: "1mb" }));

// ── Rate Limiters ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  
    max: 10,               
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many attempts. Please try again in 15 minutes." },
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "US Legal Knowledge Base API" });
});

// Auth routes are protected by the strict authLimiter
app.use("/api/auth",  authLimiter, authRouter);
app.use("/api/chat",  chatRouter);
app.use("/api/legal", legalRouter);  

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Endpoint not found." });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Catches synchronous throws and unhandled promise rejections in middleware
app.use((err, _req, res, _next) => {
    console.error("[Server] unhandled middleware error");
    return res.status(500).json({ success: false, message: "An unexpected error occurred." });
});

async function start() {
    // 1. PostgreSQL schema
    try {
        await initDB();
    } catch (err) {
        console.error("[Server] DB init failed:", err.message);
        process.exit(1);
    }

    // 2. Qdrant vector store (non-fatal — collection created on first ingestion)
    try {
        console.log("[Server] Connecting to Qdrant…");
        await initializeQdrant();
    } catch (err) {
        console.warn("[Server] Qdrant not ready at startup:", err.message?.split("\n")[0]);
        console.warn("[Server] The collection will be created on first ingestion run.");
    }

    // 3. Cross-encoder reranker (non-fatal — falls back to top-15 vector results)
    try {
        await initializeReranker();
    } catch (err) {
        console.warn("[Server] Reranker unavailable:", err.message);
        console.warn("[Server] Will fall back to top-15 vector results on each request.");
    }

    app.listen(PORT, () => {
        console.log(`\nUS Legal Knowledge Base  -->  http://localhost:${PORT}`);
        console.log("  POST /api/legal/ask          -- ask a legal question or chat");
        console.log("  GET  /api/legal/guest-status -- guest usage status");
        console.log("  POST /api/auth/register      -- create account");
        console.log("  POST /api/auth/login         -- login (rate limited)");
        console.log("  POST /api/auth/google        -- Google OAuth (rate limited)");
        console.log("  GET  /api/chat/sessions      -- list chat history");
        console.log(`  Allowed origins: ${ALLOWED_ORIGINS.join(", ")}\n`);
    });
}

start();
