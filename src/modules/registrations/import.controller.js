import { processImportFile, getImportBatchById, listImportBatchesByEvent } from './import.service.js';
import { success } from '../../utils/response.js';
import { ValidationError } from '../../utils/error.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importAttendeesController = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!UUID_REGEX.test(eventId)) {
      throw new ValidationError('Invalid event ID format');
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    const result = await processImportFile({
      eventId,
      uploadedById: req.user.sub,
      fileBuffer: file.buffer,
      filename: file.originalname,
      fileType: file.mimetype,
      sendEmails: true,
    });

    return success(res, {
      batchId: result.id,
      status: result.status,
      totalRows: result.totalRows,
      successRows: result.successRows,
      failedRows: result.failedRows,
      errors: result.errorReport,
    }, 'Import completed');
  } catch (error) {
    next(error);
  }
};

export const getImportBatchController = async (req, res, next) => {
  try {
    const { eventId, batchId } = req.params;

    if (!UUID_REGEX.test(eventId) || !UUID_REGEX.test(batchId)) {
      throw new ValidationError('Invalid ID format');
    }

    const batch = await getImportBatchById(batchId);

    if (batch.eventId !== eventId) {
      return res.status(404).json({ status: 'error', message: 'Import batch not found for this event' });
    }

    return success(res, batch);
  } catch (error) {
    next(error);
  }
};

export const listImportBatchesController = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!UUID_REGEX.test(eventId)) {
      throw new ValidationError('Invalid event ID format');
    }

    const batches = await listImportBatchesByEvent(eventId);
    return success(res, batches);
  } catch (error) {
    next(error);
  }
};
