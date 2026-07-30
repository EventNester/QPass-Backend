import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateParams } from '../../middlewares/validate.middleware.js';
import { uploadAttendees, handleUploadError, requireFile, cleanupOnError } from '../../middlewares/upload.middleware.js';
import { importAttendeesController, getImportBatchController, listImportBatchesController } from './import.controller.js';
import { importFileParamsSchema, importBatchParamsSchema } from './import.schema.js';

const router = Router({ mergeParams: true });

router.post(
  '/import',
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
  '/import',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importFileParamsSchema),
  listImportBatchesController,
);

router.get(
  '/import/:batchId',
  requireAuth,
  requireRole('ORGANIZER'),
  validateParams(importBatchParamsSchema),
  getImportBatchController,
);

export default router;
