const rateLimit = require("express-rate-limit");

// ── loginLimiter ──────────────────────────────────────────────────────────────
// Protect against brute-force login attacks.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts. Please try again in 15 minutes." },
});

// ── registerLimiter ───────────────────────────────────────────────────────────
// Prevent account creation spam.
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many accounts created. Please try again in 1 hour." },
});

// ── googleLimiter ─────────────────────────────────────────────────────────────
// Protect Google OAuth endpoint.
const googleLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many Google sign-in attempts. Please try again in 15 minutes." },
});

// ── refreshLimiter ────────────────────────────────────────────────────────────
// Allow automatic access-token renewal without users being logged out during
// normal application usage.
const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many token refresh requests. Please try again shortly." },
});

// ── askLimiter ────────────────────────────────────────────────────────────────
// Per-minute throttle for the /api/legal/ask endpoint.
const askLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many questions. Please slow down." },
});

module.exports = {
    loginLimiter,
    registerLimiter,
    googleLimiter,
    refreshLimiter,
    askLimiter,
};
