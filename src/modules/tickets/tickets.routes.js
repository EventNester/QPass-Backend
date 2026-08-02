import { Router } from "express";
import { 
  createTicketTypeController, 
  getTicketTypesController, 
  updateTicketTypeController, 
  deleteTicketTypeController 
} from "./tickets.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createTicketTypeSchema, updateTicketTypeSchema } from "./tickets.schema.js";

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/v1/events/{eventId}/ticket-types:
 *   post:
 *     summary: Create a new ticket type
 *     description: Creates a new ticket type for an event. Requires authentication and event ownership.
 *     tags: [Ticket Types]
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
 *             type: object
 *             required: [name, price]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: integer
 *               capacity:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Ticket type created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Event not found
 */
router.post("/", requireAuth, requireRole("ORGANIZER", "ADMIN"), validate(createTicketTypeSchema), createTicketTypeController);

/**
 * @openapi
 * /api/v1/events/{eventId}/ticket-types:
 *   get:
 *     summary: List ticket types
 *     description: Retrieves all ticket types for a given event.
 *     tags: [Ticket Types]
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
 *         description: List of ticket types
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Event not found
 */
router.get("/", requireAuth, requireRole("ORGANIZER", "ADMIN"), getTicketTypesController);

/**
 * @openapi
 * /api/v1/events/{eventId}/ticket-types/{id}:
 *   patch:
 *     summary: Update a ticket type
 *     description: Updates an existing ticket type.
 *     tags: [Ticket Types]
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
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ticket Type ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: integer
 *               capacity:
 *                 type: integer
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Ticket type updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Event or Ticket type not found
 */
router.patch("/:id", requireAuth, requireRole("ORGANIZER", "ADMIN"), validate(updateTicketTypeSchema), updateTicketTypeController);

/**
 * @openapi
 * /api/v1/events/{eventId}/ticket-types/{id}:
 *   delete:
 *     summary: Delete a ticket type
 *     description: Deletes a ticket type. Fails if there are associated registrations.
 *     tags: [Ticket Types]
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
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ticket Type ID
 *     responses:
 *       200:
 *         description: Ticket type deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Event or Ticket type not found
 *       409:
 *         description: Cannot delete due to existing registrations
 */
router.delete("/:id", requireAuth, requireRole("ORGANIZER", "ADMIN"), deleteTicketTypeController);

export default router;
