const express = require("express");
const crypto = require("crypto");
const { Resend } = require("resend");
const rateLimit = require("express-rate-limit");
const pool = require("../config/db");
const writeAdminAuditLog = require("../utils/adminAuditLog");

const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");
const adminOwnerMiddleware = require("../middleware/adminOwnerMiddleware");

const router = express.Router();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const INVITATION_EXPIRY_HOURS = 24;
const FRONTEND_URL = process.env.FRONTEND_URL;

const invitationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many invitation requests. Please try again later.",
  },
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createInvitationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

// Only authenticated Owners can access these routes.
router.use(adminAuthMiddleware, adminOwnerMiddleware);

// Create and send an administrator invitation.
router.post("/invitations", invitationRateLimit, async (req, res) => {
  const body =
    req.body && typeof req.body === "object" ? req.body : {};

  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);

  if (!name || name.length > 100) {
    return res.status(400).json({
      message: "Name is required and must not exceed 100 characters.",
    });
  }

  if (!email || email.length > 150 || !isValidEmail(email)) {
    return res.status(400).json({
      message: "Please provide a valid email address.",
    });
  }

  if (!FRONTEND_URL) {
    return res.status(500).json({
      message: "Frontend URL is not configured.",
    });
  }

  let frontendUrl;

  try {
    frontendUrl = new URL(FRONTEND_URL);

    if (
      frontendUrl.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        frontendUrl.protocol === "http:"
      )
    ) {
      throw new Error("Invalid frontend URL protocol.");
    }
  } catch {
    return res.status(500).json({
      message: "Frontend URL configuration is invalid.",
    });
  }

  if (!resend) {
    return res.status(500).json({
      message: "Email service is not configured.",
    });
  }

  const invitationUrl = new URL(
    "/admin/accept-invitation",
    frontendUrl.origin
  );

  const invitationToken = createInvitationToken();
  const tokenHash = hashInvitationToken(invitationToken);

  const expiresAt = new Date(
    Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000
  );

  invitationUrl.searchParams.set("token", invitationToken);

  let client;

  try {
    client = await pool.connect();
  } catch (error) {
    console.error(
      "Invitation database connection error:",
      error.message
    );

    return res.status(500).json({
      message: "Unable to connect to the database.",
    });
  }

  let invitationId;

  try {
    await client.query("BEGIN");

    // Prevent simultaneous invitations for the same email.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [email]
    );

    // Revoke expired, unused invitations.
    await client.query(
      `UPDATE admin_invitations
       SET revoked_at = NOW()
       WHERE LOWER(email) = $1
         AND accepted_at IS NULL
         AND revoked_at IS NULL
         AND expires_at <= NOW()`,
      [email]
    );

    // Check whether an administrator already exists.
    const existingAdmin = await client.query(
      `SELECT 1
       FROM admins
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email]
    );

    if (existingAdmin.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "An admin account with this email already exists.",
      });
    }

    // Check whether an active invitation already exists.
    const existingInvitation = await client.query(
      `SELECT 1
       FROM admin_invitations
       WHERE LOWER(email) = $1
         AND accepted_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [email]
    );

    if (existingInvitation.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "An active invitation already exists for this email.",
      });
    }

    // Store only the hashed invitation token.
    const insertedInvitation = await client.query(
      `INSERT INTO admin_invitations
         (email, name, token_hash, invited_by_admin_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [email, name, tokenHash, req.admin.id, expiresAt]
    );

    invitationId = insertedInvitation.rows[0].id;

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Invitation rollback error:",
        rollbackError.message
      );
    }

    console.error("Invitation creation error:", error.message);

    return res.status(500).json({
      message: "Unable to create admin invitation.",
    });
  } finally {
    client.release();
  }

  // Send invitation email after the database transaction commits.
  try {
    const safeName = escapeHtml(name);
    const safeLink = escapeHtml(invitationUrl.toString());

    const { error } = await resend.emails.send({
      from: "The Plant Park <noreply@theplantspark.com>",
      to: [email],
      subject: "You're invited to join The Plant Park admin team",

      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Welcome to The Plant Park</h2>

          <p>Hello ${safeName},</p>

          <p>
            You have been invited to join The Plant Park as an administrator.
          </p>

          <p>
            Click the button below to accept your invitation and set your password.
          </p>

          <p>
            <a
              href="${safeLink}"
              style="display: inline-block; padding: 12px 24px;
              background-color: #247a45; color: white;
              text-decoration: none; border-radius: 6px;"
            >
              Accept Invitation
            </a>
          </p>

          <p>This invitation expires in ${INVITATION_EXPIRY_HOURS} hours.</p>

          <p>
            If you were not expecting this invitation, you can ignore this email.
          </p>

          <p>Regards,<br />The Plant Park Team</p>
        </div>
      `,

      text: `Hello ${name},

You have been invited to join The Plant Park as an administrator.

Accept your invitation using this link:
${invitationUrl.toString()}

This invitation expires in ${INVITATION_EXPIRY_HOURS} hours.

The Plant Park Team`,
    });

    if (error) {
      throw new Error(error.message || "Email delivery failed.");
    }
  } catch (error) {
    console.error("Invitation email error:", error.message);

    // Revoke the invitation if email delivery fails.
    try {
      await pool.query(
        `UPDATE admin_invitations
         SET revoked_at = NOW()
         WHERE id = $1
           AND accepted_at IS NULL
           AND revoked_at IS NULL`,
        [invitationId]
      );
    } catch (revokeError) {
      console.error(
        "Invitation revocation error:",
        revokeError.message
      );
    }

    // Record failed email delivery.
    try {
      await writeAdminAuditLog({
        actorAdminId: req.admin.id,
        action: "invitation_email_failed",
        details: {
          invitationId,
          invitedEmail: email,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || null,
      });
    } catch (auditError) {
      console.error(
        "Invitation failure audit log error:",
        auditError.message
      );
    }

    return res.status(502).json({
      message: "Unable to send invitation email. Please try again.",
    });
  }

  // Record successful invitation email delivery.
  try {
    await writeAdminAuditLog({
      actorAdminId: req.admin.id,
      action: "invitation_created",
      details: {
        invitationId,
        invitedEmail: email,
        invitedName: name,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
    });
  } catch (auditError) {
    console.error(
      "Invitation audit log error:",
      auditError.message
    );
  }

  return res.status(201).json({
    message: "Invitation sent successfully.",
  });
});

module.exports = router;