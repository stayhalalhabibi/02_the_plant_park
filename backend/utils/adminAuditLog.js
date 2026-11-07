const pool = require("../config/db");

async function writeAdminAuditLog({
  actorAdminId = null,
  action,
  targetAdminId = null,
  details = {},
  ipAddress = null,
  userAgent = null,
}) {
  if (!action || typeof action !== "string") {
    throw new Error("Audit log action is required.");
  }

  await pool.query(
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
      ipAddress,
      userAgent,
    ]
  );
}

module.exports = writeAdminAuditLog;