require("dotenv").config({ path: ".env.owner" });
require("dotenv").config();

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Resend } = require("resend");
const readline = require("readline/promises");
const pool = require("../config/db");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

async function createOwner() {
  const email = String(process.env.OWNER_EMAIL || "")
    .trim()
    .toLowerCase();

  const password = process.env.OWNER_PASSWORD;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set a valid OWNER_EMAIL environment variable.");
  }
  if (
  typeof password !== "string" ||
  password.length < 12 ||
  Buffer.byteLength(password, "utf8") > 72
) {
  throw new Error(
    "OWNER_PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes."
  );
}

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required.");
  }

  const existingOwner = await pool.query(
    "SELECT id FROM admins WHERE role = 'owner' LIMIT 1"
  );

  if (existingOwner.rows.length > 0) {
    throw new Error("An Owner account already exists.");
  }

  const existingAdmin = await pool.query(
    "SELECT id FROM admins WHERE LOWER(email) = $1",
    [email]
  );

  if (existingAdmin.rows.length > 0) {
    throw new Error("This email already belongs to an admin.");
  }

const otp = crypto.randomInt(100000, 1000000).toString();
const otpCreatedAt = Date.now();
const OTP_EXPIRY_MS = 5 * 60 * 1000;

  const emailResult = await resend.emails.send({
    from: "The Plant Park <noreply@theplantspark.com>",
    to: [email],
    subject: "Verify your Plant Park Owner account",
    html: `
      <h2>Owner account verification</h2>
      <p>Your verification code is:</p>
      <h1>${otp}</h1>
      <p>This code expires in 5 minutes.</p>
    `,
  });

  if (emailResult.error) {
    throw new Error("Unable to send Owner verification email.");
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const enteredOtp = await rl.question(
      `Enter the six-digit code sent to ${email}: `
    );

   if (Date.now() - otpCreatedAt > OTP_EXPIRY_MS) {
  throw new Error("OTP has expired. Please restart Owner setup.");
}

if (enteredOtp.trim() !== otp) {
  throw new Error("Incorrect verification code.");
}
  } finally {
    rl.close();
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `INSERT INTO admins (
       name,
       email,
       password_hash,
       role,
       status,
       email_verified_at
     )
     VALUES ($1, $2, $3, 'owner', 'active', NOW())
     RETURNING id, name, email, role`,
    [
      process.env.OWNER_NAME || "Plant Park Owner",
      email,
      passwordHash,
    ]
  );

  console.log("Owner account created successfully:");
  console.log(result.rows[0]);
}

createOwner()
  .catch((error) => {
    console.error("Owner setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });