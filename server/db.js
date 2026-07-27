require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host:                 process.env.DB_HOST     || "localhost",
  port:                 parseInt(process.env.DB_PORT ?? "5432", 10),
  user:                 process.env.DB_USER,
  password:             process.env.DB_PASSWORD,
  database:             process.env.DB_NAME,
  max:                  20,              // max connections in pool
  idleTimeoutMillis:    30_000,          // close idle clients after 30 s
  connectionTimeoutMillis: 2_000,        // error if no connection within 2 s
});

// Surface unexpected pool errors instead of silently crashing
pool.on("error", (err) => {
  console.error("[DB] Unexpected pool client error:", err.message);
});

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS vl_users (
    user_id       SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    name          VARCHAR(255),
    password_hash VARCHAR(255),
    google_id     VARCHAR(255) UNIQUE,
    is_verified   BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS vl_guest_limits (
    ip            VARCHAR(45) PRIMARY KEY,
    message_count INT DEFAULT 0,
    last_request  TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS vl_email_verifications (
    id         SERIAL PRIMARY KEY,
    user_id    INT REFERENCES vl_users(user_id) ON DELETE CASCADE,
    token      VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vl_chat_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id    INT REFERENCES vl_users(user_id) ON DELETE CASCADE,
    title      VARCHAR(255) DEFAULT 'New Chat',
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS vl_messages (
    message_id SERIAL PRIMARY KEY,
    session_id INT REFERENCES vl_chat_sessions(session_id) ON DELETE CASCADE,
    role       VARCHAR(50) NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- ── Indexes ─────────────────────────────────────────────────────────────
  -- Speeds up: GET /api/chat/sessions/:id/messages (WHERE session_id ORDER BY created_at)
  CREATE INDEX IF NOT EXISTS idx_messages_session_time
    ON vl_messages(session_id, created_at);

  -- Speeds up: GET /api/chat/sessions (WHERE user_id ORDER BY created_at DESC)
  CREATE INDEX IF NOT EXISTS idx_sessions_user_time
    ON vl_chat_sessions(user_id, created_at);

  -- Speeds up: email verification token lookup on every verify-email click
  CREATE INDEX IF NOT EXISTS idx_verifications_token
    ON vl_email_verifications(token);

  -- Speeds up: periodic cleanup query (DELETE WHERE last_request < X)
  CREATE INDEX IF NOT EXISTS idx_guest_limits_last_request
    ON vl_guest_limits(last_request);
`;

async function initDB() {
  const client = await pool.connect();
  try {
    
    //  create tables if they don't yet exist
    await client.query(SCHEMA_SQL);
    console.log("[DB] Vector Law schema ready (vl_users, vl_chat_sessions, vl_messages).");
  } finally {
    client.release();
  }
}

// ── Cleanup: sweep expired email-verification tokens ─────────────────────────
/**
 * Deletes all rows from vl_email_verifications whose expires_at is in the past.
 * Safe to call at any time — uses pool.query (single statement, no transaction needed).
 * @returns {Promise<number>} number of rows deleted
 */
async function cleanupExpiredVerifications() {
  const result = await pool.query(
    "DELETE FROM vl_email_verifications WHERE expires_at < NOW()"
  );
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[DB] Cleaned up ${count} expired verification token(s).`);
  }
  return count;
}

/**
 * Runs cleanupExpiredVerifications once immediately, then on a recurring
 * interval (default: every 1 hour).  Call this once from server.js at startup.
 * @param {number} [intervalMs=3_600_000] sweep interval in milliseconds
 */
function scheduleVerificationCleanup(intervalMs = 60 * 60 * 1_000) {
  cleanupExpiredVerifications().catch((err) =>
    console.error("[DB] Initial verification cleanup failed:", err.message)
  );

  const timer = setInterval(() => {
    cleanupExpiredVerifications().catch((err) =>
      console.error("[DB] Scheduled verification cleanup failed:", err.message)
    );
  }, intervalMs);

  // Don't let this timer block process exit
  if (timer.unref) timer.unref();

  console.log(`[DB] Verification cleanup scheduled every ${intervalMs / 60_000} min.`);
}

module.exports = { pool, initDB, cleanupExpiredVerifications, scheduleVerificationCleanup };
