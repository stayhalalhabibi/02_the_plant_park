
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");
const plantRoutes = require("./routes/plantRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const authRoutes = require("./routes/authRoutes");
const cartRoutes = require("./routes/cartRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

app.use("/api/plants", plantRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

// Test route
app.get("/", (req, res) => {
    res.json({
        message: "🌱 The Plant Park Backend is running!"
    });
});

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            status: "ok",
            database: "connected",
            message: "🌱 The Plant Park Backend is healthy!"
        });

    } catch (error) {
        console.error("❌ Health check error:", error);

        res.status(500).json({
            status: "error",
            database: "disconnected",
            message: "Backend health check failed"
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🌱 The Plant Park Backend running on port ${PORT}`);
});