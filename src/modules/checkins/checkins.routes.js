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
 *       Requires the caller to be the event owner or an active assigned staff member.
 *       Validates the QR token (not found → INVALID, expired → EXPIRED, registration not
 *       confirmed → INVALID, wrong event → WRONG_EVENT, revoked → REVOKED, already checked
 *       in → DUPLICATE), takes a Redis distributed lock to prevent duplicate in-flight
 *       scans, then creates a CheckIn row (enforced unique by eventId+registrationId).
 *       If the registration has a soft-deleted CheckIn row from an earlier undo, that
 *       row is restored and the result is VALID.
 *       Emits `checkin:update` on the dashboard room after every scan attempt. *     tags: [Checkins]
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
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — requires STAFF or ORGANIZER role and event ownership/assignment
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Scan already in progress (Redis lock held)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: "Validation error. Possible messages: token must not be empty"
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
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — requires STAFF or ORGANIZER role
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
router.get("/:eventId/checkins", requireAuth, requireRole("STAFF", "ORGANIZER"), checkinController.getCheckins);

/**
 * @openapi
 * /api/v1/checkins/{eventId}/checkins/{checkInId}/undo:
 *   post:
 *     summary: Undo a check-in
 *     description: |
 *       Allowed for the event owner or the staff member who performed the check-in,
 *       within 24 hours of the scan. Soft-deletes the CheckIn row (sets deletedAt),
 *       reverts the registration status to CONFIRMED, re-enables the QR token, and
 *       writes an audit log entry with a before-snapshot.
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
 *       400:
 *         description: Check-in is older than 24 hours
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — requires STAFF or ORGANIZER role and event ownership or scanning staff membership
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Check-in not found
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
router.post("/:eventId/checkins/:checkInId/undo", requireAuth, requireRole("STAFF", "ORGANIZER"), checkinController.undoCheckin);

export default router;
