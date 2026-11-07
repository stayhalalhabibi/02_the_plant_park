const pool = require("../config/db");

function requireAdminPermission(permissionKey) {
  return async function (req, res, next) {
    try {
      if (!req.admin) {
        return res.status(401).json({
          message: "Admin authentication required.",
        });
      }

      // Owner always has full access.
      if (req.admin.role === "owner") {
        return next();
      }

      const result = await pool.query(
        `SELECT 1
         FROM admin_permission_assignments apa
         INNER JOIN admin_permissions ap
           ON ap.id = apa.permission_id
         WHERE apa.admin_id = $1
           AND ap.permission_key = $2
         LIMIT 1`,
        [req.admin.id, permissionKey]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({
          message: "You do not have permission to perform this action.",
        });
      }

      return next();
    } catch (error) {
      console.error("Admin permission error:", error.message);

      return res.status(500).json({
        message: "Unable to verify admin permissions.",
      });
    }
  };
}

module.exports = requireAdminPermission;