import { Router } from "express";

import {
  createEventController,
  getEventController,
  listEventsController,
  updateEventController,
  deleteEventController,
  publishEventController,
  unpublishEventController,
  cancelEventController,
} from "./event.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import {
  validateParams,
  validateQuery,
} from "../../middlewares/validate.middleware.js";
import {
  eventIdParamsSchema,
  eventListQuerySchema,
} from "./event.schema.js";

const router = Router();

/**
 * @openapi
 * /api/v1/events/{id}/publish:
 *   post:
 *     summary: Publish a draft event
 *     description: |
 *       Transitions an event from DRAFT to PUBLISHED and generates a unique public slug.
 *       Only the event owner or an ADMIN can publish, and only while the event is in DRAFT status.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event published successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EventResponse'
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
 *         description: "Validation error. Possible messages: Invalid event ID format, Event is not in draft status"
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
// Publish Event
router.post(
  "/:id/publish",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN"),
  validateParams(eventIdParamsSchema),
  publishEventController
);

/**
 * @openapi
 * /api/v1/events/{id}/unpublish:
 *   post:
 *     summary: Unpublish a published or active event
 *     description: |
 *       Transitions a PUBLISHED or ACTIVE event back to DRAFT status.
 *       The unique slug is preserved. Only the event owner or an ADMIN can
 *       unpublish, and only while the event is in PUBLISHED or ACTIVE status.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event unpublished successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EventResponse'
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
 *         description: "Validation error. Possible messages: Invalid event ID format, Event is not in published status"
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
// Unpublish Event
router.post(
  "/:id/unpublish",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN"),
  validateParams(eventIdParamsSchema),
  unpublishEventController
);

/**
 * @openapi
 * /api/v1/events/{id}/cancel:
 *   post:
 *     summary: Cancel a published event
 *     description: |
 *       Transitions an event to CANCELLED status. Draft events cannot be cancelled
 *       (use delete instead). Only the event owner or an ADMIN can cancel.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EventResponse'
 *       401:
 *         description: Unauthorized — missing or invalid Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — caller is not the event owner
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
 *         description: "Validation error. Possible messages: Invalid event ID format, Cannot cancel a draft event, Event is already cancelled"
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
// Cancel Event
router.post(
  "/:id/cancel",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN"),
  validateParams(eventIdParamsSchema),
  cancelEventController
);

/**
 * @openapi
 * /api/v1/events:
 *   post:
 *     summary: Create a new event
 *     description: Creates an event. Requires ORGANIZER (or ADMIN) role.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EventCreateRequest'
 *     responses:
 *       201:
 *         description: Event created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EventResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — caller must be ORGANIZER or ADMIN
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN"),
  createEventController
);

/**
 * @openapi
 * /api/v1/events:
 *   get:
 *     summary: List events
 *     description: |
 *       Returns a paginated list of events. ORGANIZER sees their own events;
 *       ADMIN sees all non-deleted events. Public event access goes through
 *       `GET /api/v1/e/{slug}`.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PUBLISHED, ACTIVE, COMPLETED, CANCELLED]
 *         description: Filter by event status
 *     responses:
 *       200:
 *         description: List of events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/EventResponse'
 *                     pagination:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — caller must be ORGANIZER or ADMIN
 *       422:
 *         description: Validation error
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
  requireRole("ORGANIZER", "ADMIN"),
  validateQuery(eventListQuerySchema),
  listEventsController
);

/**
 * @openapi
 * /api/v1/events/{id}:
 *   get:
 *     summary: Get event by ID
 *     description: |
 *       Returns a single event by its ID. Only the event owner (ORGANIZER)
 *       or an ADMIN can view a private event. Public event access goes through
 *       `GET /api/v1/e/{slug}`.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EventResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — caller is not the event owner
 *       404:
 *         description: Event not found
 *       422:
 *         description: Invalid event ID format
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/:id",
  requireAuth,
  validateParams(eventIdParamsSchema),
  getEventController
);

/**
 * @openapi
 * /api/v1/events/{id}:
 *   patch:
 *     summary: Update an event
 *     description: Updates an existing event. Only the event owner or an ADMIN can update.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             $ref: '#/components/schemas/EventUpdateRequest'
 *     responses:
 *       200:
 *         description: Event updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EventResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — caller is neither the event owner nor an ADMIN
 *       404:
 *         description: Event not found
 *       422:
 *         description: "Validation error. Possible messages: Invalid event ID format"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  "/:id",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN"),
  validateParams(eventIdParamsSchema),
  updateEventController
);

/**
 * @openapi
 * /api/v1/events/{id}:
 *   delete:
 *     summary: Delete an event
 *     description: Deletes an event. Only the event owner or an ADMIN can delete.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — caller is neither the event owner nor an ADMIN
 *       404:
 *         description: Event not found
 *       422:
 *         description: Invalid event ID format
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole("ORGANIZER", "ADMIN"),
  validateParams(eventIdParamsSchema),
  deleteEventController
);

export default router;