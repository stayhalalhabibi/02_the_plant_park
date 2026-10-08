const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// GET SINGLE ORDER DETAILS
router.get("/:id", authMiddleware, async (req, res) => {
    try {
        const orderId = req.params.id;

        // Get order
        const orderResult = await pool.query(
            `
            SELECT
                orders.id,
                orders.total_amount,
                orders.status,
                orders.payment_status,
                orders.shipping_address,
                orders.created_at
            FROM orders
            WHERE orders.id = $1
            AND orders.user_id = $2
            `,
            [orderId, req.user.id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        // Get order items
        const itemsResult = await pool.query(
            `
            SELECT
                order_items.id,
                order_items.plant_id,
                plants.name,
                order_items.quantity,
                order_items.price,
                (order_items.quantity * order_items.price) AS subtotal
            FROM order_items
            JOIN plants
                ON order_items.plant_id = plants.id
            WHERE order_items.order_id = $1
            ORDER BY order_items.id ASC
            `,
            [orderId]
        );

        res.json({
            order: orderResult.rows[0],
            items: itemsResult.rows
        });

    } catch (error) {
        console.error("❌ Error fetching order details:", error);

        res.status(500).json({
            message: "Failed to fetch order details"
        });
    }
});

// GET USER ORDERS
router.get("/", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                orders.id,
                orders.total_amount,
                orders.status,
                orders.payment_status,
                orders.shipping_address,
                orders.created_at
            FROM orders
            WHERE orders.user_id = $1
            ORDER BY orders.created_at DESC
            `,
            [req.user.id]
        );

        res.json(result.rows);

    } catch (error) {
        console.error("❌ Error fetching orders:", error);

        res.status(500).json({
            message: "Failed to fetch orders"
        });
    }
});

// CREATE ORDER FROM CART
router.post("/", authMiddleware, async (req, res) => {
    const client = await pool.connect();

    try {
        const { shipping_address } = req.body;

        if (!shipping_address) {
            return res.status(400).json({
                message: "Shipping address is required"
            });
        }

        await client.query("BEGIN");

        // Get user's cart
        const cartResult = await client.query(
            `
            SELECT
                cart_items.plant_id,
                cart_items.quantity,
                plants.name,
                plants.price,
                plants.stock
            FROM cart_items
            JOIN plants
                ON cart_items.plant_id = plants.id
            WHERE cart_items.user_id = $1
            FOR UPDATE
            `,
            [req.user.id]
        );

        if (cartResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Cart is empty"
            });
        }

        // Check stock
        for (const item of cartResult.rows) {
            if (item.stock < item.quantity) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    message: `Not enough stock for ${item.name}`
                });
            }
        }

        // Calculate total
        const totalAmount = cartResult.rows.reduce(
            (total, item) =>
                total + Number(item.price) * item.quantity,
            0
        );

        // Create order
        const orderResult = await client.query(
            `
            INSERT INTO orders
                (user_id, total_amount, shipping_address)
            VALUES
                ($1, $2, $3)
            RETURNING *
            `,
            [req.user.id, totalAmount, shipping_address]
        );

        const order = orderResult.rows[0];

        // Create order items and reduce stock
        for (const item of cartResult.rows) {
            await client.query(
                `
                INSERT INTO order_items
                    (order_id, plant_id, quantity, price)
                VALUES
                    ($1, $2, $3, $4)
                `,
                [
                    order.id,
                    item.plant_id,
                    item.quantity,
                    item.price
                ]
            );

            await client.query(
                `
                UPDATE plants
                SET stock = stock - $1
                WHERE id = $2
                `,
                [item.quantity, item.plant_id]
            );
        }

        // Clear cart
        await client.query(
            "DELETE FROM cart_items WHERE user_id = $1",
            [req.user.id]
        );

        await client.query("COMMIT");

        res.status(201).json({
            message: "Order created successfully",
            order
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("❌ Error creating order:", error);

        res.status(500).json({
            message: "Failed to create order"
        });

    } finally {
        client.release();
    }
});

module.exports = router;