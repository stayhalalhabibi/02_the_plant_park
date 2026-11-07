
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env.owner"),
});

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const pool = require("../config/db");

async function checkOwner() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS owner_count
       FROM admins
       WHERE role = $1`,
      ["owner"]
    );

    console.log(
      "Existing Owner accounts:",
      result.rows[0].owner_count
    );
  } catch (error) {
    console.error("Owner check failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkOwner();
