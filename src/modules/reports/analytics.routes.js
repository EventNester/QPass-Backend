import { Router } from "express";

import { getOverviewStatsController } from "./analytics.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { validateQuery } from "../../middlewares/validate.middleware.js";
import { overviewQuerySchema } from "./analytics.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/analytics/overview:
 *   get:
 *     summary: Get overview statistics (total events and total attendees)
 *     description: |
 *       Returns system-wide totals (events, published events, registrations,
 *       distinct attendees, registered attendee accounts). ADMIN callers see
 *       every event by default; other roles are always restricted to their own
 *       events. Pass `?scope=own` to force the organizer-scoped view.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: scope
 *         required: false
 *         schema:
 *           type: string
 *           enum: [own, system]
 *         description: Force a scope (system is ADMIN only)
 *     responses:
 *       200:
 *         description: Overview statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         totalEvents: { type: integer }
 *                         publishedEvents: { type: integer }
 *                         totalAttendees: { type: integer }
 *                         totalRegistrations: { type: integer }
 *                         registeredUsers: { type: integer }
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — a non-ADMIN requested the system-wide scope
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Validation error — `scope` must be `own` or `system`
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
router.get("/overview", requireAuth, validateQuery(overviewQuerySchema), getOverviewStatsController);

export default router;
