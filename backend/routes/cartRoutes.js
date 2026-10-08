const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// GET USER CART
router.get("/", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                cart_items.id,
                cart_items.plant_id,
                plants.name,
                plants.description,
                plants.price,
                plants.image_url,
                cart_items.quantity,
                (plants.price * cart_items.quantity) AS subtotal
            FROM cart_items
            JOIN plants
            ON cart_items.plant_id = plants.id
            WHERE cart_items.user_id = $1
            ORDER BY cart_items.id ASC
            `,
            [req.user.id]
        );

        res.json(result.rows);

    } catch (error) {
        console.error("❌ Error fetching cart:", error);

        res.status(500).json({
            message: "Failed to fetch cart"
        });
    }
});

// ADD ITEM TO CART
router.post("/", authMiddleware, async (req, res) => {
    try {
        const { plant_id, quantity } = req.body;

        if (!plant_id || !quantity || quantity < 1) {
            return res.status(400).json({
                message: "Plant ID and valid quantity are required"
            });
        }

        const plant = await pool.query(
            "SELECT id, name, price, stock FROM plants WHERE id = $1",
            [plant_id]
        );

        if (plant.rows.length === 0) {
            return res.status(404).json({
                message: "Plant not found"
            });
        }

        // Check existing cart quantity
const existingCartItem = await pool.query(
    `
    SELECT quantity
    FROM cart_items
    WHERE user_id = $1
    AND plant_id = $2
    `,
    [req.user.id, plant_id]
);

const existingQuantity =
    existingCartItem.rows.length > 0
        ? existingCartItem.rows[0].quantity
        : 0;

const totalQuantity = existingQuantity + quantity;

// Check total quantity against stock
if (totalQuantity > plant.rows[0].stock) {
    return res.status(400).json({
        message: `Only ${plant.rows[0].stock} units available in stock`
    });
}

        const result = await pool.query(
            `
            INSERT INTO cart_items (user_id, plant_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, plant_id)
            DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
            RETURNING *
            `,
            [req.user.id, plant_id, quantity]
        );

        res.status(201).json({
            message: "Item added to cart",
            cartItem: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Error adding item to cart:", error);

        res.status(500).json({
            message: "Failed to add item to cart"
        });
    }
});

// UPDATE CART ITEM QUANTITY
router.put("/:id", authMiddleware, async (req, res) => {
    try {
        const { quantity } = req.body;
        const cartItemId = req.params.id;

        if (!quantity || quantity < 1) {
            return res.status(400).json({
                message: "Valid quantity is required"
            });
        }

        // Get cart item with plant stock
        const cartItem = await pool.query(
            `
            SELECT
                cart_items.id,
                cart_items.plant_id,
                plants.stock
            FROM cart_items
            JOIN plants
                ON cart_items.plant_id = plants.id
            WHERE cart_items.id = $1
            AND cart_items.user_id = $2
            `,
            [cartItemId, req.user.id]
        );

        if (cartItem.rows.length === 0) {
            return res.status(404).json({
                message: "Cart item not found"
            });
        }

        const availableStock = cartItem.rows[0].stock;

        // Check requested quantity against stock
        if (quantity > availableStock) {
            return res.status(400).json({
                message: `Only ${availableStock} units available in stock`
            });
        }

        const result = await pool.query(
            `
            UPDATE cart_items
            SET quantity = $1
            WHERE id = $2
            AND user_id = $3
            RETURNING *
            `,
            [quantity, cartItemId, req.user.id]
        );

        res.json({
            message: "Cart quantity updated",
            cartItem: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Error updating cart:", error);

        res.status(500).json({
            message: "Failed to update cart"
        });
    }
});

// REMOVE ITEM FROM CART
router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        const cartItemId = req.params.id;

        const result = await pool.query(
            `
            DELETE FROM cart_items
            WHERE id = $1
            AND user_id = $2
            RETURNING *
            `,
            [cartItemId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Cart item not found"
            });
        }

        res.json({
            message: "Item removed from cart",
            cartItem: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Error removing cart item:", error);

        res.status(500).json({
            message: "Failed to remove cart item"
        });
    }
});

module.exports = router;