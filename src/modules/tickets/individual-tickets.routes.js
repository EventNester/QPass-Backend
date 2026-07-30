import { Router } from "express";
import { 
  getTicketController,
  downloadTicketPdfController 
} from "./tickets.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/v1/tickets/{ticketId}:
 *   get:
 *     summary: Get ticket details
 *     description: Retrieves details of a specific ticket (registration) including the QR code data URL.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ticket/Registration ID
 *     responses:
 *       200:
 *         description: Ticket details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get("/:ticketId", requireAuth, getTicketController);

/**
 * @openapi
 * /api/v1/tickets/{ticketId}/download:
 *   get:
 *     summary: Download ticket PDF
 *     description: Generates and downloads a PDF version of the ticket containing event details and QR code.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ticket/Registration ID
 *     responses:
 *       200:
 *         description: PDF file buffer
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get("/:ticketId/download", requireAuth, downloadTicketPdfController);

export default router;
