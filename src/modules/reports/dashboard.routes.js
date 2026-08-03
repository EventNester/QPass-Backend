import { Router } from "express";

import { getDashboardStatsController } from "./dashboard.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import { validateParams } from "../../middlewares/validate.middleware.js";
import { reportEventIdParamsSchema } from "./report.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/events/{eventId}/dashboard:
 *   get:
 *     summary: Get event dashboard statistics
 *     description: |
 *       Returns aggregate registration and check-in statistics for an event,
 *       including capacity utilization and a ticket-type breakdown.
 *       Accessible to the event owner, an ADMIN, or an active assigned staff member.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DashboardStats'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — caller is neither the event owner, an ADMIN, nor an active assigned staff member
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: "Validation error. Possible messages: Invalid event ID format"
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
  "/:eventId/dashboard",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN", "STAFF"),
  validateParams(reportEventIdParamsSchema),
  getDashboardStatsController
);

export default router;
