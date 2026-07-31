import { processImportFile, getImportBatchById, listImportBatchesByEvent, generateImportTemplate } from './import.service.js';
import { readFile } from 'node:fs/promises';
import { success } from '../../utils/response.js';
import prisma from '../../database/index.js';
import { ForbiddenError, NotFoundError } from '../../utils/error.js';
import { systemMessages } from '../../config/index.js';

async function assertEventOwner(req, eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { ownerId: true },
  });

  if (!event) {
    throw new NotFoundError(systemMessages.ERROR.EVENT.NOT_FOUND);
  }

  if (event.ownerId !== req.user.id) {
    throw new ForbiddenError(systemMessages.ERROR.IMPORT.NOT_EVENT_OWNER);
  }
}

export const importAttendeesController = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const file = req.file;

    await assertEventOwner(req, eventId);

    const result = await processImportFile({
      eventId,
      uploadedById: req.user.id,
      fileBuffer: await readFile(file.path),
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
    }, systemMessages.SUCCESS.IMPORT.COMPLETED);
  } catch (error) {
    next(error);
  }
};

export const getImportBatchController = async (req, res, next) => {
  try {
    const { eventId, batchId } = req.params;

    await assertEventOwner(req, eventId);

    const batch = await getImportBatchById(batchId);

    if (!batch || batch.eventId !== eventId) {
      return res.status(404).json({ status: 'error', message: systemMessages.ERROR.IMPORT.BATCH_NOT_FOUND });
    }

    return success(res, batch);
  } catch (error) {
    next(error);
  }
};

export const listImportBatchesController = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    await assertEventOwner(req, eventId);

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

    await assertEventOwner(req, eventId);

    const fileData = await generateImportTemplate(format);

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="qpass-import-template.pdf"');
      return res.send(fileData);
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="qpass-import-template.csv"');
    return res.send(fileData);
  } catch (error) {
    next(error);
  }
};
