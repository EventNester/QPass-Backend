import { Router } from "express";

import {
  exportRegistrationsController,
  exportAttendanceController,
} from "./export.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import {
  validateParams,
  validateQuery,
} from "../../middlewares/validate.middleware.js";
import {
  reportEventIdParamsSchema,
  exportQuerySchema,
} from "./report.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/events/{eventId}/exports/registrations:
 *   get:
 *     summary: Export registrations
 *     description: |
 *       Exports all registrations for an event as a CSV or PDF file download.
 *       Only the event owner or an ADMIN can export.
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
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *           default: csv
 *         description: Export format (defaults to csv)
 *     responses:
 *       200:
 *         description: CSV or PDF file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — caller is neither the event owner nor an ADMIN
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
 *         description: "Validation error. Possible messages: Invalid event ID format, Invalid query parameters"
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
  "/:eventId/exports/registrations",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN"),
  validateParams(reportEventIdParamsSchema),
  validateQuery(exportQuerySchema),
  exportRegistrationsController
);

/**
 * @openapi
 * /api/v1/events/{eventId}/exports/attendance:
 *   get:
 *     summary: Export attendance
 *     description: |
 *       Exports check-in records with attendee information for an event
 *       as a CSV or PDF file download. Only the event owner or an ADMIN can export.
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
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *           default: csv
 *         description: Export format (defaults to csv)
 *     responses:
 *       200:
 *         description: CSV or PDF file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — caller is neither the event owner nor an ADMIN
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
 *         description: "Validation error. Possible messages: Invalid event ID format, Invalid query parameters"
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
  "/:eventId/exports/attendance",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN"),
  validateParams(reportEventIdParamsSchema),
  validateQuery(exportQuerySchema),
  exportAttendanceController
);

export default router;
