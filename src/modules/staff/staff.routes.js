import { Router } from "express";
import {
  assignStaffController,
  listStaffController,
  removeStaffController,
} from "./staff.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { assignStaffSchema } from "./staff.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/events/{eventId}/staff:
 *   post:
 *     summary: Assign staff to an event
 *     description: |
 *       Assigns a user as staff for the event. If no account exists for the email,
 *       a pending STAFF user is created. Creates an EventStaffAssignment and sends
 *       a staff invite notification. Requires event ownership.
 *     tags: [Staff]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StaffAssignmentRequest'
 *     responses:
 *       201:
 *         description: Staff assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StaffAssignmentResponse'
 *       400:
 *         description: Validation error — invalid email
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
 *         description: Forbidden — requires ORGANIZER role, event ownership, or cannot assign a privileged user as staff
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
 *       409:
 *         description: User is already assigned as staff for this event
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/:eventId/staff", requireAuth, requireRole("ORGANIZER"), validate(assignStaffSchema), assignStaffController);

/**
 * @openapi
 * /api/v1/events/{eventId}/staff:
 *   get:
 *     summary: List event staff
 *     description: Returns the active staff assignments for the event, newest first. Requires event ownership.
 *     tags: [Staff]
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
 *         description: List of staff assignments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StaffListResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — requires ORGANIZER role and event ownership
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
 */
router.get("/:eventId/staff", requireAuth, requireRole("ORGANIZER"), listStaffController);

/**
 * @openapi
 * /api/v1/events/{eventId}/staff/{staffId}:
 *   delete:
 *     summary: Remove staff from an event
 *     description: Deletes the staff assignment and records an audit log entry. Requires event ownership.
 *     tags: [Staff]
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
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Staff assignment ID
 *     responses:
 *       200:
 *         description: Staff removed
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
 *                         id:
 *                           type: string
 *                         eventId:
 *                           type: string
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — requires ORGANIZER role and event ownership
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Event or staff assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:eventId/staff/:staffId", requireAuth, requireRole("ORGANIZER"), removeStaffController);

export default router;
