const express = require("express");
const pool = require("../config/db");

const router = express.Router();

// GET all plants
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                plants.id,
                plants.name,
                plants.description,
                plants.price,
                plants.image_url,
                plants.stock,
                categories.name AS category
            FROM plants
            LEFT JOIN categories
            ON plants.category_id = categories.id
            ORDER BY plants.id ASC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("❌ Error fetching plants:", error);
        res.status(500).json({
            message: "Failed to fetch plants"
        });
    }
});

module.exports = router;