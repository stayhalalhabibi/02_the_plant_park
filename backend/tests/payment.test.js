
const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");

// ======================================================
// TEST ENVIRONMENT
// ======================================================

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "payment-test-secret";
process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET = "dummy-secret";
process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/test_db";

// ======================================================
// APPLICATION IMPORTS
// ======================================================

const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const razorpay = require("../config/razorpay");
const paymentRoutes = require("../routes/paymentRoutes");

// ======================================================
// TEST SERVER HELPERS
// ======================================================

async function startTestServer() {
    const app = express();

    app.use(express.json());
    app.use("/api/payments", paymentRoutes);

    const server = app.listen(0, "127.0.0.1");

    await once(server, "listening");

    const address = server.address();

    return {
        server,
        url: `http://127.0.0.1:${address.port}`
    };
}

async function closeTestServer(server) {
    await new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

// ======================================================
// TEST 1: UNAUTHENTICATED PAYMENT REQUEST
// ======================================================

test(
    "rejects unauthenticated payment order creation",
    async () => {
        const { server, url } = await startTestServer();

        try {
            const response = await fetch(
                `${url}/api/payments/create-order`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        order_id: 1
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 401);

            assert.equal(
                data.message,
                "Authentication token required"
            );
        } finally {
            await closeTestServer(server);
        }
    }
);

// ======================================================
// TEST 2: AUTHENTICATED RAZORPAY ORDER CREATION
// ======================================================

test(
    "creates a Razorpay order for an authenticated customer",
    async () => {
        let razorpayPayload = null;
        let razorpayCallCount = 0;
        let released = false;

        const queries = [];

        // --------------------------------------------------
        // MOCK POSTGRESQL CLIENT
        // --------------------------------------------------

        const fakeClient = {
            async query(sql, params = []) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push({
                    sql: normalized,
                    params
                });

                // Transaction commands.
                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT" ||
                    normalized === "ROLLBACK"
                ) {
                    return { rows: [] };
                }

                // Advisory transaction lock.
                if (
                    normalized.includes(
                        "pg_advisory_xact_lock"
                    )
                ) {
                    return { rows: [] };
                }

                // Fetch customer's pending order.
                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                // Check inactive plants.
                if (
                    normalized.includes("FROM order_items oi") &&
                    normalized.includes("p.is_active = FALSE")
                ) {
                    return { rows: [] };
                }

                // Update Razorpay order ID.
                if (
                    normalized.startsWith("UPDATE orders") &&
                    normalized.includes("razorpay_order_id = $1")
                ) {
                    return {
                        rows: [{ id: 42 }]
                    };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        // --------------------------------------------------
        // MOCK DATABASE CONNECTION
        // --------------------------------------------------

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        // --------------------------------------------------
        // MOCK RAZORPAY ORDER CREATION
        // --------------------------------------------------

        const createMock = mock.method(
            razorpay.orders,
            "create",
            async (payload) => {
                razorpayPayload = payload;
                razorpayCallCount++;

                return {
                    id: "order_test123",
                    amount: payload.amount,
                    currency: payload.currency
                };
            }
        );

        let server;

        try {
            // Start isolated Express server.
            const result = await startTestServer();

            server = result.server;

            // Create authenticated customer token.
            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            // Send payment-order request.
            const response = await fetch(
                `${result.url}/api/payments/create-order`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42
                    })
                }
            );

            // Read API response.
            const data = await response.json();

            // --------------------------------------------------
            // VERIFY HTTP RESPONSE
            // --------------------------------------------------

            assert.equal(response.status, 201);

            assert.equal(
                data.message,
                "Razorpay order created successfully"
            );

            // --------------------------------------------------
            // VERIFY ORDER DETAILS
            // --------------------------------------------------

            assert.equal(data.order.id, 42);
            assert.equal(data.order.amount, 59900);
            assert.equal(data.order.currency, "INR");

            assert.equal(
                data.order.razorpay_order_id,
                "order_test123"
            );

            // --------------------------------------------------
            // VERIFY RAZORPAY REQUEST
            // --------------------------------------------------

            assert.equal(razorpayCallCount, 1);

            // ₹599 = 59,900 paise.
            assert.deepEqual(razorpayPayload, {
                amount: 59900,
                currency: "INR",
                receipt: "order_42"
            });

            // --------------------------------------------------
            // VERIFY DATABASE TRANSACTION
            // --------------------------------------------------

            assert.ok(
                queries.some(
                    (query) => query.sql === "BEGIN"
                )
            );

            assert.ok(
                queries.some(
                    (query) => query.sql === "COMMIT"
                )
            );

            // Verify database connection released.
            assert.equal(released, true);
        } finally {
            // Restore original methods.
            createMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);

test(
    "rejects payment verification with an invalid signature",
    async () => {
        let databaseCalled = false;
        let razorpayFetchCalled = false;

        const connectMock = mock.method(
            pool,
            "connect",
            async () => {
                databaseCalled = true;
                throw new Error(
                    "Database should not be contacted"
                );
            }
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => {
                razorpayFetchCalled = true;
                throw new Error(
                    "Razorpay fetch should not be called"
                );
            }
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: "order_test123",
                        razorpay_payment_id: "pay_test123",
                        razorpay_signature: "a".repeat(64)
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 400);

            assert.equal(
                data.message,
                "Payment verification failed"
            );

            assert.equal(databaseCalled, false);
            assert.equal(razorpayFetchCalled, false);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);

test(
    "rejects payment verification when payment is not captured",
    async () => {
        let databaseCalled = false;
        let razorpayFetchCalled = false;

        const orderId = "order_test123";
        const paymentId = "pay_test123";

        // Generate a valid test signature.
        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const connectMock = mock.method(
            pool,
            "connect",
            async () => {
                databaseCalled = true;
                throw new Error(
                    "Database should not be contacted"
                );
            }
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async (requestedPaymentId) => {
                razorpayFetchCalled = true;

                assert.equal(
                    requestedPaymentId,
                    paymentId
                );

                return {
                    order_id: orderId,
                    status: "authorized",
                    amount: 59900,
                    currency: "INR"
                };
            }
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);

            assert.equal(
                data.message,
                "Payment has not been captured"
            );

            assert.equal(
                data.payment_status,
                "authorized"
            );

            assert.equal(razorpayFetchCalled, true);
            assert.equal(databaseCalled, false);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "rejects payment when Razorpay order ID does not match",
    async () => {
        let databaseCalled = false;
        let razorpayFetchCalled = false;

        const orderId = "order_test123";
        const paymentId = "pay_test123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const connectMock = mock.method(
            pool,
            "connect",
            async () => {
                databaseCalled = true;
                throw new Error(
                    "Database should not be contacted"
                );
            }
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async (requestedPaymentId) => {
                razorpayFetchCalled = true;

                assert.equal(
                    requestedPaymentId,
                    paymentId
                );

                return {
                    order_id: "order_different123",
                    status: "captured",
                    amount: 59900,
                    currency: "INR"
                };
            }
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 400);

            assert.equal(
                data.message,
                "Payment does not belong to this order"
            );

            assert.equal(razorpayFetchCalled, true);
            assert.equal(databaseCalled, false);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "rejects payment when the amount does not match the order",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_test123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "ROLLBACK"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 50000,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 400);

            assert.equal(
                data.message,
                "Payment amount or currency does not match"
            );

            assert.ok(queries.includes("BEGIN"));
            assert.ok(queries.includes("ROLLBACK"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "rejects payment when the currency is not INR",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_test123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "ROLLBACK"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "USD"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 400);

            assert.equal(
                data.message,
                "Payment amount or currency does not match"
            );

            assert.ok(queries.includes("BEGIN"));
            assert.ok(queries.includes("ROLLBACK"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "rejects payment when the order does not belong to the customer",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_test123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "ROLLBACK"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    // No order belongs to this customer.
                    return { rows: [] };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 404);

            assert.equal(
                data.message,
                "Order not found"
            );

            assert.ok(queries.includes("BEGIN"));
            assert.ok(queries.includes("ROLLBACK"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "does not process inventory again for an already-paid order",
    async () => {
        const queries = [];
        let released = false;
        let razorpayFetchCalled = false;

        const orderId = "order_test123";
        const paymentId = "pay_test123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "confirmed",
                                payment_status: "paid",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: paymentId,
                                inventory_deducted: true
                            }
                        ]
                    };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => {
                razorpayFetchCalled = true;

                return {
                    order_id: orderId,
                    status: "captured",
                    amount: 59900,
                    currency: "INR"
                };
            }
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 200);

            assert.equal(
                data.message,
                "Payment and inventory already processed"
            );

            assert.equal(data.order_id, 42);
            assert.equal(data.payment_status, "paid");
            assert.equal(data.status, "confirmed");
            assert.equal(data.inventory_deducted, true);

            assert.equal(razorpayFetchCalled, true);

            assert.ok(queries.includes("BEGIN"));
            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(
                queries.some((query) =>
                    query.includes("DELETE FROM cart_items")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "rejects a different payment ID for an already-paid order",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_new123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "confirmed",
                                payment_status: "paid",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: "pay_original123",
                                inventory_deducted: true
                            }
                        ]
                    };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);

            assert.equal(
                data.message,
                "Order inventory was already processed"
            );

            assert.ok(queries.includes("BEGIN"));
            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "requires manual resolution for an already-paid inventory issue",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_inventory123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "inventory_issue",
                                payment_status: "paid",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: paymentId,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);
            assert.equal(
                data.requires_manual_resolution,
                true
            );

            assert.ok(queries.includes("BEGIN"));
            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "requires manual resolution when a paid order has no items",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_empty123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                if (normalized.includes("FROM order_items")) {
                    return { rows: [] };
                }

                if (normalized.includes("UPDATE orders")) {
                    return { rows: [] };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);
            assert.equal(
                data.requires_manual_resolution,
                true
            );

            assert.ok(
                queries.some((query) =>
                    query.includes("FROM order_items")
                )
            );

            assert.ok(
                queries.some((query) =>
                    query.includes("UPDATE orders")
                )
            );

            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "requires manual resolution when requested quantity exceeds available stock",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_stock123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                if (normalized.includes("JOIN plants")) {
    return {
        rows: [
            {
                plant_id: 2,
                plant_name: "Monstera",
                stock: 2,
                quantity: 5
            }
        ]
    };
}

                if (normalized.includes("FROM order_items")) {
                    return {
                        rows: [
                            {
                                plant_id: 2,
                                quantity: 5
                            }
                        ]
                    };
                }

                if (normalized.includes("UPDATE orders")) {
                    return { rows: [] };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);

            assert.equal(
                data.payment_status,
                "paid"
            );

            assert.equal(
                data.status,
                "inventory_issue"
            );

            assert.equal(
                data.inventory_deducted,
                false
            );

            assert.equal(
                data.requires_manual_resolution,
                true
            );

            assert.deepEqual(
                data.unavailable_items,
                [
                    {
                        plant_id: 2,
                        plant_name: "Monstera",
                        requested: 5,
                        available: 2
                    }
                ]
            );

            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "requires manual resolution when an ordered plant is inactive",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_inactive123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                if (normalized.includes("JOIN plants")) {
                    return {
                        rows: [
                            {
                                plant_id: 2,
                                plant_name: "Monstera",
                                stock: 10,
                                quantity: 1,
                                is_active: false
                            }
                        ]
                    };
                }

                if (normalized.includes("UPDATE orders")) {
                    return { rows: [] };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);
            assert.equal(data.payment_status, "paid");
            assert.equal(data.status, "inventory_issue");
            assert.equal(data.inventory_deducted, false);
            assert.equal(data.requires_manual_resolution, true);

            assert.deepEqual(
                data.unavailable_items,
                [
                    {
                        plant_id: 2,
                        plant_name: "Monstera",
                        requested: 1,
                        available: 10
                    }
                ]
            );

            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "requires manual resolution when plant stock is null",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_nullstock123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                if (normalized.includes("JOIN plants")) {
                    return {
                        rows: [
                            {
                                plant_id: 2,
                                plant_name: "Monstera",
                                stock: null,
                                quantity: 1,
                                is_active: true
                            }
                        ]
                    };
                }

                if (normalized.includes("UPDATE orders")) {
                    return { rows: [] };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);
            assert.equal(data.payment_status, "paid");
            assert.equal(data.status, "inventory_issue");
            assert.equal(data.inventory_deducted, false);
            assert.equal(data.requires_manual_resolution, true);

            assert.deepEqual(
                data.unavailable_items,
                [
                    {
                        plant_id: 2,
                        plant_name: "Monstera",
                        requested: 1,
                        available: null
                    }
                ]
            );

            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "requires manual resolution when plant stock is negative",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_negstock123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                if (normalized.includes("JOIN plants")) {
                    return {
                        rows: [
                            {
                                plant_id: 2,
                                plant_name: "Monstera",
                                stock: -1,
                                quantity: 1,
                                is_active: true
                            }
                        ]
                    };
                }

                if (normalized.includes("UPDATE orders")) {
                    return { rows: [] };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);
            assert.equal(data.payment_status, "paid");
            assert.equal(data.status, "inventory_issue");
            assert.equal(data.inventory_deducted, false);
            assert.equal(data.requires_manual_resolution, true);

            assert.deepEqual(
                data.unavailable_items,
                [
                    {
                        plant_id: 2,
                        plant_name: "Monstera",
                        requested: 1,
                        available: -1
                    }
                ]
            );

            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "does not deduct any plant stock when one of multiple plants is unavailable",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_multi123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ]
                    };
                }

                if (normalized.includes("JOIN plants")) {
                    return {
                        rows: [
                            {
                                plant_id: 2,
                                plant_name: "Monstera",
                                stock: 10,
                                quantity: 2,
                                is_active: true
                            },
                            {
                                plant_id: 3,
                                plant_name: "Aloe Vera",
                                stock: 1,
                                quantity: 3,
                                is_active: true
                            }
                        ]
                    };
                }

                if (normalized.includes("UPDATE orders")) {
                    return { rows: [] };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 409);
            assert.equal(data.payment_status, "paid");
            assert.equal(data.status, "inventory_issue");
            assert.equal(data.inventory_deducted, false);
            assert.equal(data.requires_manual_resolution, true);

            assert.deepEqual(
                data.unavailable_items,
                [
                    {
                        plant_id: 3,
                        plant_name: "Aloe Vera",
                        requested: 3,
                        available: 1
                    }
                ]
            );

            assert.ok(queries.includes("COMMIT"));

            assert.equal(
                queries.some((query) =>
                    query.includes("UPDATE plants")
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "successfully confirms payment and deducts plant inventory",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_success123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql, params = []) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push({ sql: normalized, params });

                if (
                    normalized === "BEGIN" ||
                    normalized === "COMMIT" ||
                    normalized === "ROLLBACK"
                ) {
                    return { rows: [], rowCount: 0 };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [
                            {
                                id: 42,
                                user_id: 7,
                                total_amount: "599.00",
                                status: "pending",
                                payment_status: "pending",
                                razorpay_order_id: orderId,
                                razorpay_payment_id: null,
                                inventory_deducted: false
                            }
                        ],
                        rowCount: 1
                    };
                }

                if (normalized.includes("JOIN plants")) {
                    return {
                        rows: [
                            {
                                plant_id: 2,
                                plant_name: "Monstera",
                                stock: 10,
                                quantity: 2,
                                is_active: true
                            }
                        ],
                        rowCount: 1
                    };
                }

                if (normalized.includes("UPDATE plants")) {
                    return {
                        rows: [{ id: 2 }],
                        rowCount: 1
                    };
                }

                if (normalized.includes("UPDATE orders")) {
                    return {
                        rows: [{ id: 42 }],
                        rowCount: 1
                    };
                }

                if (normalized.includes("DELETE FROM cart_items")) {
                    return {
                        rows: [],
                        rowCount: 1
                    };
                }

                throw new Error(
                    `Unexpected SQL query: ${normalized}`
                );
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 200);

            assert.ok(
                queries.some((query) =>
                    query.sql.includes("UPDATE plants")
                )
            );

            assert.ok(
                queries.some((query) =>
                    query.sql.includes("UPDATE orders")
                )
            );

            assert.ok(
                queries.some((query) =>
                    query.sql.includes("DELETE FROM cart_items")
                )
            );

            assert.ok(
                queries.some((query) =>
                    query.sql === "COMMIT"
                )
            );

            assert.equal(
                queries.some((query) =>
                    query.sql === "ROLLBACK"
                ),
                false
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "preserves cart items when their quantity changes after order placement",
    async () => {
        const queries = [];
        const orderId = "order_test123";
        const paymentId = "pay_cartchange123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql, params = []) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push({ sql: normalized, params });

                if (
                    ["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)
                ) {
                    return { rows: [], rowCount: 0 };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [{
                            id: 42,
                            user_id: 7,
                            total_amount: "599.00",
                            status: "pending",
                            payment_status: "pending",
                            razorpay_order_id: orderId,
                            razorpay_payment_id: null,
                            inventory_deducted: false
                        }]
                    };
                }

                if (normalized.includes("JOIN plants")) {
                    return {
                        rows: [{
                            plant_id: 2,
                            plant_name: "Monstera",
                            stock: 10,
                            quantity: 2,
                            is_active: true
                        }]
                    };
                }

                if (normalized.includes("UPDATE plants")) {
                    return { rows: [{ id: 2 }], rowCount: 1 };
                }

                if (normalized.includes("UPDATE orders")) {
                    return { rows: [{ id: 42 }], rowCount: 1 };
                }

                if (normalized.includes("DELETE FROM cart_items")) {
                    return { rows: [], rowCount: 0 };
                }

                throw new Error(`Unexpected SQL: ${normalized}`);
            },

            release() {}
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                { id: 7, email: "customer@example.com" },
                process.env.JWT_SECRET,
                { expiresIn: "5m" }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 200);
            assert.equal(data.status, "confirmed");

            const deleteQuery = queries.find((query) =>
                query.sql.includes("DELETE FROM cart_items")
            );

            assert.ok(deleteQuery, "Cart cleanup query should execute");

            assert.match(
                deleteQuery.sql,
                /ci\.quantity\s*=\s*oi\.quantity/i
            );

            assert.equal(
                deleteQuery.params[0],
                42
            );

            assert.equal(
                deleteQuery.params[1],
                7
            );
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "rolls back the transaction when inventory deduction fails",
    async () => {
        const queries = [];
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_rollback123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql, params = []) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push({ sql: normalized, params });

                if (
                    normalized === "BEGIN" ||
                    normalized === "ROLLBACK" ||
                    normalized === "COMMIT"
                ) {
                    return { rows: [], rowCount: 0 };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [{
                            id: 42,
                            user_id: 7,
                            total_amount: "599.00",
                            status: "pending",
                            payment_status: "pending",
                            razorpay_order_id: orderId,
                            razorpay_payment_id: null,
                            inventory_deducted: false
                        }]
                    };
                }

                if (normalized.includes("JOIN plants")) {
                    return {
                        rows: [{
                            plant_id: 2,
                            plant_name: "Monstera",
                            stock: 10,
                            quantity: 2,
                            is_active: true
                        }]
                    };
                }

                if (normalized.includes("UPDATE plants")) {
                    // Simulate a failed conditional stock deduction.
                    return { rows: [], rowCount: 0 };
                }

                throw new Error(`Unexpected SQL: ${normalized}`);
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                { id: 7, email: "customer@example.com" },
                process.env.JWT_SECRET,
                { expiresIn: "5m" }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 500);
            assert.match(data.message, /Check the order status/);

            assert.ok(
                queries.some((query) =>
                    query.sql === "ROLLBACK"
                ),
                "Transaction should roll back"
            );

            assert.equal(
                queries.some((query) =>
                    query.sql === "COMMIT"
                ),
                false,
                "Transaction must not commit"
            );

            assert.equal(
                queries.some((query) =>
                    query.sql.includes("UPDATE orders")
                ),
                false,
                "Order must not be confirmed"
            );

            assert.equal(
                queries.some((query) =>
                    query.sql.includes("DELETE FROM cart_items")
                ),
                false,
                "Cart must not be cleared"
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "rolls back all inventory deductions when a later plant deduction fails",
    async () => {
        const queries = [];
        let plantUpdateCount = 0;
        let released = false;

        const orderId = "order_test123";
        const paymentId = "pay_partial123";

        const signature = require("node:crypto")
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const fakeClient = {
            async query(sql, params = []) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push({ sql: normalized, params });

                if (
                    ["BEGIN", "ROLLBACK", "COMMIT"].includes(normalized)
                ) {
                    return { rows: [], rowCount: 0 };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [{
                            id: 42,
                            user_id: 7,
                            total_amount: "599.00",
                            status: "pending",
                            payment_status: "pending",
                            razorpay_order_id: orderId,
                            razorpay_payment_id: null,
                            inventory_deducted: false
                        }]
                    };
                }

                if (normalized.includes("JOIN plants")) {
                    return {
                        rows: [
                            {
                                plant_id: 2,
                                plant_name: "Monstera",
                                stock: 10,
                                quantity: 2,
                                is_active: true
                            },
                            {
                                plant_id: 3,
                                plant_name: "Aloe Vera",
                                stock: 8,
                                quantity: 3,
                                is_active: true
                            }
                        ]
                    };
                }

                if (normalized.includes("UPDATE plants")) {
                    plantUpdateCount++;

                    // First deduction succeeds; second fails.
                    if (plantUpdateCount === 1) {
                        return {
                            rows: [{ id: 2 }],
                            rowCount: 1
                        };
                    }

                    return {
                        rows: [],
                        rowCount: 0
                    };
                }

                throw new Error(`Unexpected SQL: ${normalized}`);
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const fetchMock = mock.method(
            razorpay.payments,
            "fetch",
            async () => ({
                order_id: orderId,
                status: "captured",
                amount: 59900,
                currency: "INR"
            })
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                { id: 7, email: "customer@example.com" },
                process.env.JWT_SECRET,
                { expiresIn: "5m" }
            );

            const response = await fetch(
                `${result.url}/api/payments/verify-payment`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42,
                        razorpay_order_id: orderId,
                        razorpay_payment_id: paymentId,
                        razorpay_signature: signature
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 500);
            assert.match(data.message, /Check the order status/);

            assert.equal(
                plantUpdateCount,
                2,
                "Both plant deductions should be attempted"
            );

            assert.ok(
                queries.some((query) => query.sql === "ROLLBACK"),
                "The entire transaction should roll back"
            );

            assert.equal(
                queries.some((query) => query.sql === "COMMIT"),
                false,
                "The transaction must not commit"
            );

            assert.equal(
                queries.some((query) =>
                    query.sql.includes("UPDATE orders")
                ),
                false,
                "The order must not be confirmed"
            );

            assert.equal(
                queries.some((query) =>
                    query.sql.includes("DELETE FROM cart_items")
                ),
                false,
                "Cart items must not be deleted"
            );

            assert.equal(released, true);
        } finally {
            fetchMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);
test(
    "reuses an existing Razorpay order on checkout retry",
    async () => {
        const queries = [];
        let released = false;
        let razorpayCallCount = 0;

        const fakeClient = {
            async query(sql) {
                const normalized = sql
                    .replace(/\s+/g, " ")
                    .trim();

                queries.push(normalized);

                if (
                    ["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)
                ) {
                    return { rows: [] };
                }

                if (normalized.includes("pg_advisory_xact_lock")) {
                    return { rows: [] };
                }

                if (
                    normalized.includes("FROM orders") &&
                    normalized.includes("FOR UPDATE")
                ) {
                    return {
                        rows: [{
                            id: 42,
                            total_amount: "599.00",
                            status: "pending",
                            payment_status: "pending",
                            razorpay_order_id: "order_existing123",
                            inventory_deducted: false
                        }]
                    };
                }

                if (
                    normalized.includes("FROM order_items oi") &&
                    normalized.includes("p.is_active = FALSE")
                ) {
                    return { rows: [] };
                }

                throw new Error(`Unexpected SQL query: ${normalized}`);
            },

            release() {
                released = true;
            }
        };

        const connectMock = mock.method(
            pool,
            "connect",
            async () => fakeClient
        );

        const createMock = mock.method(
            razorpay.orders,
            "create",
            async () => {
                razorpayCallCount++;

                throw new Error(
                    "A new Razorpay order should not be created"
                );
            }
        );

        let server;

        try {
            const result = await startTestServer();
            server = result.server;

            const token = jwt.sign(
                {
                    id: 7,
                    email: "customer@example.com"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "5m"
                }
            );

            const response = await fetch(
                `${result.url}/api/payments/create-order`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: 42
                    })
                }
            );

            const data = await response.json();

            assert.equal(response.status, 200);

            assert.equal(
                data.message,
                "Existing Razorpay order retrieved"
            );

            assert.deepEqual(data.order, {
                id: 42,
                amount: 59900,
                currency: "INR",
                razorpay_order_id: "order_existing123"
            });

            assert.equal(razorpayCallCount, 0);

            assert.ok(queries.includes("BEGIN"));
            assert.ok(queries.includes("COMMIT"));

            assert.equal(released, true);
        } finally {
            createMock.mock.restore();
            connectMock.mock.restore();

            if (server) {
                await closeTestServer(server);
            }
        }
    }
);