import prisma from '../../database/index.js';
import { logger } from '../../config/index.js';
import crypto from 'crypto';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../../utils/error.js';
import { parseFile } from '../../utils/parsers/index.js';
import { sendNotification } from '../../modules/notifications/notification.service.js';
import { getIO } from '../../realtime/socket.js';
import { emitRegistrationNew } from '../../realtime/rooms.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 standard maximum length for email addresses

/**
 * Split a CSV line into fields, handling double-quoted strings.
 * @param {string} line - A single line of CSV text
 * @returns {string[]} Array of field values
 */
function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Split CSV text into logical rows, handling newlines within double-quoted fields.
 * @param {string} text - Raw CSV text
 * @returns {string[]} Array of row strings
 */
function splitCsvLines(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += '"';
      }
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (current.trim()) {
        rows.push(current);
      }
      current = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    rows.push(current);
  }

  return rows;
}
/**
 * Parse CSV text or array into structured row objects.
 * Throws BadRequestError (400) if the file is empty or has no data rows.
 * @param {string|Buffer|Array<Object>} fileContent - Raw CSV or parsed array
 * @returns {Array<Object>} Array of row objects
 */
export function parseImportFile(fileContent) {
  if (fileContent === null || fileContent === undefined) {
    throw new BadRequestError('Import file is empty. No rows found.');
  }

  if (Array.isArray(fileContent)) {
    if (fileContent.length === 0) {
      throw new BadRequestError('Import file is empty. No rows found.');
    }
    return fileContent;
  }

  const str = Buffer.isBuffer(fileContent) ? fileContent.toString('utf8') : String(fileContent);
  const cleanedStr = str.replace(/^\uFEFF/, '').trim();

  if (!cleanedStr) {
    throw new BadRequestError('Import file is empty. No rows found.');
  }

  const lines = splitCsvLines(cleanedStr);
  if (lines.length <= 1) {
    throw new BadRequestError('Import file is empty. No rows found.');
  }

  const rawHeaders = splitCsvLine(lines[0]);
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/["']/g, '').trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] !== undefined ? values[index].replace(/^["']|["']$/g, '').trim() : '';
    });
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new BadRequestError('Import file is empty. No rows found.');
  }

  return rows;
}

/**
 * Validate a single row from an import batch.
 * @param {Object} row - The row data object
 * @param {number} rowNumber - 1-indexed row number in the file
 * @param {Set<string>} seenEmails - Set of emails already seen in this batch
 * @returns {Object} Validation result { valid, row, email, name, phone, ticketTypeId, error }
 */
export function validateRow(row, rowNumber, seenEmails) {
  const rawEmail = row.email || row.attendeeEmail || row.attendeeemail || '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const rawName = row.name || row.attendeeName || row.attendeename || '';
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const phone = row.phone || row.phoneNumber || row.phonenumber || null;
  const ticketTypeId = row.ticketTypeId || row.ticketType || row.tickettype || row.tickettypeid || null;

  if (!email) {
    return {
      valid: false,
      row: rowNumber,
      email: null,
      error: 'Missing or invalid email address',
    };
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    return {
      valid: false,
      row: rowNumber,
      email,
      error: 'Email address exceeds maximum length of 254 characters',
    };
  }

  if (!EMAIL_REGEX.test(email)) {
    return {
      valid: false,
      row: rowNumber,
      email,
      error: 'Malformed email address',
    };
  }

  if (!name) {
    return {
      valid: false,
      row: rowNumber,
      email,
      error: 'Attendee name is required',
    };
  }

  if (seenEmails.has(email)) {
    return {
      valid: false,
      row: rowNumber,
      email,
      error: 'Duplicate email in batch',
    };
  }

  seenEmails.add(email);

  return {
    valid: true,
    row: rowNumber,
    email,
    name,
    phone,
    ticketTypeId,
  };
}

/**
 * Generate a unique ticket code string for an event.
 * @param {string} eventId - UUID of the event
 * @returns {string} Formatted ticket code
 */
