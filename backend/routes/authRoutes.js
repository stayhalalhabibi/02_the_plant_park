
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Rate limits for authentication endpoints.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many login attempts. Please try again in 15 minutes."
    }
});

const sendOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many OTP requests. Please try again in 15 minutes."
    }
});

const verifyOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many OTP verification requests. Please try again in 15 minutes."
    }
});


const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many registration attempts. Please try again in 15 minutes."
    }
});


// Temporary in-memory OTP store for local development.
// OTPs are lost when the backend restarts.
const otpStore = new Map();

const normalizeEmail = (email) =>
    String(email || "").trim().toLowerCase();

const createToken = (user) =>
    jwt.sign(
        {
            id: user.id,
            email: user.email
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );

// REGISTER USER
router.post("/register", registerLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body || {};
        const validPassword =
    typeof password === "string" &&
    password.length >= 8 &&
    Buffer.byteLength(password, "utf8") <= 72;
        const normalizedEmail = normalizeEmail(email);
        const validEmail =
    normalizedEmail.length <= 150 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

        if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 100 ||
    !validEmail ||
    !validPassword ||
    typeof password !== "string" ||
    !password
) {
            return res.status(400).json({
                message:
                    "Invalid name, email, or password. Name must be 1-100 characters, email must be valid, and password must be 8-72 UTF-8 bytes."            });
        }

        const existingUser = await pool.query(
            `SELECT id
             FROM users
             WHERE LOWER(email) = $1`,
            [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        // Secure password hashing compatible with existing bcrypt accounts.
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (name, email, password)
             VALUES ($1, $2, $3)
             RETURNING id, name, email, created_at`,
            [name.trim(), normalizedEmail, hashedPassword]
        );

        return res.status(201).json({
            message: "User registered successfully",
            user: result.rows[0]
        });
    } catch (error) {
        // PostgreSQL unique violation: concurrent duplicate registration.
        if (error.code === "23505") {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        console.error("Registration error:", error.message);

        return res.status(500).json({
            message: "Registration failed"
        });
    }
});

// PASSWORD LOGIN
router.post("/login", loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const normalizedEmail = normalizeEmail(email);


        if (
            !normalizedEmail ||
            typeof password !== "string" ||
            !password
        ) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const result = await pool.query(
            `SELECT id, name, email, password
             FROM users
             WHERE LOWER(email) = $1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        // Verify the bcrypt password hash.
        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        return res.json({
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            },
            token: createToken(user)
        });
    } catch (error) {
        console.error("Password login error:", error.message);

        return res.status(500).json({
            message: "Login failed"
        });
    }
});

// SEND OTP — DEVELOPMENT ONLY.
// The OTP is returned in the response; no email is sent.
router.post("/send-otp", sendOtpLimiter, async (req, res) => {
try {
        const email = normalizeEmail(req.body?.email);

        if (!email) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        const result = await pool.query(
            `SELECT id
             FROM users
             WHERE LOWER(email) = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "No account found for this email. Register first."
            });
        }

        if (process.env.NODE_ENV !== "development") {
    return res.status(503).json({
        message: "OTP delivery is not configured."
    });
}

        const otp = crypto
            .randomInt(0, 1000000)
            .toString()
            .padStart(6, "0");

        otpStore.set(email, {
            otpHash: crypto
                .createHash("sha256")
                .update(otp)
                .digest("hex"),
            expiresAt: Date.now() + 5 * 60 * 1000,
            attempts: 0
        });

        return res.json({
            message: "Development OTP generated. No email was sent.",
            otp
        });
    } catch (error) {
        console.error("Send OTP error:", error.message);

        return res.status(500).json({
            message: "Failed to generate OTP"
        });
    }
});

// VERIFY OTP
router.post("/verify-otp", verifyOtpLimiter, async (req, res) => {    try {
        const email = normalizeEmail(req.body?.email);
        const otp = String(req.body?.otp || "").trim();

        if (!email || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                message: "A valid email and 6-digit OTP are required"
            });
        }

        const savedOtp = otpStore.get(email);

        if (!savedOtp || Date.now() >= savedOtp.expiresAt) {
            otpStore.delete(email);

            return res.status(400).json({
                message: "OTP expired or not found. Request a new OTP."
            });
        }

        if (savedOtp.attempts >= 5) {
            otpStore.delete(email);

            return res.status(429).json({
                message: "Too many incorrect attempts. Request a new OTP."
            });
        }

        const submittedHash = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

        const expected = Buffer.from(savedOtp.otpHash, "hex");
        const actual = Buffer.from(submittedHash, "hex");

        if (!crypto.timingSafeEqual(expected, actual)) {
            savedOtp.attempts += 1;

            if (savedOtp.attempts >= 5) {
                otpStore.delete(email);

                return res.status(429).json({
                    message: "Too many incorrect attempts. Request a new OTP."
                });
            }

            return res.status(401).json({
                message: "Invalid OTP"
            });
        }

        // Consume the OTP before issuing a token.
        otpStore.delete(email);

        const result = await pool.query(
            `SELECT id, name, email
             FROM users
             WHERE LOWER(email) = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User account not found"
            });
        }

        const user = result.rows[0];

        return res.json({
            message: "OTP verified successfully",
            user,
            token: createToken(user)
        });
    } catch (error) {
        console.error("Verify OTP error:", error.message);

        return res.status(500).json({
            message: "OTP verification failed"
        });
    }
});

// GET CURRENT USER PROFILE
router.get("/profile", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, created_at
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.json({
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Error fetching profile:", error.message);

        return res.status(500).json({
            message: "Failed to fetch profile"
        });
    }
});



module.exports = router;
