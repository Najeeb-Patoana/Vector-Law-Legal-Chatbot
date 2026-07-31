const jwt = require("jsonwebtoken");

/**
 * Middleware: require a valid Bearer JWT.
 * Attaches req.user = { userId, email, name } on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.userId, email: payload.email, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
}

/**
 * Middleware: optionally verify a Bearer JWT.
 * If the token is present and valid → req.user is set (authenticated).
 * If absent or invalid → req.user stays null (guest). Never blocks the request.
 */
function optionalAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  req.user = null; // 

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { userId: payload.userId, email: payload.email, name: payload.name };
    } catch {
      // Invalid / expired token — treat as guest, do not block
    }
  }

  next();
}

module.exports = { requireAuth, optionalAuth };
