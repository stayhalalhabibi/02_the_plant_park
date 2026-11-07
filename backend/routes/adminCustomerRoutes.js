
const express = require("express");
const pool = require("../config/db");
const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");
const requireAdminPermission = require("../middleware/adminPermissionMiddleware");

const router = express.Router();

// Every customer-management endpoint requires authentication
// and the manage_customers permission.
router.use(
  adminAuthMiddleware,
  requireAdminPermission("manage_customers")
);

// Validate customer IDs.
function isValidId(id) {
  return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
}

// GET /api/admin/customers
// List customers with search and pagination.
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 20;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim().slice(0, 100);

    const searchPattern = `%${search}%`;

    const customersQuery = await pool.query(
      `SELECT
         id,
         name,
         email,
         phone,
         age,
         sex,
         created_at
       FROM users
       WHERE (
         $1 = ''
         OR name ILIKE $2
         OR email ILIKE $2
         OR phone ILIKE $2
       )
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT $3 OFFSET $4`,
      [search, searchPattern, limit, offset]
    );

    const countQuery = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE (
         $1 = ''
         OR name ILIKE $2
         OR email ILIKE $2
         OR phone ILIKE $2
       )`,
      [search, searchPattern]
    );

    const total = countQuery.rows[0].total;

    return res.status(200).json({
      success: true,
      customers: customersQuery.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Admin customer list error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch customers.",
    });
  }
});

// GET /api/admin/customers/:id
// View an individual customer's details.
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    const result = await pool.query(
      `SELECT
         id,
         name,
         email,
         phone,
         age,
         sex,
         created_at
       FROM users
       WHERE id = $1`,
      [Number(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      customer: result.rows[0],
    });
  } catch (error) {
    console.error("Admin customer details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch customer details.",
    });
  }
});

// GET /api/admin/customers/:id/orders
// View a customer's order history.
router.get("/:id/orders", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    const customerResult = await pool.query(
      "SELECT id FROM users WHERE id = $1",
      [Number(id)]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
const requestedLimit = Number.parseInt(req.query.limit, 10) || 20;
const limit = Math.min(100, Math.max(1, requestedLimit));
const offset = (page - 1) * limit;

const ordersResult = await pool.query(
  `SELECT
     id,
     total_amount,
     subtotal_amount,
     bundle_discount,
     percentage_discount,
     shipping_fee,
     status,
     payment_status,
     created_at
   FROM orders
   WHERE user_id = $1
   ORDER BY created_at DESC NULLS LAST, id DESC
   LIMIT $2 OFFSET $3`,
  [Number(id), limit, offset]
);

const countResult = await pool.query(
  "SELECT COUNT(*)::int AS total FROM orders WHERE user_id = $1",
  [Number(id)]
);

const total = countResult.rows[0].total;

    return res.status(200).json({
  success: true,
  customerId: Number(id),
  orders: ordersResult.rows,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
});
  } catch (error) {
    console.error("Admin customer orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch customer orders.",
    });
  }
});

module.exports = router;
