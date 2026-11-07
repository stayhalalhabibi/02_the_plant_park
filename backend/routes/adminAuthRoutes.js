
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");
const { rateLimit } = require("express-rate-limit");

const pool = require("../config/db");
const writeAdminAuditLog = require("../utils/adminAuditLog");
const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");

const router = express.Router();

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
const ADMIN_TOKEN_EXPIRY = "8h";

// Initialize email service only when its API key exists.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Rate limit authentication endpoints.
const adminAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many admin authentication attempts. Please try again later.",
  },
});

// Normalize and validate email.
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Generate a cryptographically secure six-digit OTP.
function createOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

// Hash OTP using HMAC instead of plain SHA-256.
// The JWT secret must be configured and kept private.
function hashOtp(otp) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return crypto
    .createHmac("sha256", secret)
    .update("plant-park-admin-login-otp:v1:")
    .update(otp)
    .digest("hex");
}

// Create an eight-hour admin JWT.
function createAdminToken(admin) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.sign(
    {
      type: "admin",
      adminId: String(admin.id),
      tokenVersion: admin.token_version,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: ADMIN_TOKEN_EXPIRY,
    }
  );
}

// Send OTP through Resend.
async function sendAdminOtp(email, otp) {
  if (!resend) {
    throw new Error("Resend API key is not configured.");
  }

  return resend.emails.send({
    from: "The Plant Park <noreply@theplantspark.com>",
    to: [email],
    subject: "Your Admin Login Verification Code",
    html: `
      <h2>Admin Login Verification</h2>
      <p>Your verification code is:</p>
      <h1>${otp}</h1>
      <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
      <p>If you did not request this code, please ignore this email.</p>
    `,
  });
}

