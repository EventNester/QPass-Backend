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
router.post("/:eventId/scan", checkinController.scanQr);

/**
 * @swagger
 * /api/v1/checkins/{eventId}:
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
router.get("/:eventId", checkinController.getCheckins);

/**
 * @swagger
 * /api/v1/checkins/{eventId}/{checkInId}/undo:
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
router.post("/:eventId/:checkInId/undo", checkinController.undoCheckin);

export default router;