function generateTicketCode(eventId) {
  const prefix = eventId ? eventId.slice(0, 4).toUpperCase() : 'EVNT';
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${rand}`;
}

/**
 * Process an import batch of registrations for an event.
 * Handles row-level validation, duplicate email detection, and error tracking.
 *
 * @param {Object} options - Import options
 * @param {string} options.eventId - Target event ID
 * @param {string} options.uploadedById - User ID uploading the file
 * @param {string|Buffer|Array<Object>} options.fileContent - File contents or parsed array
 * @param {string} [options.fileType='text/csv'] - MIME type of the file
 * @param {string} [options.filename='import.csv'] - Original filename
 * @param {boolean} [options.sendEmails=false] - Whether to send registration notifications
 * @returns {Promise<Object>} The completed ImportBatch record with errorReport
 */
export async function importRegistrations({
  eventId,
  uploadedById,
  fileContent,
  fileType = 'text/csv',
  filename = 'import.csv',
  sendEmails = false,
}) {
  const rows = parseImportFile(fileContent);

  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
  });

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  const batch = await prisma.importBatch.create({
    data: {
      eventId,
      uploadedById,
      originalFilename: filename,
      fileType,
      totalRows: rows.length,
      status: 'PROCESSING',
    },
  });

  const seenEmails = new Set();
  const errorReport = [];
  let successRows = 0;
  let failedRows = 0;
  const BATCH_SIZE = 50;

  const validEntries = [];
  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2;
    const row = rows[i];
    const validation = validateRow(row, rowNumber, seenEmails);

    if (!validation.valid) {
      failedRows++;
      errorReport.push({
        row: rowNumber,
        email: validation.email,
        error: validation.error,
      });
    } else {
      validEntries.push({ rowNumber, validation });
    }
  }

  if (validEntries.length > 0) {
    const emails = validEntries.map((e) => e.validation.email);
    const existingRegs = await prisma.registration.findMany({
      where: { eventId, attendeeEmail: { in: emails } },
      select: { attendeeEmail: true },
    });
    const existingEmailSet = new Set(existingRegs.map((r) => r.attendeeEmail));

    const toCreate = [];
    for (const entry of validEntries) {
      if (existingEmailSet.has(entry.validation.email)) {
        failedRows++;
        errorReport.push({
          row: entry.rowNumber,
          email: entry.validation.email,
          error: 'Attendee is already registered for this event',
        });
      } else {
        toCreate.push(entry);
      }
    }

    const ticketTypeIds = [...new Set(toCreate.map((e) => e.validation.ticketTypeId).filter(Boolean))];
    if (ticketTypeIds.length > 0) {
      const validTicketTypes = await prisma.ticketType.findMany({
        where: { id: { in: ticketTypeIds }, eventId, active: true },
        select: { id: true, capacity: true, quantitySold: true },
      });
      const validTtMap = new Map(validTicketTypes.map((tt) => [tt.id, tt]));

      const filtered = [];
      for (const entry of toCreate) {
        const ttId = entry.validation.ticketTypeId;
        if (!ttId) {
          filtered.push(entry);
          continue;
        }
        const tt = validTtMap.get(ttId);
        if (!tt) {
          failedRows++;
          errorReport.push({
            row: entry.rowNumber,
            email: entry.validation.email,
            error: 'Invalid or inactive ticket type',
          });
          continue;
        }
        if (tt.capacity !== null && tt.quantitySold >= tt.capacity) {
          failedRows++;
          errorReport.push({
            row: entry.rowNumber,
            email: entry.validation.email,
            error: 'Ticket type has reached capacity',
          });
          continue;
        }
        filtered.push(entry);
      }
      toCreate.length = 0;
      toCreate.push(...filtered);
    }

    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const currentBatch = toCreate.slice(i, i + BATCH_SIZE);

      try {
        await prisma.$transaction(async (tx) => {
          for (const entry of currentBatch) {
            const ticketCode = await tx.ticketCode.create({
              data: {
                eventId,
                code: generateTicketCode(eventId),
                status: 'USED',
                attendeeEmail: entry.validation.email,
                attendeeName: entry.validation.name,
              },
            });

            await tx.registration.create({
              data: {
                eventId,
                ticketCodeId: ticketCode.id,
                attendeeEmail: entry.validation.email,
                attendeeName: entry.validation.name,
                phone: entry.validation.phone || null,
                ticketTypeId: entry.validation.ticketTypeId || null,
                source: 'IMPORT',
                status: 'CONFIRMED',
              },
            });
          }
        });

        successRows += currentBatch.length;

        if (sendEmails) {
          await Promise.all(
            currentBatch.map((entry) =>
              sendNotification({
                recipient: entry.validation.email,
                subject: `Registration Confirmed: ${event.title}`,
                template: 'registration',
                context: {
                  name: entry.validation.name,
                  eventTitle: event.title,
                  email: entry.validation.email,
                },
                userId: uploadedById,
                eventId,
              }).catch((err) => {
                logger.warn({ err: err.message, email: entry.validation.email }, 'Failed to send import registration notification');
              })
            )
          );
        }
      } catch (error) {
        logger.error({ err: error, batchStart: i }, 'Batch processing failed');
        for (const entry of currentBatch) {
          failedRows++;
          errorReport.push({
            row: entry.rowNumber,
            email: entry.validation.email,
            error: 'Database error during batch processing',
          });
        }
      }
    }
  }

  const finalStatus = failedRows === rows.length ? 'FAILED' : 'COMPLETED';

  const updatedBatch = await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      successRows,
      failedRows,
      status: finalStatus,
      errorReport: errorReport.length > 0 ? errorReport : null,
      completedAt: new Date(),
    },
  });

  return updatedBatch;
}

/**
 * Handle public registration via public link with strict edge-case validation.
 * Enforces non-empty name, valid email format, and RFC 5321 length limits.
 *
 * @param {Object} data - Registration input
 * @param {string} data.eventId - Event ID
 * @param {string} data.name - Attendee name
 * @param {string} data.email - Attendee email
 * @param {string} [data.phone] - Optional phone number
 * @param {string} [data.ticketTypeId] - Optional ticket type ID
 * @returns {Promise<Object>} The created Registration record
 */
export async function registerPublic({ eventId, name, email, phone, ticketTypeId }) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new BadRequestError('Attendee name is required');
  }

  if (!email || typeof email !== 'string') {
    throw new BadRequestError('Email address is required');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.length > MAX_EMAIL_LENGTH) {
    throw new BadRequestError('Email address exceeds maximum length of 254 characters');
  }

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new BadRequestError('Malformed or invalid email address');
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
  });

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  if (event.status !== 'PUBLISHED') {
    throw new BadRequestError('Event is not open for registration');
  }

  if (ticketTypeId) {
    const ticketType = await prisma.ticketType.findFirst({
      where: { id: ticketTypeId, eventId, active: true },
      select: { id: true, capacity: true, quantitySold: true },
    });
    if (!ticketType) {
      throw new BadRequestError('Invalid or inactive ticket type');
    }
    if (ticketType.capacity !== null && ticketType.quantitySold >= ticketType.capacity) {
      throw new BadRequestError('Ticket type has reached capacity');
    }
  }

  let registration;
  try {
    registration = await prisma.$transaction(async (tx) => {
      const ticketCode = await tx.ticketCode.create({
        data: {
          eventId,
          code: generateTicketCode(eventId),
          status: 'USED',
          attendeeEmail: normalizedEmail,
          attendeeName: name.trim(),
        },
      });

      return tx.registration.create({
        data: {
          eventId,
          ticketCodeId: ticketCode.id,
          attendeeEmail: normalizedEmail,
          attendeeName: name.trim(),
          phone: phone || null,
          ticketTypeId: ticketTypeId || null,
          source: 'PUBLIC_LINK',
          status: 'CONFIRMED',
        },
      });
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError('Attendee with this email is already registered for this event');
    }
    throw error;
  }

  await sendNotification({
    recipient: normalizedEmail,
    subject: `Registration Confirmed: ${event.title}`,
    template: 'registration',
    context: {
      name: name.trim(),
      eventTitle: event.title,
      email: normalizedEmail,
    },
    eventId,
  }).catch((err) => {
    logger.warn({ err: err.message, email: normalizedEmail }, 'Failed to send public registration notification');
  });

  return registration;
}

export async function getImportBatchById(id) {
  const batch = await prisma.importBatch.findUnique({
    where: { id },
  });
  if (!batch) {
    throw new NotFoundError('Import batch not found');
  }
  return batch;
}

export async function listImportBatchesByEvent(eventId) {
  return prisma.importBatch.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Full import pipeline from file upload to completed batch.
 *
 * 1. Parse file rows via the format-specific parser.
 * 2. Validate each row (email format, required fields, batch-level dupes).
 * 3. De-duplicate against existing registrations for the event.
 * 4. Create TicketCode + Registration + QrToken per valid row in batches.
 * 5. Send a batch summary email with success/failure counts.
 * 6. Create an audit log entry.
 *
 * @param {Object} options
 * @param {string} options.eventId - Target event ID
 * @param {string} options.uploadedById - User ID uploading the file
 * @param {Buffer} options.fileBuffer - Raw file buffer
 * @param {string} options.filename - Original filename (used for format detection)
 * @param {string} [options.fileType] - MIME type override
 * @param {boolean} [options.sendEmails=true] - Whether to send batch summary
 * @returns {Promise<Object>} The completed ImportBatch record
 */
export async function processImportFile({
  eventId,
  uploadedById,
  fileBuffer,
  filename,
  fileType,
  sendEmails = true,
}) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, endTime: true, ownerId: true, deletedAt: true },
  });

  if (!event || event.deletedAt) {
    throw new NotFoundError('Event not found');
  }

  if (event.ownerId !== uploadedById) {
    throw new ForbiddenError('You do not have access to this event');
  }

  const parsed = await parseFile(fileBuffer, filename, fileType);

  const { rows, errors: parseErrors } = parsed;

  const batch = await prisma.importBatch.create({
    data: {
      eventId,
      uploadedById,
      originalFilename: filename,
      fileType: fileType || 'unknown',
      totalRows: rows.length + parseErrors.length,
      status: 'PROCESSING',
      errorReport: parseErrors.length > 0 ? parseErrors : null,
    },
  });

  const seenEmails = new Set();
  const validationErrors = [];
  const validEntries = [];
  const BATCH_SIZE = 50;

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = row.sourceRow || (i + 2);
      const validation = validateRow(row, rowNumber, seenEmails);

      if (!validation.valid) {
        validationErrors.push({
          row: rowNumber,
          email: validation.email,
          error: validation.error,
        });
      } else {
        validEntries.push({ rowNumber, validation });
      }
    }
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'FAILED', completedAt: new Date() },
    }).catch((err) => logger.error({ err, batchId: batch.id }, 'Failed to mark batch FAILED'));
    throw error;
  }

  const existingEmailSet = new Set();
  if (validEntries.length > 0) {
    const emails = validEntries.map((e) => e.validation.email);
    const existingRegs = await prisma.registration.findMany({
      where: { eventId, attendeeEmail: { in: emails } },
      select: { attendeeEmail: true },
    });
    for (const r of existingRegs) {
      existingEmailSet.add(r.attendeeEmail);
    }
  }

  const toCreate = [];
  for (const entry of validEntries) {
    if (existingEmailSet.has(entry.validation.email)) {
      validationErrors.push({
        row: entry.rowNumber,
        email: entry.validation.email,
        error: 'Attendee is already registered for this event',
      });
    } else {
      toCreate.push(entry);
    }
  }

  const ticketTypeIds = [...new Set(toCreate.map((e) => e.validation.ticketTypeId).filter(Boolean))];
  const claimsByTicketType = new Map();
  if (ticketTypeIds.length > 0) {
    const eventTicketTypes = await prisma.ticketType.findMany({
      where: { eventId, active: true },
      select: { id: true, name: true, capacity: true, quantitySold: true },
    });
    const validTtById = new Map(eventTicketTypes.map((tt) => [tt.id.toLowerCase(), tt]));
    const validTtByName = new Map(eventTicketTypes.map((tt) => [(tt.name || '').toLowerCase(), tt]));

    const filtered = [];
    for (const entry of toCreate) {
      const rawValue = entry.validation.ticketTypeId;
      if (!rawValue) {
        filtered.push(entry);
        continue;
      }
      const key = rawValue.trim().toLowerCase();
      const tt = validTtById.get(key) || validTtByName.get(key);
      if (!tt) {
        validationErrors.push({
          row: entry.rowNumber,
          email: entry.validation.email,
          error: 'Invalid or inactive ticket type',
        });
        continue;
      }
      entry.validation.ticketTypeId = tt.id;
      const claimed = claimsByTicketType.get(tt.id) || 0;
      if (tt.capacity !== null && (tt.quantitySold + claimed) >= tt.capacity) {
        validationErrors.push({
          row: entry.rowNumber,
          email: entry.validation.email,
          error: 'Ticket type has reached capacity',
        });
        continue;
      }
      claimsByTicketType.set(tt.id, claimed + 1);
      filtered.push(entry);
    }
    toCreate.length = 0;
    toCreate.push(...filtered);
  }

  let successRows = 0;
  let failedRows = parseErrors.length + validationErrors.length;

  const allErrors = [...parseErrors, ...validationErrors];
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const currentBatch = toCreate.slice(i, i + BATCH_SIZE);
    const createdRegistrations = [];

    try {
      await prisma.$transaction(async (tx) => {
        for (const entry of currentBatch) {
          const ttId = entry.validation.ticketTypeId;
          if (ttId && claimsByTicketType.has(ttId)) {
            const tt = await tx.ticketType.findUnique({
              where: { id: ttId },
              select: { id: true, capacity: true, quantitySold: true },
            });
            if (tt.capacity !== null && tt.quantitySold >= tt.capacity) {
              throw new Error('Ticket type has reached capacity');
            }
            await tx.ticketType.update({
              where: { id: ttId },
              data: { quantitySold: { increment: 1 } },
            });
          }

          const ticketCode = await tx.ticketCode.create({
            data: {
              eventId,
              code: generateTicketCode(eventId),
              status: 'USED',
              attendeeEmail: entry.validation.email,
              attendeeName: entry.validation.name,
            },
          });

          const registration = await tx.registration.create({
            data: {
              eventId,
              ticketCodeId: ticketCode.id,
              attendeeEmail: entry.validation.email,
              attendeeName: entry.validation.name,
              phone: entry.validation.phone || null,
              ticketTypeId: entry.validation.ticketTypeId || null,
              source: 'IMPORT',
              status: 'CONFIRMED',
              qrIssued: true,
              qrIssuedAt: new Date(),
            },
          });
          createdRegistrations.push(registration);

          const rawToken = crypto.randomBytes(32).toString('hex');
          await tx.qrToken.create({
            data: {
              registrationId: registration.id,
              tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
              expiresAt: event.endTime,
            },
          });
        }
      });

      successRows += currentBatch.length;

      for (const registration of createdRegistrations) {
        try {
          emitRegistrationNew(getIO(), eventId, {
            registrationId: registration.id,
            attendeeName: registration.attendeeName,
            attendeeEmail: registration.attendeeEmail,
            ticketTypeId: registration.ticketTypeId || null,
          });
        } catch (err) {
          logger.warn({ err, eventId, registrationId: registration.id }, 'failed to emit registration:new');
        }
      }
    } catch (error) {
      logger.error({ err: error, batchStart: i }, 'Import batch transaction failed');
      for (const entry of currentBatch) {
        failedRows++;
        allErrors.push({
          row: entry.rowNumber,
          email: entry.validation.email,
          error: 'Database error during batch processing',
        });
      }
    }
  }

  const finalStatus = successRows === 0 ? 'FAILED' : 'COMPLETED';

  const updatedBatch = await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      successRows,
      failedRows,
      status: finalStatus,
      errorReport: allErrors.length > 0 ? allErrors : null,
      completedAt: new Date(),
    },
  });

  if (sendEmails) {
    const user = await prisma.user.findUnique({
      where: { id: uploadedById },
      select: { email: true },
    });
    sendNotification({
      recipient: user ? user.email : uploadedById,
      subject: `Import Complete: ${successRows} imported, ${failedRows} errors`,
      template: 'import-summary',
      context: {
        eventTitle: event.title,
        totalRows: rows.length + parseErrors.length,
        successRows,
        failedRows,
        errors: allErrors,
      },
      userId: uploadedById,
      eventId,
    }).catch((err) => {
      logger.warn({ err: err.message, batchId: batch.id }, 'Failed to send import summary notification');
    });
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorId: uploadedById,
        action: 'IMPORT',
        entity: 'ImportBatch',
        entityId: updatedBatch.id,
        afterSnapshot: {
          eventId,
          totalRows: rows.length + parseErrors.length,
          successRows,
          failedRows,
          filename,
        },
      },
    });
  } catch (error) {
    logger.warn({ err: error.message }, 'Failed to create audit log for import');
  }

  return updatedBatch;
}

/**
 * Generate a template file for importing attendees.
 * @param {'csv'|'pdf'} format - The requested template format.
 * @returns {Promise<Buffer|string>} The template data (Buffer for PDF, string for CSV)
 */
export async function generateImportTemplate(format) {
  if (format === 'pdf') {
    const { default: PDFDocument } = await import('pdfkit');
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(20).text('QPass Attendee Import Template', { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(12).text('Please ensure your document contains a table with the following columns:');
        doc.moveDown();

        doc.font('Helvetica-Bold').text('Name', { continued: true }).font('Helvetica').text(' (Required)');
        doc.font('Helvetica-Bold').text('Email', { continued: true }).font('Helvetica').text(' (Required)');
        doc.font('Helvetica-Bold').text('Phone', { continued: true }).font('Helvetica').text(' (Optional)');
        doc.font('Helvetica-Bold').text('TicketType', { continued: true }).font('Helvetica').text(' (Optional)');
        
        doc.moveDown();
        doc.text('Example Table:', { underline: true });
        doc.moveDown();

        const tableTop = doc.y;
        
        doc.font('Helvetica-Bold');
        doc.text('Name', 50, tableTop);
        doc.text('Email', 200, tableTop);
        doc.text('Phone', 350, tableTop);
        doc.text('TicketType', 450, tableTop);
        
        doc.font('Helvetica');
        doc.text('John Doe', 50, tableTop + 20);
        doc.text('john@example.com', 200, tableTop + 20);
        doc.text('08012345678', 350, tableTop + 20);
        doc.text('VIP', 450, tableTop + 20);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Default to CSV
  return '"Name","Email","Phone","TicketType"\n"John Doe","john@example.com","08012345678","VIP"';
}
