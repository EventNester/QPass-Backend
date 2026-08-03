import { Router } from "express";

import { listAuditLogsController } from "./audit.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import { validateQuery } from "../../middlewares/validate.middleware.js";
import { auditLogQuerySchema } from "./audit.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/audit-logs:
 *   get:
 *     summary: List audit logs
 *     description: |
 *       Returns a paginated audit trail, newest first. Filterable by action,
 *       entity, actor ID, and creation date range. ADMIN role only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action (e.g. STAFF_ASSIGN, CHECKIN_VALID, UNDO_CHECKIN, PUBLIC_REGISTRATION)
 *       - in: query
 *         name: entity
 *         schema:
 *           type: string
 *         description: Filter by entity type (e.g. CheckIn, Registration, EventStaffAssignment)
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by the user who performed the action
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Only include entries created at or after this timestamp
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Only include entries created at or before this timestamp
 *     responses:
 *       200:
 *         description: Paginated audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuditLogListResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — caller must be an ADMIN
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: "Validation error. Possible messages: Invalid query parameters"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  validateQuery(auditLogQuerySchema),
  listAuditLogsController
);

export default router;
