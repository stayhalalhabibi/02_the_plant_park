
const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Validate positive whole-number quantities and IDs.
function isPositiveInteger(value) {
    return (
        (typeof value === "number" ||
            (typeof value === "string" && value.trim() !== "")) &&
        Number.isSafeInteger(Number(value)) &&
        Number(value) > 0
    );
}

// GET USER CART
router.get("/", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                ci.id,
                ci.plant_id,
                p.name,
                p.description,
                p.price,
                p.image_url,
                ci.quantity,
                (p.price * ci.quantity) AS subtotal,
                p.stock
            FROM cart_items ci
            JOIN plants p ON ci.plant_id = p.id
            WHERE ci.user_id = $1
            ORDER BY ci.id ASC
            `,
            [req.user.id]
        );

        return res.json(result.rows);
    } catch (error) {
        console.error("Error fetching cart:", error);
        return res.status(500).json({
            message: "Failed to fetch cart"
        });
    }
});

// ADD ITEM TO CART
router.post("/", authMiddleware, async (req, res) => {
    const { plant_id, quantity } = req.body || {};

    if (!isPositiveInteger(plant_id) || !isPositiveInteger(quantity)) {
        return res.status(400).json({
            message: "Plant ID and a positive whole-number quantity are required"
        });
    }

    const plantId = Number(plant_id);
    const requestedQuantity = Number(quantity);
    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        // Lock the plant row to serialize stock-sensitive cart changes.
        const plantResult = await client.query(
            `SELECT id, name, price, stock
             FROM plants
             WHERE id = $1
             FOR UPDATE`,
            [plantId]
        );

        if (plantResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Plant not found"
            });
        }

        const plant = plantResult.rows[0];

        const existingResult = await client.query(
            `SELECT id, quantity
             FROM cart_items
             WHERE user_id = $1 AND plant_id = $2
             FOR UPDATE`,
            [req.user.id, plantId]
        );

        const existingQuantity = existingResult.rows.length
            ? Number(existingResult.rows[0].quantity)
            : 0;

        const totalQuantity = existingQuantity + requestedQuantity;

        if (
            plant.stock === null ||
            totalQuantity > Number(plant.stock)
        ) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: `Only ${plant.stock ?? 0} units available in stock`,
                available_stock: plant.stock ?? 0,
                cart_quantity: existingQuantity
            });
        }

        const result = await client.query(
            `
            INSERT INTO cart_items (user_id, plant_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, plant_id)
            DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
            RETURNING *
            `,
            [req.user.id, plantId, requestedQuantity]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            message: "Item added to cart",
            cartItem: result.rows[0]
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Cart rollback error:", rollbackError);
            }
        }

        console.error("Error adding item to cart:", error);
        return res.status(500).json({
            message: "Failed to add item to cart"
        });
    } finally {
        if (client) client.release();
    }
});

// UPDATE CART ITEM QUANTITY
router.put("/:id", authMiddleware, async (req, res) => {
    const { quantity } = req.body || {};
    const cartItemId = req.params.id;

    if (!isPositiveInteger(cartItemId) || !isPositiveInteger(quantity)) {
        return res.status(400).json({
            message: "Cart item ID and a positive whole-number quantity are required"
        });
    }

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const cartResult = await client.query(
            `SELECT ci.id, ci.plant_id, p.name, p.stock
             FROM cart_items ci
             JOIN plants p ON p.id = ci.plant_id
             WHERE ci.id = $1 AND ci.user_id = $2
             FOR UPDATE OF ci, p`,
            [Number(cartItemId), req.user.id]
        );

        if (cartResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Cart item not found"
            });
        }

        const item = cartResult.rows[0];
        const requestedQuantity = Number(quantity);

        if (
            item.stock === null ||
            requestedQuantity > Number(item.stock)
        ) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: `Only ${item.stock ?? 0} units available in stock`,
                available_stock: item.stock ?? 0
            });
        }

        const result = await client.query(
            `UPDATE cart_items
             SET quantity = $1
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
            [requestedQuantity, Number(cartItemId), req.user.id]
        );

        await client.query("COMMIT");

        return res.json({
            message: "Cart quantity updated",
            cartItem: result.rows[0]
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Cart rollback error:", rollbackError);
            }
        }

        console.error("Error updating cart:", error);
        return res.status(500).json({
            message: "Failed to update cart"
        });
    } finally {
        if (client) client.release();
    }
});

// REMOVE ITEM FROM CART
router.delete("/:id", authMiddleware, async (req, res) => {
    const cartItemId = req.params.id;

    if (!isPositiveInteger(cartItemId)) {
        return res.status(400).json({
            message: "Invalid cart item ID"
        });
    }

    try {
        const result = await pool.query(
            `DELETE FROM cart_items
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [Number(cartItemId), req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Cart item not found"
            });
        }

        return res.json({
            message: "Item removed from cart",
            cartItem: result.rows[0]
        });
    } catch (error) {
        console.error("Error removing cart item:", error);
        return res.status(500).json({
            message: "Failed to remove cart item"
        });
    }
});

module.exports = router;
