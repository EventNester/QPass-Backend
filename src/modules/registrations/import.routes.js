import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { uploadAttendees, handleUploadError, requireFile, cleanupOnError } from '../../middlewares/upload.middleware.js';
import { importAttendeesController, getImportBatchController, listImportBatchesController } from './import.controller.js';

const router = Router({ mergeParams: true });

router.post(
  '/import',
  requireAuth,
  requireRole('ORGANIZER'),
  uploadAttendees.single('file'),
  handleUploadError,
  requireFile,
  cleanupOnError,
  importAttendeesController,
);

router.get(
  '/import',
  requireAuth,
  requireRole('ORGANIZER'),
  listImportBatchesController,
);

router.get(
  '/import/:batchId',
  requireAuth,
  requireRole('ORGANIZER'),
  getImportBatchController,
);

export default router;
