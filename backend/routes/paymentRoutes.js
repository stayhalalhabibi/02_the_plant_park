const express = require("express");
const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// CREATE RAZORPAY ORDER
router.post("/create-order", authMiddleware, async (req, res) => {
    try {
        const { order_id } = req.body;

        if (!order_id) {
            return res.status(400).json({
                message: "Order ID is required"
            });
        }

        const result = await pool.query(
            `
            SELECT
                id,
                total_amount,
                status,
                payment_status
            FROM orders
            WHERE id = $1
            AND user_id = $2
            `,
            [order_id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        const order = result.rows[0];

        if (order.payment_status === "paid") {
            return res.status(400).json({
                message: "Order is already paid"
            });
        }

        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(Number(order.total_amount) * 100),
            currency: "INR",
            receipt: `order_${order.id}`
        });

        await pool.query(
    `
    UPDATE orders
    SET razorpay_order_id = $1
    WHERE id = $2
    AND user_id = $3
    `,
    [
        razorpayOrder.id,
        order.id,
        req.user.id
    ]
);

        res.status(201).json({
            message: "Razorpay order created successfully",
            order: {
                id: order.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                razorpay_order_id: razorpayOrder.id
            }
        });

    } catch (error) {
        console.error("❌ Razorpay order creation error:", error);

        res.status(500).json({
            message: "Failed to create Razorpay order"
        });
    }
});

// VERIFY RAZORPAY PAYMENT
router.post("/verify", authMiddleware, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                message: "Payment verification details are required"
            });
        }

        const result = await pool.query(
            `
            SELECT id, payment_status
            FROM orders
            WHERE razorpay_order_id = $1
            AND user_id = $2
            `,
            [razorpay_order_id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        const order = result.rows[0];

        if (order.payment_status === "paid") {
            return res.status(400).json({
                message: "Order is already paid"
            });
        }

        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(
                `${razorpay_order_id}|${razorpay_payment_id}`
            )
            .digest("hex");

           const generatedSignatureBuffer = Buffer.from(generatedSignature);
const receivedSignatureBuffer = Buffer.from(razorpay_signature);

const isSignatureValid =
    generatedSignatureBuffer.length === receivedSignatureBuffer.length &&
    crypto.timingSafeEqual(
        generatedSignatureBuffer,
        receivedSignatureBuffer
    );

if (!isSignatureValid) {
    return res.status(400).json({
        message: "Payment verification failed"
    });
}

        await pool.query(
            `
            UPDATE orders
            SET
                payment_status = 'paid',
                status = 'confirmed',
                razorpay_payment_id = $1,
                razorpay_signature = $2
            WHERE id = $3
            `,
            [
                razorpay_payment_id,
                razorpay_signature,
                order.id
            ]
        );

        res.json({
            message: "Payment verified successfully",
            order_id: order.id,
            payment_status: "paid",
            status: "confirmed"
        });

    } catch (error) {
        console.error("❌ Payment verification error:", error);

        res.status(500).json({
            message: "Payment verification failed"
        });
    }
});

module.exports = router;