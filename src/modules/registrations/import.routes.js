import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateParams, validateQuery } from '../../middlewares/validate.middleware.js';
import { uploadAttendees, handleUploadError, requireFile, cleanupOnError } from '../../middlewares/upload.middleware.js';
import { importAttendeesController, getImportBatchController, listImportBatchesController, downloadTemplate } from './import.controller.js';
import { importFileParamsSchema, importBatchParamsSchema, templateQuerySchema } from './import.schema.js';

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/v1/events/{eventId}/import:
 *   post:
 *     summary: Import attendees from a file
 *     description: |
 *       Uploads a CSV, XLSX, PDF or DOCX file to batch-import attendees into an event.
 *       Each row creates a Registration, TicketCode and QrToken. Returns an import
 *       summary with per-row errors. Requires event ownership.
 *     tags: [Import]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV, XLSX, PDF or DOCX file with Name, Email, Phone, TicketType columns
 *     responses:
 *       201:
 *         description: Import completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImportSummaryResponse'
 *       400:
 *         description: Validation error, unsupported file type, empty file or no valid rows
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
 *       413:
 *         description: File too large
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/:eventId/import',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importFileParamsSchema),
  uploadAttendees.single('file'),
  handleUploadError,
  requireFile,
  importAttendeesController,
  cleanupOnError,
);

/**
 * @openapi
 * /api/v1/events/{eventId}/import:
 *   get:
 *     summary: List import batches for an event
 *     description: Returns all import batches for the event, newest first. Requires event ownership.
 *     tags: [Import]
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
 *         description: List of import batches
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImportBatchListResponse'
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
router.get(
  '/:eventId/import',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importFileParamsSchema),
  listImportBatchesController,
);

/**
 * @openapi
 * /api/v1/events/{eventId}/import/{batchId}:
 *   get:
 *     summary: Get an import batch
 *     description: Returns a single import batch with its success/failure summary and per-row error report. Requires event ownership.
 *     tags: [Import]
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
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Import batch ID
 *     responses:
 *       200:
 *         description: Import batch details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ImportBatch'
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
 *         description: Event or import batch not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/:eventId/import/:batchId',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importBatchParamsSchema),
  getImportBatchController,
);

/**
 * @openapi
 * /api/v1/events/{eventId}/import-template:
 *   get:
 *     summary: Download the attendee import template
 *     description: |
 *       Downloads a CSV or PDF template describing the expected columns
 *       (Name, Email, Phone, TicketType) for the import endpoint. Requires event ownership.
 *     tags: [Import]
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
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *           default: csv
 *         description: Template format
 *     responses:
 *       200:
 *         description: Template file (CSV or PDF)
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
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
router.get(
  '/:eventId/import-template',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importFileParamsSchema),
  validateQuery(templateQuerySchema),
  downloadTemplate,
);

export default router;
