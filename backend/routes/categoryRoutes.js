const express = require("express");
const pool = require("../config/db");

const router = express.Router();

// GET all categories
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                name,
                description
            FROM categories
            ORDER BY id ASC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("❌ Error fetching categories:", error);

        res.status(500).json({
            message: "Failed to fetch categories"
        });
    }
});

module.exports = router;