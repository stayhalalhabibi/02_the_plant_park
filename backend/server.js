const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

require("dotenv").config();

const requiredEnvVars = [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "JWT_SECRET",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET"
];

const missingEnvVars = requiredEnvVars.filter(
    (name) => !process.env[name]?.trim()
);

if (missingEnvVars.length > 0) {
    console.error(
        `Missing required environment variables: ${missingEnvVars.join(", ")}`
    );
    process.exit(1);
}

const pool = require("./config/db");


const plantRoutes = require("./routes/plantRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const adminPlantRoutes = require("./routes/adminPlantRoutes");
const authRoutes = require("./routes/authRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminManagementRoutes = require("./routes/adminManagementRoutes");
const cartRoutes = require("./routes/cartRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminCustomerRoutes = require("./routes/adminCustomerRoutes");

const app = express();
app.use(helmet());
app.disable("x-powered-by");
const PORT = process.env.PORT || 5000;

// Middleware

const allowedOrigins = (
  process.env.FRONTEND_URL ||
  "http://localhost:5173,http://localhost:5174,https://02-the-plant-park.vercel.app"
)
  .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: allowedOrigins,
    }),
);


app.use(express.json({ limit: "100kb" }));


// API Routes
app.use("/api/plants", plantRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/management", adminManagementRoutes);
app.use("/api/admin/customers", adminCustomerRoutes);
app.use("/api/admin/plants", adminPlantRoutes);
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

// Health check
app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            status: "ok",
            database: "connected",
            message: "🌱 The Plant Park Backend is healthy!"
        });
    } catch (error) {
        console.error("❌ Database health check failed:", error);

        res.status(500).json({
            status: "error",
            database: "disconnected",
            message: "Database connection failed"
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🌱 The Plant Park Backend running on port ${PORT}`);
});