// Write an audit log using an existing database connection.
async function insertAuditLog(queryable, {
  actorAdminId = null,
  action,
  targetAdminId = null,
  details = {},
  req,
}) {
  await queryable.query(
    `INSERT INTO admin_audit_logs (
       actor_admin_id,
       action,
       target_admin_id,
       details,
       ip_address,
       user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actorAdminId,
      action,
      targetAdminId,
      JSON.stringify(details),
      req?.ip || null,
      req?.get("user-agent") || null,
    ]
  );
}

// Best-effort audit logging for events outside a transaction.
async function recordAuditSafely(data) {
  try {
    await writeAdminAuditLog(data);
  } catch (error) {
    console.error("Admin audit logging failed:", error.message);
  }
}

// --------------------------------------------------
// GET CURRENT ADMIN PROFILE AND PERMISSIONS
// --------------------------------------------------

router.get("/me", adminAuthMiddleware, async (req, res) => {
  try {
    let result;

    if (req.admin.role === "owner") {
      result = await pool.query(
        `SELECT permission_key
         FROM admin_permissions
         ORDER BY permission_key`
      );
    } else {
      result = await pool.query(
        `SELECT ap.permission_key
         FROM admin_permission_assignments apa
         JOIN admin_permissions ap
           ON ap.id = apa.permission_id
         WHERE apa.admin_id = $1
         ORDER BY ap.permission_key`,
        [req.admin.id]
      );
    }

    const permissions = result.rows.map(
      (row) => row.permission_key
    );

    return res.status(200).json({
      admin: {
        id: String(req.admin.id),
        name: req.admin.name,
        email: req.admin.email,
        role: req.admin.role,
        status: req.admin.status,
        permissions,
      },
    });
  } catch (error) {
    console.error("Admin profile verification error:", error.message);

    return res.status(500).json({
      message: "Unable to verify admin profile.",
    });
  }
});

// --------------------------------------------------
// ADMIN LOGIN - EMAIL AND PASSWORD
// --------------------------------------------------

router.post("/login", adminAuthRateLimit, async (req, res) => {
  try {
    const body =
      req.body && typeof req.body === "object" ? req.body : {};

    const email = normalizeEmail(body.email);
    const password = body.password;

    if (!isValidEmail(email) || typeof password !== "string") {
      return res.status(400).json({
        message: "Valid email and password are required.",
      });
    }

    if (!process.env.JWT_SECRET || !resend) {
      console.error("Admin authentication environment is incomplete.");

      return res.status(503).json({
        message: "Admin authentication service is temporarily unavailable.",
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash, role,
              status, token_version, email_verified_at
       FROM admins
       WHERE LOWER(email) = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      await recordAuditSafely({
        action: "admin_login_failed",
        details: {
          email,
          reason: "invalid_credentials",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || null,
      });

      return res.status(401).json({
        message: "Invalid admin credentials.",
      });
    }

    const admin = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!passwordMatches) {
      await recordAuditSafely({
        actorAdminId: admin.id,
        action: "admin_login_failed",
        targetAdminId: admin.id,
        details: {
          reason: "invalid_credentials",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || null,
      });

      return res.status(401).json({
        message: "Invalid admin credentials.",
      });
    }

    if (admin.status !== "active") {
      await recordAuditSafely({
        actorAdminId: admin.id,
        action: "admin_login_blocked",
        targetAdminId: admin.id,
        details: {
          reason: "account_suspended",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || null,
      });

      return res.status(403).json({
        message: "Your admin account is suspended.",
      });
    }

    if (!admin.email_verified_at) {
      return res.status(403).json({
        message: "Admin email verification is required.",
      });
    }

    const otp = createOtp();

    await pool.query(
      `INSERT INTO admin_auth_verifications (
         admin_id,
         otp_hash,
         otp_expires_at,
         attempts
       )
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes', 0)
       ON CONFLICT (admin_id)
       DO UPDATE SET
         otp_hash = EXCLUDED.otp_hash,
         otp_expires_at = EXCLUDED.otp_expires_at,
         attempts = 0,
         created_at = NOW()`,
      [admin.id, hashOtp(otp)]
    );

    let emailResult;

    try {
      emailResult = await sendAdminOtp(admin.email, otp);
    } catch (emailError) {
      console.error("Admin OTP email error:", emailError.message);

      await pool.query(
        "DELETE FROM admin_auth_verifications WHERE admin_id = $1",
        [admin.id]
      );

      return res.status(503).json({
        message: "Unable to send verification email.",
      });
    }

    if (emailResult?.error) {
      console.error("Admin OTP email error:", emailResult.error);

      await pool.query(
        "DELETE FROM admin_auth_verifications WHERE admin_id = $1",
        [admin.id]
      );

      return res.status(503).json({
        message: "Unable to send verification email.",
      });
    }

    await recordAuditSafely({
      actorAdminId: admin.id,
      action: "admin_login_otp_sent",
      targetAdminId: admin.id,
      details: {},
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
    });

    return res.status(200).json({
      message: "Verification code sent to your admin email.",
      requiresOtp: true,
    });
  } catch (error) {
    console.error("Admin login error:", error.message);

    return res.status(500).json({
      message: "Unable to process admin login.",
    });
  }
});

// --------------------------------------------------
// VERIFY ADMIN LOGIN OTP
// --------------------------------------------------

router.post("/verify-otp", adminAuthRateLimit, async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const body =
      req.body && typeof req.body === "object" ? req.body : {};

    const email = normalizeEmail(body.email);
    const otp = String(body.otp || "").trim();

    if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "Valid email and six-digit OTP are required.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: "Admin authentication service is temporarily unavailable.",
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `SELECT
          a.id,
          a.name,
          a.email,
          a.role,
          a.status,
          a.token_version,
          a.email_verified_at,
          v.otp_hash,
          v.otp_expires_at,
          v.attempts
       FROM admins a
       INNER JOIN admin_auth_verifications v
         ON v.admin_id = a.id
       WHERE LOWER(a.email) = $1
       FOR UPDATE OF a, v`,
      [email]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      await recordAuditSafely({
        action: "admin_otp_verification_failed",
        details: {
          email,
          reason: "invalid_or_expired_code",
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || null,
      });

      return res.status(401).json({
        message: "Invalid or expired verification code.",
      });
    }

    const admin = result.rows[0];

    if (admin.status !== "active") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        message: "Admin account is suspended.",
      });
    }

    if (!admin.email_verified_at) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        message: "Admin email verification is required.",
      });
    }

    if (
      new Date(admin.otp_expires_at) <= new Date() ||
      admin.attempts >= MAX_OTP_ATTEMPTS
    ) {
      await client.query(
        "DELETE FROM admin_auth_verifications WHERE admin_id = $1",
        [admin.id]
      );

      await insertAuditLog(client, {
        actorAdminId: admin.id,
        action: "admin_otp_expired",
        targetAdminId: admin.id,
        details: {
          reason: "expired_or_max_attempts",
        },
        req,
      });

      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(401).json({
        message: "Verification code expired. Please log in again.",
      });
    }

    const submittedHash = Buffer.from(hashOtp(otp), "hex");
    const storedHash = Buffer.from(admin.otp_hash, "hex");

    const otpMatches =
      submittedHash.length === storedHash.length &&
      storedHash.length === 32 &&
      crypto.timingSafeEqual(submittedHash, storedHash);

    if (!otpMatches) {
      await client.query(
        `UPDATE admin_auth_verifications
         SET attempts = attempts + 1
         WHERE admin_id = $1`,
        [admin.id]
      );

      await insertAuditLog(client, {
        actorAdminId: admin.id,
        action: "admin_otp_verification_failed",
        targetAdminId: admin.id,
        details: {
          reason: "incorrect_code",
          attempt: admin.attempts + 1,
        },
        req,
      });

      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(401).json({
        message: "Incorrect verification code.",
      });
    }

    // Delete OTP to prevent reuse.
    await client.query(
      "DELETE FROM admin_auth_verifications WHERE admin_id = $1",
      [admin.id]
    );

    await client.query(
      "UPDATE admins SET last_login_at = NOW() WHERE id = $1",
      [admin.id]
    );

    const token = createAdminToken(admin);

    await insertAuditLog(client, {
      actorAdminId: admin.id,
      action: "admin_login_success",
      targetAdminId: admin.id,
      details: {},
      req,
    });

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      message: "Admin login successful.",
      token,
      admin: {
        id: String(admin.id),
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Admin OTP rollback error:",
          rollbackError.message
        );
      }
    }

    console.error("Admin OTP verification error:", error.message);

    return res.status(500).json({
      message: "Unable to verify admin login.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// --------------------------------------------------
// ACCEPT ADMIN INVITATION
// --------------------------------------------------

router.post(
  "/accept-invitation",
  adminAuthRateLimit,
  async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
      const body =
        req.body && typeof req.body === "object" ? req.body : {};

      const invitationToken =
        typeof body.token === "string" ? body.token.trim() : "";

      const password =
        typeof body.password === "string" ? body.password : "";

      if (!/^[a-fA-F0-9]{64}$/.test(invitationToken)) {
        return res.status(400).json({
          message: "Invalid or expired invitation.",
        });
      }

      const passwordBytes = Buffer.byteLength(password, "utf8");

      if (passwordBytes < 8 || passwordBytes > 72) {
        return res.status(400).json({
          message: "Password must be between 8 and 72 bytes.",
        });
      }

      const tokenHash = crypto
        .createHash("sha256")
        .update(invitationToken)
        .digest("hex");

      client = await pool.connect();

      await client.query("BEGIN");
      transactionStarted = true;

      const invitationResult = await client.query(
        `SELECT
            id,
            email,
            name,
            invited_by_admin_id
         FROM admin_invitations
         WHERE token_hash = $1
           AND accepted_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > NOW()
         FOR UPDATE`,
        [tokenHash]
      );

      if (invitationResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(400).json({
          message: "Invalid or expired invitation.",
        });
      }

      const invitation = invitationResult.rows[0];

      const passwordHash = await bcrypt.hash(password, 12);

      const adminResult = await client.query(
        `INSERT INTO admins (
           name,
           email,
           password_hash,
           role,
           status,
           email_verified_at,
           created_by_admin_id
         )
         VALUES ($1, $2, $3, 'admin', 'active', NOW(), $4)
         RETURNING id, name, email, role, status`,
        [
          invitation.name,
          normalizeEmail(invitation.email),
          passwordHash,
          invitation.invited_by_admin_id,
        ]
      );

      const createdAdmin = adminResult.rows[0];

      await client.query(
        `UPDATE admin_invitations
         SET accepted_at = NOW()
         WHERE id = $1`,
        [invitation.id]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      // Record invitation acceptance after the transaction.
      await recordAuditSafely({
        actorAdminId: invitation.invited_by_admin_id,
        action: "invitation_accepted",
        targetAdminId: createdAdmin.id,
        details: {
          invitationId: invitation.id,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || null,
      });

      return res.status(201).json({
        message: "Invitation accepted. Your admin account has been created.",
        admin: createdAdmin,
      });
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error(
            "Invitation rollback error:",
            rollbackError.message
          );
        }
      }

      if (error.code === "23505") {
        return res.status(409).json({
          message: "An admin account with this email already exists.",
        });
      }

      console.error("Admin invitation acceptance error:", error.message);

      return res.status(500).json({
        message: "Unable to accept the invitation.",
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

module.exports = router;
