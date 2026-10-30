
const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const { calculatePricing } = require("../utils/pricing");

const router = express.Router();

// GET SINGLE ORDER DETAILS
router.get("/:id", authMiddleware, async (req, res) => {
    try {
        const orderId = Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({
                message: "Invalid order ID"
            });
        }

        const orderResult = await pool.query(

            `SELECT id, total_amount, subtotal_amount,
        bundle_discount, percentage_discount, shipping_fee,
        status, payment_status, inventory_deducted,
        shipping_address, created_at
 FROM orders

             WHERE id = $1 AND user_id = $2`,
            [orderId, req.user.id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        const itemsResult = await pool.query(
            `SELECT oi.id, oi.plant_id, p.name, oi.quantity, oi.price,
                    (oi.quantity * oi.price) AS subtotal
             FROM order_items oi
             JOIN plants p ON oi.plant_id = p.id
             WHERE oi.order_id = $1
             ORDER BY oi.id ASC`,
            [orderId]
        );

        return res.json({
            order: orderResult.rows[0],
            items: itemsResult.rows
        });
    } catch (error) {
        console.error("Error fetching order details:", error);

        return res.status(500).json({
            message: "Failed to fetch order details"
        });
    }
});

// GET USER ORDERS
router.get("/", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, total_amount, subtotal_amount,
                    bundle_discount, percentage_discount, shipping_fee,
                    status, payment_status, shipping_address, created_at
             FROM orders
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );

        return res.json(result.rows);
    } catch (error) {
        console.error("Error fetching orders:", error);

        return res.status(500).json({
            message: "Failed to fetch orders"
        });
    }
});

// CREATE ORDER FROM CART
// Prices come from the database.
// Stock is checked here but is not deducted until payment is verified.
router.post("/", authMiddleware, async (req, res) => {
    let client;

    try {
        const shippingAddress =
            typeof req.body?.shipping_address === "string"
                ? req.body.shipping_address.trim()
                : "";

        if (!shippingAddress) {
            return res.status(400).json({
                message: "Shipping address is required"
            });
        }

        client = await pool.connect();
        await client.query("BEGIN");

        const cartResult = await client.query(
            `SELECT ci.plant_id, ci.quantity, p.name, p.price, p.stock
             FROM cart_items ci
             JOIN plants p ON p.id = ci.plant_id
             WHERE ci.user_id = $1
             ORDER BY ci.plant_id
             FOR UPDATE OF ci, p`,
            [req.user.id]
        );

        if (cartResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Cart is empty"
            });
        }

        for (const item of cartResult.rows) {
            if (
                !Number.isInteger(Number(item.quantity)) ||
                Number(item.quantity) <= 0 ||
                !Number.isInteger(Number(item.stock)) ||
                Number(item.stock) < Number(item.quantity)
            ) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: `Not enough stock for ${item.name}`
                });
            }
        }

        // Calculate all promotions using trusted database prices.
        let pricing;

        try {
            pricing = calculatePricing(cartResult.rows);
        } catch (pricingError) {
            console.error("Order pricing error:", pricingError);

            await client.query("ROLLBACK");

            return res.status(500).json({
                message: "Unable to calculate order pricing"
            });
        }

        const orderResult = await client.query(
            `INSERT INTO orders
                (
                    user_id,
                    total_amount,
                    subtotal_amount,
                    bundle_discount,
                    percentage_discount,
                    shipping_fee,
                    shipping_address
                )
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                req.user.id,
                pricing.total_amount,
                pricing.subtotal_amount,
                pricing.bundle_discount,
                pricing.percentage_discount,
                pricing.shipping_fee,
                shippingAddress
            ]
        );

        const order = orderResult.rows[0];

        // Save original unit prices for order history and auditing.
        for (const item of cartResult.rows) {
            await client.query(
                `INSERT INTO order_items
                    (order_id, plant_id, quantity, price)
                 VALUES ($1, $2, $3, $4)`,
                [
                    order.id,
                    item.plant_id,
                    item.quantity,
                    item.price
                ]
            );
        }

        // Keep the cart and stock unchanged until payment succeeds.
        await client.query("COMMIT");

        return res.status(201).json({
            message: "Order created successfully. Payment is pending.",
            order
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Order rollback error:", rollbackError);
            }
        }

        console.error("Error creating order:", error);

        return res.status(500).json({
            message: "Failed to create order"
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

module.exports = router;
