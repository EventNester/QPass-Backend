import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateParams, validateQuery } from '../../middlewares/validate.middleware.js';
import { uploadAttendees, handleUploadError, requireFile, cleanupOnError } from '../../middlewares/upload.middleware.js';
import { importAttendeesController, getImportBatchController, listImportBatchesController, downloadTemplate } from './import.controller.js';
import { importFileParamsSchema, importBatchParamsSchema, templateQuerySchema } from './import.schema.js';

const router = Router({ mergeParams: true });

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

router.get(
  '/:eventId/import',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importFileParamsSchema),
  listImportBatchesController,
);

router.get(
  '/:eventId/import/:batchId',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importBatchParamsSchema),
  getImportBatchController,
);

router.get(
  '/:eventId/import-template',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importFileParamsSchema),
  validateQuery(templateQuerySchema),
  downloadTemplate,
);

export default router;
