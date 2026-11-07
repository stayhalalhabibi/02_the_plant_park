
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env.owner"),
});

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const pool = require("../config/db");

const OWNER_LOCK_ID = 20261105;
const NEW_OWNER_NAME = String(process.env.NEW_OWNER_NAME || "").trim();
async function updateOwnerName() {
  let client;
  if (!NEW_OWNER_NAME || NEW_OWNER_NAME.length > 100) {
  throw new Error(
    "Set NEW_OWNER_NAME with a valid name (1–100 characters)."
  );
}
  let lockAcquired = false;

  try {
    client = await pool.connect();

    // Prevent conflicts with the Owner creation script.
    await client.query(
      "SELECT pg_advisory_lock($1)",
      [OWNER_LOCK_ID]
    );

    lockAcquired = true;

    await client.query("BEGIN");

    // Find and lock the existing Owner account.
    const ownerResult = await client.query(
      `SELECT id, name, email, role
       FROM admins
       WHERE role = 'owner'
       FOR UPDATE`
    );

    if (ownerResult.rows.length === 0) {
      throw new Error("No Owner account found.");
    }

    if (ownerResult.rows.length > 1) {
      throw new Error(
        "Multiple Owner accounts found. Name update cancelled."
      );
    }

    const ownerId = ownerResult.rows[0].id;

    // Update only the Owner's name.
    const result = await client.query(
      `UPDATE admins
       SET name = $1
       WHERE id = $2
         AND role = 'owner'
       RETURNING id, name, email, role`,
      [NEW_OWNER_NAME, ownerId]
    );

    if (result.rows.length !== 1) {
      throw new Error(
        "Owner name update could not be completed."
      );
    }

    await client.query("COMMIT");

    console.log("Owner name updated successfully:");
    console.log(result.rows[0]);
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Rollback failed:",
          rollbackError.message
        );
      }
    }

    console.error(
      "Owner name update failed:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    if (client) {
      if (lockAcquired) {
        try {
          await client.query(
            "SELECT pg_advisory_unlock($1)",
            [OWNER_LOCK_ID]
          );
        } catch (unlockError) {
          console.error(
            "Advisory lock release failed:",
            unlockError.message
          );
        }
      }

      client.release();
    }

    await pool.end();
  }
}

updateOwnerName();
