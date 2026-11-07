const express = require("express");
const pool = require("../config/db");
const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");
const requireAdminPermission = require("../middleware/adminPermissionMiddleware");
const writeAdminAuditLog = require("../utils/adminAuditLog");

const router = express.Router();

// All plant-management endpoints require authentication
// and the manage_plants permission.
router.use(
    adminAuthMiddleware,
    requireAdminPermission("manage_plants")
);

// Validate plant IDs.
function isValidId(id) {
    return (
        /^\d+$/.test(id) &&
        Number.isSafeInteger(Number(id)) &&
        Number(id) > 0
    );
}
// GET /api/admin/plants
// List plants with search, status filter and pagination.
router.get("/", async (req, res) => {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const requestedLimit =
            Number.parseInt(req.query.limit, 10) || 20;

        const limit = Math.min(100, Math.max(1, requestedLimit));
        const offset = (page - 1) * limit;

        const search = String(req.query.search || "")
            .trim()
            .slice(0, 100);

        const status = String(req.query.status || "all");

        if (!["all", "active", "archived"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid plant status filter.",
            });
        }

        const searchPattern = `%${search}%`;

        const plantsResult = await pool.query(
            `SELECT
                plants.id,
                plants.name,
                plants.description,
                plants.price,
                plants.image_url,
                plants.stock,
                plants.category_id,
                categories.name AS category,
                plants.is_active,
                plants.created_at
             FROM plants
             LEFT JOIN categories
                ON plants.category_id = categories.id
             WHERE (
                $1 = 'all'
                OR ($1 = 'active' AND plants.is_active = TRUE)
                OR ($1 = 'archived' AND plants.is_active = FALSE)
             )
             AND (
                $2 = ''
                OR plants.name ILIKE $3
                OR categories.name ILIKE $3
             )
             ORDER BY plants.id DESC
             LIMIT $4 OFFSET $5`,
            [status, search, searchPattern, limit, offset]
        );

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total
             FROM plants
             LEFT JOIN categories
                ON plants.category_id = categories.id
             WHERE (
                $1 = 'all'
                OR ($1 = 'active' AND plants.is_active = TRUE)
                OR ($1 = 'archived' AND plants.is_active = FALSE)
             )
             AND (
                $2 = ''
                OR plants.name ILIKE $3
                OR categories.name ILIKE $3
             )`,
            [status, search, searchPattern]
        );

        const total = countResult.rows[0].total;

        return res.status(200).json({
            success: true,
            plants: plantsResult.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Admin plant list error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch plants.",
        });
    }
});
// GET /api/admin/plants/:id
// Fetch one plant for viewing or editing.
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid plant ID.",
            });
        }

        const result = await pool.query(
            `SELECT
                plants.id,
                plants.name,
                plants.description,
                plants.price,
                plants.image_url,
                plants.stock,
                plants.category_id,
                categories.name AS category,
                plants.is_active,
                plants.created_at
             FROM plants
             LEFT JOIN categories
                ON plants.category_id = categories.id
             WHERE plants.id = $1`,
            [Number(id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Plant not found.",
            });
        }

        return res.status(200).json({
            success: true,
            plant: result.rows[0],
        });
    } catch (error) {
        console.error("Admin plant details error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch plant details.",
        });
    }
});
// Validate plant creation and update data.
function validatePlantInput(body) {
    const {
        name,
        description,
        price,
        image_url,
        category_id,
    } = body;

    if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 150
    ) {
        return "Plant name is required and must not exceed 150 characters.";
    }

    if (
        description !== undefined &&
        description !== null &&
        typeof description !== "string"
    ) {
        return "Invalid plant description.";
    }

    if (
        description &&
        description.length > 5000
    ) {
        return "Plant description must not exceed 5000 characters.";
    }

    const numericPrice = Number(price);

    if (
        price === undefined ||
        price === null ||
        price === "" ||
        !Number.isFinite(numericPrice) ||
        numericPrice <= 0 ||
        numericPrice > 10000000
    ) {
        return "Plant price must be greater than zero and within the allowed limit.";
    }

    if (
        image_url !== undefined &&
        image_url !== null &&
        image_url !== ""
    ) {
        if (typeof image_url !== "string") {
            return "Invalid plant image URL.";
        }

        try {
            const parsedUrl = new URL(image_url);

            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                return "Plant image URL must use HTTP or HTTPS.";
            }
        } catch {
            return "Invalid plant image URL.";
        }
    }

    if (
        category_id !== undefined &&
        category_id !== null &&
        category_id !== ""
    ) {
        if (!isValidId(String(category_id))) {
            return "Invalid category ID.";
        }
    }

    return null;
}
// POST /api/admin/plants
// Create a new plant.
router.post("/", async (req, res) => {
    try {
        const validationError = validatePlantInput(req.body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError,
            });
        }

        const {
            name,
            description = null,
            price,
            image_url = null,
            category_id = null,
        } = req.body;

        const numericPrice = Number(price);
        const numericCategoryId =
    category_id === undefined ||
    category_id === null ||
    category_id === ""
        ? null
        : Number(category_id);

        if (numericCategoryId !== null) {
            const categoryResult = await pool.query(
                "SELECT id FROM categories WHERE id = $1",
                [numericCategoryId]
            );

            if (categoryResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Selected category does not exist.",
                });
            }
        }

        const result = await pool.query(
            `INSERT INTO plants (
                name,
                description,
                price,
                image_url,
                category_id,
                stock,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, 0, TRUE)
            RETURNING
                id,
                name,
                description,
                price,
                image_url,
                stock,
                category_id,
                is_active,
                created_at`,
            [
                name.trim(),
                description?.trim() || null,
                numericPrice,
                image_url?.trim() || null,
                numericCategoryId,
            ]
        );

        const newPlant = result.rows[0];

        await writeAdminAuditLog({
            actorAdminId: req.admin.id,
            action: "plant_created",
            details: {
                plantId: newPlant.id,
                plantName: newPlant.name,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
        });

        return res.status(201).json({
            success: true,
            message: "Plant created successfully.",
            plant: newPlant,
        });
    } catch (error) {
        console.error("Admin plant creation error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create plant.",
        });
    }
});
// PUT /api/admin/plants/:id
// Update plant details without changing inventory or archive status.
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid plant ID.",
            });
        }

        const validationError = validatePlantInput(req.body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError,
            });
        }

        const {
            name,
            description = null,
            price,
            image_url = null,
            category_id,
        } = req.body;

        const numericCategoryId =
            category_id === undefined ||
            category_id === null ||
            category_id === ""
                ? null
                : Number(category_id);

        const existingPlant = await pool.query(
            "SELECT id FROM plants WHERE id = $1",
            [Number(id)]
        );

        if (existingPlant.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Plant not found.",
            });
        }

        if (numericCategoryId !== null) {
            const categoryResult = await pool.query(
                "SELECT id FROM categories WHERE id = $1",
                [numericCategoryId]
            );

            if (categoryResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Selected category does not exist.",
                });
            }
        }

        const result = await pool.query(
            `UPDATE plants
             SET
                name = $1,
                description = $2,
                price = $3,
                image_url = $4,
                category_id = $5
             WHERE id = $6
             RETURNING
                id,
                name,
                description,
                price,
                image_url,
                stock,
                category_id,
                is_active`,
            [
                name.trim(),
                description?.trim() || null,
                Number(price),
                image_url?.trim() || null,
                numericCategoryId,
                Number(id),
            ]
        );

        const updatedPlant = result.rows[0];

        await writeAdminAuditLog({
            actorAdminId: req.admin.id,
            action: "plant_updated",
            details: {
                plantId: updatedPlant.id,
                plantName: updatedPlant.name,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
        });

        return res.status(200).json({
            success: true,
            message: "Plant updated successfully.",
            plant: updatedPlant,
        });
    } catch (error) {
        console.error("Admin plant update error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update plant.",
        });
    }
});
// PATCH /api/admin/plants/:id/archive
// Archive a plant without deleting its historical records.
router.patch("/:id/archive", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid plant ID.",
            });
        }

        const result = await pool.query(
            `UPDATE plants
             SET is_active = FALSE
             WHERE id = $1 AND is_active = TRUE
             RETURNING id, name, is_active`,
            [Number(id)]
        );

        if (result.rows.length === 0) {
            const existingPlant = await pool.query(
                "SELECT id FROM plants WHERE id = $1",
                [Number(id)]
            );

            if (existingPlant.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Plant not found.",
                });
            }

            return res.status(409).json({
                success: false,
                message: "Plant is already archived.",
            });
        }

        const archivedPlant = result.rows[0];

        await writeAdminAuditLog({
            actorAdminId: req.admin.id,
            action: "plant_archived",
            details: {
                plantId: archivedPlant.id,
                plantName: archivedPlant.name,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
        });

        return res.status(200).json({
            success: true,
            message: "Plant archived successfully.",
            plant: archivedPlant,
        });
    } catch (error) {
        console.error("Admin plant archive error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to archive plant.",
        });
    }
});
// PATCH /api/admin/plants/:id/restore
// Restore an archived plant without changing its inventory.
router.patch("/:id/restore", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid plant ID.",
            });
        }

        const result = await pool.query(
            `UPDATE plants
             SET is_active = TRUE
             WHERE id = $1 AND is_active = FALSE
             RETURNING id, name, is_active`,
            [Number(id)]
        );

        if (result.rows.length === 0) {
            const existingPlant = await pool.query(
                "SELECT id FROM plants WHERE id = $1",
                [Number(id)]
            );

            if (existingPlant.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Plant not found.",
                });
            }

            return res.status(409).json({
                success: false,
                message: "Plant is already active.",
            });
        }

        const restoredPlant = result.rows[0];

        await writeAdminAuditLog({
            actorAdminId: req.admin.id,
            action: "plant_restored",
            details: {
                plantId: restoredPlant.id,
                plantName: restoredPlant.name,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
        });

        return res.status(200).json({
            success: true,
            message: "Plant restored successfully.",
            plant: restoredPlant,
        });
    } catch (error) {
        console.error("Admin plant restore error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to restore plant.",
        });
    }
});

module.exports = router;