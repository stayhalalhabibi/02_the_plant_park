
const express = require("express");
const crypto = require("crypto");

const razorpay = require("../config/razorpay");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ======================================================
// HELPERS
// ======================================================

function isValidId(value) {
    return Number.isSafeInteger(value) && value > 0;
}

function verifySignature(orderId, paymentId, signature, secret) {
    if (
        typeof orderId !== "string" ||
        typeof paymentId !== "string" ||
        typeof signature !== "string" ||
        !/^[a-fA-F0-9]{64}$/.test(signature)
    ) {
        return false;
    }

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest();

    const received = Buffer.from(signature, "hex");

    return (
        received.length === expected.length &&
        crypto.timingSafeEqual(expected, received)
    );
}

// ======================================================
// CREATE RAZORPAY ORDER
// POST /api/payments/create-order
// ======================================================

   router.post("/create-order", authMiddleware, async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const orderId = Number(req.body?.order_id);

        if (!isValidId(orderId) || orderId > 2147483647) {
            return res.status(400).json({
                message: "Valid order ID is required"
            });
        }

        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        // Serialize creation requests for this order.
        await client.query(
            "SELECT pg_advisory_xact_lock($1, $2)",
            [90210, orderId]
        );

        const result = await client.query(
            `
            SELECT
                id,
                total_amount,
                status,
                payment_status,
                razorpay_order_id,
                inventory_deducted
            FROM orders
            WHERE id = $1
              AND user_id = $2
            FOR UPDATE
            `,
            [orderId, req.user.id]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                message: "Order not found"
            });
        }

        const order = result.rows[0];

        if (
            order.status !== "pending" ||
            order.payment_status !== "pending" ||
            order.inventory_deducted
        ) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(409).json({
                message: "Order is not available for payment"
            });
        }

        const amount = Math.round(Number(order.total_amount) * 100);

        if (!Number.isSafeInteger(amount) || amount <= 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                message: "Invalid order amount"
            });
        }

        // Reuse the existing Razorpay order on retries.
        if (order.razorpay_order_id) {
            await client.query("COMMIT");
            transactionStarted = false;

            return res.json({
                message: "Existing Razorpay order retrieved",
                order: {
                    id: order.id,
                    amount,
                    currency: "INR",
                    razorpay_order_id: order.razorpay_order_id
                }
            });
        }

        // Keep the lock until the Razorpay ID is saved.
        const razorpayOrder = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: `order_${order.id}`
        });

        if (
            typeof razorpayOrder?.id !== "string" ||
            !/^order_[A-Za-z0-9]+$/.test(razorpayOrder.id) ||
            Number(razorpayOrder.amount) !== amount ||
            razorpayOrder.currency !== "INR"
        ) {
            throw new Error("Invalid Razorpay order details");
        }

        const updateResult = await client.query(
            `
            UPDATE orders
            SET razorpay_order_id = $1
            WHERE id = $2
              AND user_id = $3
              AND razorpay_order_id IS NULL
              AND payment_status = 'pending'
              AND status = 'pending'
              AND inventory_deducted = FALSE
            RETURNING id
            `,
            [razorpayOrder.id, order.id, req.user.id]
        );

        if (updateResult.rows.length !== 1) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(409).json({
                message: "Order changed during payment setup. Check its status before retrying."
            });
        }

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            message: "Razorpay order created successfully",
            order: {
                id: order.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                razorpay_order_id: razorpayOrder.id
            }
        });
    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Create-order rollback error:", rollbackError);
            }
        }

        console.error("Create Razorpay order error:", error);

        return res.status(500).json({
            message: "Failed to create Razorpay order"
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// ======================================================
// VERIFY PAYMENT AND DEDUCT INVENTORY ATOMICALLY
// POST /api/payments/verify-payment
// ======================================================

router.post("/verify-payment", authMiddleware, async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const {
            order_id,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body || {};

        const orderId = Number(order_id);

        if (
            !isValidId(orderId) ||
            typeof razorpay_order_id !== "string" ||
            typeof razorpay_payment_id !== "string" ||
            !/^order_[A-Za-z0-9]+$/.test(razorpay_order_id) ||
            !/^pay_[A-Za-z0-9]+$/.test(razorpay_payment_id) ||
            typeof razorpay_signature !== "string" ||
            !/^[a-fA-F0-9]{64}$/.test(razorpay_signature)
        ) {
            return res.status(400).json({
                message: "Valid payment details are required"
            });
        }

        const secret = process.env.RAZORPAY_KEY_SECRET;

        if (!secret) {
            console.error("Razorpay key secret is not configured");

            return res.status(500).json({
                message: "Payment verification is not configured"
            });
        }

        // 1. Verify the signature received from Razorpay Checkout.
        const signatureIsValid = verifySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            secret
        );

        if (!signatureIsValid) {
            return res.status(400).json({
                message: "Payment verification failed"
            });
        }

        // 2. Retrieve authoritative payment details from Razorpay.
        const payment = await razorpay.payments.fetch(
            razorpay_payment_id
        );

        if (payment.order_id !== razorpay_order_id) {
            return res.status(400).json({
                message: "Payment does not belong to this order"
            });
        }

        if (payment.status !== "captured") {
            return res.status(409).json({
                message: "Payment has not been captured",
                payment_status: payment.status
            });
        }

        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        // 3. Lock the order to prevent concurrent processing.
        const orderResult = await client.query(
            `
            SELECT
                id,
                user_id,
                total_amount,
                status,
                payment_status,
                razorpay_order_id,
                razorpay_payment_id,
                inventory_deducted
            FROM orders
            WHERE id = $1
              AND user_id = $2
            FOR UPDATE
            `,
            [orderId, req.user.id]
        );

        if (orderResult.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                message: "Order not found"
            });
        }

        const order = orderResult.rows[0];

        if (order.razorpay_order_id !== razorpay_order_id) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                message: "Razorpay order ID does not match"
            });
        }

        // 4. Verify amount and currency.
        const expectedAmount = Math.round(
            Number(order.total_amount) * 100
        );

        if (
            !Number.isSafeInteger(expectedAmount) ||
            expectedAmount <= 0 ||
            Number(payment.amount) !== expectedAmount ||
            payment.currency !== "INR"
        ) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                message: "Payment amount or currency does not match"
            });
        }

        // 5. Handle orders whose inventory was already deducted.
        if (order.inventory_deducted) {
            await client.query("COMMIT");
            transactionStarted = false;

            if (
                order.payment_status === "paid" &&
                order.razorpay_payment_id === razorpay_payment_id &&
                order.status === "confirmed"
            ) {
                return res.json({
                    message: "Payment and inventory already processed",
                    order_id: order.id,
                    payment_status: "paid",
                    status: "confirmed",
                    inventory_deducted: true
                });
            }

            return res.status(409).json({
                message: "Order inventory was already processed"
            });
        }

        // 6. A captured payment with an inventory issue must not
        // be charged or fulfilled again automatically.
        if (order.payment_status === "paid") {
            await client.query("COMMIT");
            transactionStarted = false;

            if (
                order.status === "inventory_issue" &&
                order.razorpay_payment_id === razorpay_payment_id
            ) {
                return res.status(409).json({
                    message:
                        "Payment is already recorded, but the inventory " +
                        "issue requires manual resolution or a refund.",
                    order_id: order.id,
                    payment_status: "paid",
                    status: "inventory_issue",
                    inventory_deducted: false,
                    requires_manual_resolution: true
                });
            }

            return res.status(409).json({
                message:
                    "A payment is already recorded for this order. " +
                    "Manual review is required."
            });
        }

        // 7. Only pending orders can be fulfilled.
        if (
            order.payment_status !== "pending" ||
            order.status !== "pending"
        ) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(409).json({
                message: "Order is not available for fulfillment"
            });
        }

        // 8. Aggregate quantities and lock plant rows in ID order.
        const itemsResult = await client.query(
            `
            SELECT
                p.id AS plant_id,
                p.name AS plant_name,
                p.stock,
                requested.quantity
            FROM (
                SELECT
                    plant_id,
                    SUM(quantity)::integer AS quantity
                FROM order_items
                WHERE order_id = $1
                GROUP BY plant_id
            ) AS requested
            JOIN plants p ON p.id = requested.plant_id
            ORDER BY p.id
            FOR UPDATE OF p
            `,
            [order.id]
        );

        // Record a captured payment that cannot be fulfilled.
        if (itemsResult.rows.length === 0) {
            await client.query(
                `
                UPDATE orders
                SET
                    payment_status = 'paid',
                    status = 'inventory_issue',
                    razorpay_payment_id = $1,
                    razorpay_signature = $2
                WHERE id = $3
                  AND user_id = $4
                `,
                [
                    razorpay_payment_id,
                    razorpay_signature,
                    order.id,
                    req.user.id
                ]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            return res.status(409).json({
                message:
                    "Payment was captured, but the order has no valid " +
                    "items. Manual resolution or a refund is required.",
                order_id: order.id,
                payment_status: "paid",
                status: "inventory_issue",
                inventory_deducted: false,
                requires_manual_resolution: true
            });
        }

        // 9. Check ALL items before deducting ANY stock.
        const unavailableItems = itemsResult.rows
            .filter((item) => {
                const quantity = Number(item.quantity);

                return (
                    !Number.isSafeInteger(quantity) ||
                    quantity <= 0 ||
                    item.stock === null ||
                    !Number.isSafeInteger(Number(item.stock)) ||
                    Number(item.stock) < quantity
                );
            })
            .map((item) => ({
                plant_id: item.plant_id,
                plant_name: item.plant_name,
                requested: Number(item.quantity),
                available:
                    item.stock === null ? null : Number(item.stock)
            }));

        if (unavailableItems.length > 0) {
            // The payment was captured, so record it accurately.
            // Do not deduct any stock from an unfulfillable order.
            await client.query(
                `
                UPDATE orders
                SET
                    payment_status = 'paid',
                    status = 'inventory_issue',
                    razorpay_payment_id = $1,
                    razorpay_signature = $2
                WHERE id = $3
                  AND user_id = $4
                `,
                [
                    razorpay_payment_id,
                    razorpay_signature,
                    order.id,
                    req.user.id
                ]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            return res.status(409).json({
                message:
                    "Payment was captured, but inventory is insufficient. " +
                    "Manual resolution or a refund is required.",
                order_id: order.id,
                payment_status: "paid",
                status: "inventory_issue",
                inventory_deducted: false,
                requires_manual_resolution: true,
                unavailable_items: unavailableItems
            });
        }

        // 10. Deduct stock transactionally.
        for (const item of itemsResult.rows) {
            const quantity = Number(item.quantity);

            const deduction = await client.query(
                `
                UPDATE plants
                SET stock = stock - $1
                WHERE id = $2
                  AND stock IS NOT NULL
                  AND stock >= $1
                RETURNING id
                `,
                [quantity, item.plant_id]
            );

            if (deduction.rows.length !== 1) {
                throw new Error(
                    `Inventory deduction failed for plant ${item.plant_id}`
                );
            }
        }

        // 11. Mark payment and inventory as complete.
        await client.query(
            `
            UPDATE orders
            SET
                payment_status = 'paid',
                status = 'confirmed',
                inventory_deducted = TRUE,
                razorpay_payment_id = $1,
                razorpay_signature = $2
            WHERE id = $3
              AND user_id = $4
            `,
            [
                razorpay_payment_id,
                razorpay_signature,
                order.id,
                req.user.id
            ]
        );

        // 12. Clear matching cart items only.
        await client.query(
            `
            DELETE FROM cart_items ci
            USING (
                SELECT
                    plant_id,
                    SUM(quantity)::integer AS quantity
                FROM order_items
                WHERE order_id = $1
                GROUP BY plant_id
            ) oi
            WHERE ci.user_id = $2
              AND ci.plant_id = oi.plant_id
              AND ci.quantity = oi.quantity
            `,
            [order.id, req.user.id]
        );

        // Commit stock, payment, and order changes together.
        await client.query("COMMIT");
        transactionStarted = false;

        return res.json({
            message:
                "Payment verified and inventory updated successfully",
            order_id: order.id,
            payment_status: "paid",
            status: "confirmed",
            inventory_deducted: true
        });
    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Payment rollback error:", rollbackError);
            }
        }

        console.error("Payment verification error:", error);

        return res.status(500).json({
            message:
                "Order processing did not finish. Check the order status " +
                "before retrying or initiating another payment."
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

module.exports = router;
