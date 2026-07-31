import { processImportFile, getImportBatchById, listImportBatchesByEvent, generateImportTemplate } from './import.service.js';
import { success } from '../../utils/response.js';
import prisma from '../../database/index.js';
import { ForbiddenError } from '../../utils/error.js';

export const importAttendeesController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const file = req.file;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { ownerId: true },
    });

    if (!event || event.ownerId !== req.user.sub) {
      throw new ForbiddenError('You do not have access to this event');
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

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { ownerId: true },
    });

    if (!event || event.ownerId !== req.user.sub) {
      throw new ForbiddenError('You do not have access to this event');
    }

    const batch = await getImportBatchById(batchId);

    if (!batch || batch.eventId !== eventId) {
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

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { ownerId: true },
    });

    if (!event || event.ownerId !== req.user.sub) {
      throw new ForbiddenError('You do not have access to this event');
    }

    const batches = await listImportBatchesByEvent(eventId);
    return success(res, batches);
  } catch (error) {
    next(error);
  }
};

export const downloadTemplate = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { format } = req.query;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { ownerId: true },
    });

    if (!event || event.ownerId !== req.user.sub) {
      throw new ForbiddenError('You do not have access to this event');
    }

    const fileData = await generateImportTemplate(format);

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="qpass-import-template.pdf"');
      return res.send(fileData);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="qpass-import-template.csv"');
    return res.send(fileData);
  } catch (error) {
    next(error);
  }
};

