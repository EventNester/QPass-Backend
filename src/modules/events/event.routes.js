import { Router } from "express";

import {
  createEventController,
  getEventController,
  listEventsController,
  updateEventController,
  deleteEventController,
} from "./event.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";

const router = Router();

/**
 * @openapi
 * /api/v1/events:
 *   post:
 *     summary: Create a new event
 *     description: Creates an event. Requires authentication. Organiser role auto-assigned to creator.
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
 */
router.post("/", requireAuth, createEventController);

/**
 * @openapi
 * /api/v1/events:
 *   get:
 *     summary: List all events
 *     description: Returns a paginated list of events. Public endpoint.
 *     tags: [Events]
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
 *     responses:
 *       200:
 *         description: List of events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EventResponse'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 */
router.get("/", listEventsController);

/**
 * @openapi
 * /api/v1/events/{id}:
 *   get:
 *     summary: Get event by ID
 *     description: Returns a single event by its ID. Public endpoint.
 *     tags: [Events]
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
 *       404:
 *         description: Event not found
 */
router.get("/:id", getEventController);

/**
 * @openapi
 * /api/v1/events/{id}:
 *   patch:
 *     summary: Update an event
 *     description: Updates an existing event. Requires authentication. Only the organiser can update.
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
 *       404:
 *         description: Event not found
 */
router.patch("/:id", requireAuth, updateEventController);

/**
 * @openapi
 * /api/v1/events/{id}:
 *   delete:
 *     summary: Delete an event
 *     description: Deletes an event. Requires authentication. Only the organiser can delete.
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
 *       404:
 *         description: Event not found
 */
router.delete("/:id", requireAuth, deleteEventController);

export default router;
