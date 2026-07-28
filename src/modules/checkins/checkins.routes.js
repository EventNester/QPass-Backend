import { Router } from "express";
import * as checkinController from "./checkins.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { scanQrSchema } from "./checkins.schema.js";

const router = Router();

// Note on Routing Design:
// This router is mounted at /api/v1/checkins.
// Some endpoints below include an additional /checkins namespace segment
// (e.g., /:eventId/checkins/:checkInId/undo). This is intentional to prevent
// ambiguous route parameters and ensure the paths remain self-documenting.

/**
 * @openapi
 * /api/v1/checkins/{eventId}/scan:
 *   post:
 *     summary: Scan a QR code to check in an attendee
 *     description: |
 *       Validates the QR token, takes a Redis distributed lock to prevent duplicate
 *       in-flight scans, then creates a CheckIn row (enforced unique by eventId+registrationId).
 *     tags: [Checkins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScanRequest'
 *     responses:
 *       200:
 *         description: Scan processed
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ScanResult'
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Scan already in progress
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/:eventId/scan", requireAuth, requireRole("STAFF", "ORGANIZER"), validate(scanQrSchema), checkinController.scanQr);

/**
 * @openapi
 * /api/v1/checkins/{eventId}/checkins:
 *   get:
 *     summary: List all check-ins for an event
 *     tags: [Checkins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of check-ins
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { type: object }
 */
router.get("/:eventId/checkins", requireAuth, requireRole("STAFF", "ORGANIZER"), checkinController.getCheckins);

/**
 * @openapi
 * /api/v1/checkins/{eventId}/checkins/{checkInId}/undo:
 *   post:
 *     summary: Undo a check-in
 *     tags: [Checkins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: checkInId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Check-in undone
 *       404:
 *         description: Check-in not found
 */
router.post("/:eventId/checkins/:checkInId/undo", requireAuth, requireRole("STAFF", "ORGANIZER"), checkinController.undoCheckin);

export default router;
