import { Router } from "express";
import * as checkinController from "./checkins.controller.js";

const router = Router();

/**
 * @swagger
 * /api/v1/checkins/{eventId}/scan:
 *   post:
 *     summary: Scan a QR code to check in an attendee
 *     description: |
 *       Validates the QR token, takes a Redis distributed lock to prevent duplicate
 *       in-flight scans, then creates a CheckIn row (enforced unique by eventId+registrationId).
 *       Records an audit log entry on duplicate attempts.
 *     tags: [Checkins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *         description: The event id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScanRequest'
 *     responses:
 *       200:
 *         description: Scan processed (may be VALID, DUPLICATE, or INVALID — check `data.result`)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   $ref: '#/components/schemas/ScanResult'
 *       401: { description: Missing or invalid token, $ref: '#/components/schemas/ErrorResponse' }
 *       409: { description: Scan already in progress, $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/:eventId/scan", checkinController.scanQr);

/**
 * @swagger
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
 *         description: Array of check-ins (newest first)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items: { type: object }
 *       401: { description: Unauthorized, $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/:eventId/checkins", checkinController.getCheckins);

/**
 * @swagger
 * /api/v1/checkins/{eventId}/checkins/{checkInId}/undo:
 *   post:
 *     summary: Undo a check-in
 *     description: Deletes a check-in row and writes an audit log entry capturing the snapshot.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { type: object, properties: { success: { type: boolean } } }
 *       404: { description: Check-in not found, $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/:eventId/checkins/:checkInId/undo", checkinController.undoCheckin);

export default router;
