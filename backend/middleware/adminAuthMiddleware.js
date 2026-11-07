const jwt = require("jsonwebtoken");
const pool = require("../config/db");

async function adminAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Admin authentication token required.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (
      decoded.type !== "admin" ||
      typeof decoded.adminId !== "string" ||
      !/^[1-9]\d*$/.test(decoded.adminId) ||
      !Number.isSafeInteger(decoded.tokenVersion) ||
      decoded.tokenVersion < 0
    ) {
      return res.status(403).json({
        message: "Admin access only.",
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, role, status, token_version
       FROM admins
       WHERE id = $1`,
      [decoded.adminId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Admin account not found.",
      });
    }

    const admin = result.rows[0];

    if (admin.status !== "active") {
      return res.status(403).json({
        message: "Admin account is suspended.",
      });
    }

    if (admin.token_version !== decoded.tokenVersion) {
      return res.status(401).json({
        message: "Admin session has expired. Please log in again.",
      });
    }

    req.admin = admin;
       return next();
  } catch (error) {
    console.error("Admin authentication error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired admin token.",
    });
  }
}

module.exports = adminAuthMiddleware;