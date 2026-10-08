const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// GET USER FAVORITES
router.get("/", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                favorites.id,
                favorites.plant_id,
                plants.name,
                plants.description,
                plants.price,
                plants.image_url,
                plants.stock,
                categories.name AS category
            FROM favorites
            JOIN plants
                ON favorites.plant_id = plants.id
            LEFT JOIN categories
                ON plants.category_id = categories.id
            WHERE favorites.user_id = $1
            ORDER BY favorites.id ASC
            `,
            [req.user.id]
        );

        res.json(result.rows);

    } catch (error) {
        console.error("❌ Error fetching favorites:", error);

        res.status(500).json({
            message: "Failed to fetch favorites"
        });
    }
});

// ADD PLANT TO FAVORITES
router.post("/", authMiddleware, async (req, res) => {
    try {
        const { plant_id } = req.body;

        if (!plant_id) {
            return res.status(400).json({
                message: "Plant ID is required"
            });
        }

        // Check if plant exists
        const plant = await pool.query(
            "SELECT id, name FROM plants WHERE id = $1",
            [plant_id]
        );

        if (plant.rows.length === 0) {
            return res.status(404).json({
                message: "Plant not found"
            });
        }

        // Add favorite
        const result = await pool.query(
            `
            INSERT INTO favorites (user_id, plant_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, plant_id)
            DO NOTHING
            RETURNING *
            `,
            [req.user.id, plant_id]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({
                message: "Plant already in favorites"
            });
        }

        res.status(201).json({
            message: "Plant added to favorites",
            favorite: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Error adding favorite:", error);

        res.status(500).json({
            message: "Failed to add favorite"
        });
    }
});

// REMOVE PLANT FROM FAVORITES
router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        const favoriteId = req.params.id;

        const result = await pool.query(
            `
            DELETE FROM favorites
            WHERE id = $1
            AND user_id = $2
            RETURNING *
            `,
            [favoriteId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Favorite not found"
            });
        }

        res.json({
            message: "Plant removed from favorites",
            favorite: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Error removing favorite:", error);

        res.status(500).json({
            message: "Failed to remove favorite"
        });
    }
});



module.exports = router;