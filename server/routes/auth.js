require("dotenv").config();
const express    = require("express");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const crypto     = require("crypto");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const { pool, cleanupExpiredVerifications } = require("../db");

const router       = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Validation helpers ────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE  = /^[a-zA-Z\s'-]{2,60}$/;

function validateEmail(email) {
  if (!email || typeof email !== "string") return "Email is required.";
  if (!EMAIL_RE.test(email.trim()))         return "Please enter a valid email address.";
  return null;
}

function validatePassword(password, isNew = true) {
  if (!password || typeof password !== "string") return "Password is required.";
  if (isNew && password.length < 8)              return "Password must be at least 8 characters.";
  if (isNew && password.length > 72)             return "Password must not exceed 72 characters.";
  return null;
}

function validateName(name) {
  if (!name || typeof name !== "string") return "Full name is required.";
  const trimmed = name.trim();
  if (trimmed.length < 2)               return "Name must be at least 2 characters.";
  if (trimmed.length > 60)              return "Name must not exceed 60 characters.";
  if (!NAME_RE.test(trimmed))           return "Name may only contain letters, spaces, hyphens, and apostrophes.";
  return null;
}

// ── SMTP transporter ──────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT ?? "587", 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Token helpers ─────────────────────────────────────────────────────────────
function signAccess(user) {
  return jwt.sign(
    { userId: user.user_id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { userId: user.user_id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validate all fields and collect errors
    const errors = {};
    const nameErr  = validateName(name);
    const emailErr = validateEmail(email);
    const passErr  = validatePassword(password, true);
    if (nameErr)  errors.name     = nameErr;
    if (emailErr) errors.email    = emailErr;
    if (passErr)  errors.password = passErr;

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: "Validation failed.", errors });
    }

    const normEmail = email.trim().toLowerCase();

    const existing = await pool.query("SELECT user_id FROM vl_users WHERE email = $1", [normEmail]);
    if (existing.rows.length) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
        errors:  { email: "An account with this email already exists." },
      });
    }

    const hash   = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO vl_users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *",
      [normEmail, name.trim(), hash]
    );
    const user = result.rows[0];

    // Create verification token
    const token   = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await pool.query(
      "INSERT INTO vl_email_verifications (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.user_id, token, expires]
    );

    // Send verification email
    const verifyUrl = `${process.env.BACKEND_URL || "http://localhost:3000"}/api/auth/verify-email?token=${token}`;
    await transporter.sendMail({
      from:    process.env.MAIL_FROM,
      to:      user.email,
      subject: "Verify your Vector Law account",
      html: `
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="margin:0;font-size:1.5rem;color:#f1f5f9;">Verify Your Email</h1>
          </div>
          <p style="color:#94a3b8;margin-bottom:24px;">Hi <strong style="color:#e2e8f0;">${user.name}</strong>, thanks for joining <strong style="color:#2dd4bf;">Vector Law</strong>. Please verify your email to get started.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${verifyUrl}" style="background:linear-gradient(135deg,#0f766e,#0d9488);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color:#64748b;font-size:0.8rem;text-align:center;">Link expires in 24 hours. If you didn't create an account, ignore this email.</p>
        </div>
      `,
    });

    return res.status(201).json({
      success: true,
      message: "Account created. Please check your email to verify your account.",
    });
  } catch (err) {
    console.error("[Auth] register error:", err.message);
    return res.status(500).json({ success: false, message: "Registration failed. Please try again." });
  }
});

// ── GET /api/auth/verify-email ────────────────────────────────────────────────
router.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("<h2>Invalid verification link.</h2>");

  // Acquire a dedicated client so we can run a proper transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Look up the token — must exist and not be expired
    const result = await client.query(
      `SELECT user_id FROM vl_email_verifications
       WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#e2e8f0;">
          <h2>Link expired or invalid.</h2>
          <p>Please register again or request a new verification email.</p>
        </body></html>
      `);
    }

    const { user_id } = result.rows[0];

    // 2. Mark the user as verified
    await client.query(
      "UPDATE vl_users SET is_verified = TRUE WHERE user_id = $1",
      [user_id]
    );

    // 3. Delete the token by its own value so it can never be reused,
    //    even if another request arrives concurrently for the same user.
    await client.query(
      "DELETE FROM vl_email_verifications WHERE token = $1",
      [token]
    );

    await client.query("COMMIT");

    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#e2e8f0;">
        <div style="max-width:480px;margin:0 auto;">
          <h2 style="color:#4ade80;">Email Verified!</h2>
          <p style="color:#94a3b8;">Your account is now active. You can close this tab and log in.</p>
          <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/login"
             style="display:inline-block;margin-top:24px;padding:12px 28px;background:#0f766e;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
            Go to Login
          </a>
        </div>
      </body></html>
    `);
  } catch (err) {
    // Best-effort rollback — ignore secondary errors
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("[Auth] verify-email error:", err.message);
    return res.status(500).send("<h2>Server error. Please try again.</h2>");
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const errors = {};
    const emailErr = validateEmail(email);
    const passErr  = validatePassword(password, false);
    if (emailErr) errors.email    = emailErr;
    if (passErr)  errors.password = passErr;

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: "Validation failed.", errors });
    }

    const result = await pool.query("SELECT * FROM vl_users WHERE email = $1", [email.trim().toLowerCase()]);
    const user   = result.rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (!user.is_verified) {
      return res.status(403).json({ success: false, message: "Please verify your email before logging in.", needsVerification: true });
    }

    const refreshToken = signRefresh(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      success:     true,
      accessToken: signAccess(user),
      user: { userId: user.user_id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("[Auth] login error:", err.message);
    return res.status(500).json({ success: false, message: "Login failed. Please try again." });
  }
});

// ── POST /api/auth/google ─────────────────────────────────────────────────────
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, message: "Google credential is required." });
    }

    const ticket  = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, email_verified } = payload;

    if (!email_verified) {
      return res.status(400).json({ success: false, message: "Google account email is not verified." });
    }

    // Upsert user
    let userRow;
    const existing = await pool.query("SELECT * FROM vl_users WHERE google_id = $1 OR email = $2", [googleId, email]);
    if (existing.rows.length) {
      userRow = existing.rows[0];
      if (!userRow.google_id) {
        await pool.query("UPDATE vl_users SET google_id = $1, is_verified = TRUE WHERE user_id = $2", [googleId, userRow.user_id]);
        userRow.google_id   = googleId;
        userRow.is_verified = true;
      }
    } else {
      const insert = await pool.query(
        "INSERT INTO vl_users (email, name, google_id, is_verified) VALUES ($1, $2, $3, TRUE) RETURNING *",
        [email.toLowerCase(), name, googleId]
      );
      userRow = insert.rows[0];
    }

    const refreshToken = signRefresh(userRow);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      success:     true,
      accessToken: signAccess(userRow),
      user: { userId: userRow.user_id, email: userRow.email, name: userRow.name },
    });
  } catch (err) {
    console.error("[Auth] google error:", err.message);
    return res.status(500).json({ success: false, message: "Google authentication failed." });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token required." });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const result  = await pool.query("SELECT * FROM vl_users WHERE user_id = $1", [payload.userId]);
    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: "User not found." });
    }
    const user = result.rows[0];

    return res.json({
      success:     true,
      accessToken: signAccess(user),
      user: { userId: user.user_id, email: user.email, name: user.name },
    });
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired refresh token." });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post("/logout", (_req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  return res.json({ success: true, message: "Logged out." });
});

module.exports = router;
