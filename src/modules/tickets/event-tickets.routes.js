import { Router } from "express";
import { 
  listTicketsController, 
  exportTicketsController 
} from "./tickets.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { validate, validateQuery } from "../../middlewares/validate.middleware.js";
import { ticketQuerySchema, exportTicketSchema } from "./tickets.schema.js";

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/v1/events/{eventId}/tickets:
 *   get:
 *     summary: List event tickets (registrations)
 *     description: Retrieves a paginated list of tickets for an event. Requires event ownership.
 *     tags: [Tickets]
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
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, CANCELLED]
 *         description: Filter by registration status
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, SUCCESS, FAILED, REFUNDED]
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: List of tickets
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Not event owner)
 */
router.get("/", requireAuth, validateQuery(ticketQuerySchema), listTicketsController);


/**
 * @openapi
 * /api/v1/events/{eventId}/tickets/export:
 *   post:
 *     summary: Export event tickets
 *     description: Exports all tickets for an event as CSV or PDF. Requires event ownership.
 *     tags: [Tickets]
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
 *             required: [format]
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, pdf]
 *     responses:
 *       200:
 *         description: Exported file (CSV or PDF buffer)
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post("/export", requireAuth, validate(exportTicketSchema), exportTicketsController);

export default router;
