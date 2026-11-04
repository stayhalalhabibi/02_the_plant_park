
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
const isDevelopment = process.env.NODE_ENV === "development";
const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

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
const completeProfileLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many profile completion attempts. Please try again in 15 minutes."
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
const normalizeEmail = (email) =>
    String(email || "").trim().toLowerCase();

const normalizePhone = (phone) => {
    const digits = String(phone || "").replace(/\D/g, "");

    // Accept Indian 10-digit numbers or numbers with country code 91.
    if (/^[6-9]\d{9}$/.test(digits)) {
        return `+91${digits}`;
    }

    if (/^91[6-9]\d{9}$/.test(digits)) {
        return `+${digits}`;
    }

    return null;
};
const isValidEmail = (email) =>
    email.length <= 150 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const createOtp = () =>
    crypto.randomInt(0, 1000000)
        .toString()
        .padStart(6, "0");

const hashOtp = (otp) =>
    crypto.createHash("sha256")
        .update(otp)
        .digest("hex");

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
       const passwordMatch =
    typeof user.password === "string" &&
    user.password.length > 0 &&
    await bcrypt.compare(password, user.password);

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
// SEND OTP — EMAIL AND PHONE
router.post("/send-otp", sendOtpLimiter, async (req, res) => {
    try {
        const { method } = req.body || {};

        let contact;

        if (method === "email") {
            contact = normalizeEmail(req.body?.email);

            if (!isValidEmail(contact)) {
                return res.status(400).json({
                    message: "Please enter a valid email address."
                });
            }
        } else if (method === "phone") {
            contact = normalizePhone(req.body?.phone);

            if (!contact) {
                return res.status(400).json({
                    message: "Please enter a valid Indian mobile number."
                });
            }
        } else {
            return res.status(400).json({
                message: "Choose email or phone verification."
            });
        }
    const otp = createOtp();
const otpHash = hashOtp(otp);

if (!isDevelopment && method === "email" && !resend) {
    return res.status(503).json({
        message: "Email delivery is unavailable."
    });
}

if (!isDevelopment && method === "phone") {
    return res.status(503).json({
        message: "Phone OTP delivery is not configured yet."
    });
}

// Save OTP before attempting email delivery.
await pool.query(
    `INSERT INTO auth_verifications (
        method,
        contact,
        otp_hash,
        otp_expires_at,
        attempts,
        created_at
    )
    VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes', 0, NOW())
    ON CONFLICT (method, contact)
    DO UPDATE SET
        otp_hash = EXCLUDED.otp_hash,
        otp_expires_at = EXCLUDED.otp_expires_at,
        attempts = 0,
        verified_at = NULL,
        profile_token_hash = NULL,
        profile_token_expires_at = NULL,
        created_at = NOW()`,
    [method, contact, otpHash]
);

if (isDevelopment) {
    console.log(`[DEV OTP] ${method}: ${contact} | OTP: ${otp}`);
} else {
    const { error } = await resend.emails.send({
        from: "The Plant Park <noreply@theplantspark.com>",
        to: [contact],
        subject: "Your Plant Park Login OTP",
        html: `
            <h2>The Plant Park 🌱</h2>
            <p>Your login OTP is:</p>
            <h1>${otp}</h1>
            <p>This OTP expires in 5 minutes.</p>
        `
    });

    if (error) {
        console.error("Resend email error:", error.message);

        await pool.query(
            `DELETE FROM auth_verifications
             WHERE method = $1 AND contact = $2 AND otp_hash = $3`,
            [method, contact, otpHash]
        );

        return res.status(502).json({
            message: "Unable to send OTP email."
        });
    }
}

return res.json({
    message: `OTP sent successfully to your ${method}.`
});
    } catch (error) {
        console.error("Send OTP error:", error.message);

        return res.status(500).json({
            message: "Failed to send OTP."
        });
    }
});
// VERIFY OTP — EMAIL AND PHONE
router.post("/verify-otp", verifyOtpLimiter, async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const { method } = req.body || {};
        let contact;

        if (method === "email") {
            contact = normalizeEmail(req.body?.email);

            if (!isValidEmail(contact)) {
                return res.status(400).json({
                    message: "Please enter a valid email address."
                });
            }
        } else if (method === "phone") {
            contact = normalizePhone(req.body?.phone);

            if (!contact) {
                return res.status(400).json({
                    message: "Please enter a valid Indian mobile number."
                });
            }
        } else {
            return res.status(400).json({
                message: "Choose email or phone verification."
            });
        }

        const otp = String(req.body?.otp || "").trim();

        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                message: "A valid 6-digit OTP is required."
            });
        }

        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        const verificationResult = await client.query(
            `SELECT otp_hash, otp_expires_at, attempts, verified_at
             FROM auth_verifications
             WHERE method = $1 AND contact = $2
             FOR UPDATE`,
            [method, contact]
        );

        if (verificationResult.rows.length === 0) {
            await client.query("COMMIT");
            transactionStarted = false;

            return res.status(400).json({
                message: "OTP expired or not found. Request a new OTP."
            });
        }

        const savedOtp = verificationResult.rows[0];

        if (
            savedOtp.verified_at ||
            new Date(savedOtp.otp_expires_at) <= new Date()
        ) {
            await client.query(
                `DELETE FROM auth_verifications
                 WHERE method = $1 AND contact = $2`,
                [method, contact]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            return res.status(400).json({
                message: "OTP expired or already used. Request a new OTP."
            });
        }

        if (savedOtp.attempts >= 5) {
            await client.query(
                `DELETE FROM auth_verifications
                 WHERE method = $1 AND contact = $2`,
                [method, contact]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            return res.status(429).json({
                message: "Too many incorrect attempts. Request a new OTP."
            });
        }

        const submittedHash = hashOtp(otp);

        if (
    typeof savedOtp.otp_hash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(savedOtp.otp_hash)
) {
    throw new Error("Invalid stored OTP hash.");
}

const expected = Buffer.from(savedOtp.otp_hash, "hex");
const actual = Buffer.from(submittedHash, "hex");

        if (!crypto.timingSafeEqual(expected, actual)) {
            const attempts = savedOtp.attempts + 1;

            if (attempts >= 5) {
                await client.query(
                    `DELETE FROM auth_verifications
                     WHERE method = $1 AND contact = $2`,
                    [method, contact]
                );

                await client.query("COMMIT");
                transactionStarted = false;

                return res.status(429).json({
                    message: "Too many incorrect attempts. Request a new OTP."
                });
            }

            await client.query(
                `UPDATE auth_verifications
                 SET attempts = $3
                 WHERE method = $1 AND contact = $2`,
                [method, contact, attempts]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            return res.status(401).json({
                message: "Invalid OTP."
            });
        }

        const userResult = method === "email"
            ? await client.query(
                `SELECT id, name, email, phone, age, sex
                 FROM users
                 WHERE LOWER(email) = $1`,
                [contact]
            )
            : await client.query(
                `SELECT id, name, email, phone, age, sex
                 FROM users
                 WHERE phone = $1`,
                [contact]
            );

        // Existing customer: consume verification and log in.
        if (userResult.rows.length > 0) {
            await client.query(
                `DELETE FROM auth_verifications
                 WHERE method = $1 AND contact = $2`,
                [method, contact]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            const user = userResult.rows[0];

            return res.json({
                message: "OTP verified successfully. Login complete.",
                needsProfile: false,
                user,
                token: createToken(user)
            });
        }

        // New customer: create a short-lived profile token.
        const profileToken = crypto.randomBytes(32).toString("hex");
        const profileTokenHash = hashOtp(profileToken);

        await client.query(
            `UPDATE auth_verifications
             SET verified_at = NOW(),
                 profile_token_hash = $3,
                 profile_token_expires_at = NOW() + INTERVAL '10 minutes'
             WHERE method = $1 AND contact = $2`,
            [method, contact, profileTokenHash]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return res.json({
            message: "OTP verified. Please complete your profile.",
            needsProfile: true,
            profileToken
        });

    } catch (error) {
        if (client && transactionStarted) {
            await client.query("ROLLBACK").catch(() => {});
        }

        console.error("Verify OTP error:", error.message);

        return res.status(500).json({
            message: "OTP verification failed."
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});
// COMPLETE PROFILE AFTER OTP VERIFICATION
router.post("/complete-profile", completeProfileLimiter, async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const {
            profileToken,
            name,
            age,
            sex
        } = req.body || {};

        if (
            typeof profileToken !== "string" ||
            !/^[a-f0-9]{64}$/i.test(profileToken) ||
            typeof name !== "string" ||
            !name.trim() ||
            name.trim().length > 100
        ) {
            return res.status(400).json({
                message: "A valid profile token and name are required."
            });
        }

        if (
            age !== undefined &&
            age !== null &&
            age !== "" &&
            (!Number.isInteger(Number(age)) ||
                Number(age) < 1 ||
                Number(age) > 120)
        ) {
            return res.status(400).json({
                message: "Age must be between 1 and 120."
            });
        }

        if (
            sex !== undefined &&
            sex !== null &&
            (typeof sex !== "string" || sex.length > 30)
        ) {
            return res.status(400).json({
                message: "Invalid sex value."
            });
        }

        const profileTokenHash = hashOtp(profileToken);

        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        const verificationResult = await client.query(
            `SELECT method, contact
             FROM auth_verifications
             WHERE profile_token_hash = $1
               AND verified_at IS NOT NULL
               AND profile_token_expires_at > NOW()
             FOR UPDATE`,
            [profileTokenHash]
        );

        if (verificationResult.rows.length === 0) {
            await client.query("COMMIT");
            transactionStarted = false;

            return res.status(401).json({
                message: "Profile verification expired. Please verify your OTP again."
            });
        }

        const verified = verificationResult.rows[0];

        const email = verified.method === "email"
            ? verified.contact
            : null;

        const phone = verified.method === "phone"
            ? verified.contact
            : null;

        const result = await client.query(
            `INSERT INTO users (name, email, phone, age, sex)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, email, phone, age, sex, created_at`,
            [
                name.trim(),
                email,
                phone,
                age === undefined || age === null || age === ""
                    ? null
                    : Number(age),
                sex?.trim() || null
            ]
        );

        // Consume the profile token after successful account creation.
        await client.query(
            `DELETE FROM auth_verifications
             WHERE profile_token_hash = $1`,
            [profileTokenHash]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        const user = result.rows[0];

        return res.status(201).json({
            message: "Your Plant Park account was created successfully.",
            user,
            token: createToken(user)
        });

    } catch (error) {
        if (client && transactionStarted) {
            await client.query("ROLLBACK").catch(() => {});
        }

        if (error.code === "23505") {
            return res.status(409).json({
                message: "This email or phone number is already registered."
            });
        }

        console.error("Profile completion error:", error.message);

        return res.status(500).json({
            message: "Unable to complete your profile."
        });
    } finally {
        if (client) {
            client.release();
        }
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
