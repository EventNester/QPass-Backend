import { Readable } from 'stream';
import prisma from '../../database/index.js';
import { ForbiddenError, NotFoundError } from '../../utils/error.js';
import { systemMessages } from '../../config/index.js';

const msg = systemMessages.ERROR;
const BATCH_SIZE = 500;

const CSV_HEADERS = [
  'Name',
  'Email',
  'Phone',
  'Ticket Type',
  'Status',
  'Confirmation Code',
  'QR Issued',
  'Checked In',
  'Registration Date',
];

function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  let str = String(value);
  // Neutralize formula injection when opened in spreadsheet apps
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvRow(reg) {
  return CSV_HEADERS.map((header) => {
    switch (header) {
      case 'Name':
        return escapeCsvField(reg.attendeeName);
      case 'Email':
        return escapeCsvField(reg.attendeeEmail);
      case 'Phone':
        return escapeCsvField(reg.phone);
      case 'Ticket Type':
        return escapeCsvField(reg.ticketType?.name || 'General');
      case 'Status':
        return escapeCsvField(reg.status);
      case 'Confirmation Code':
        return escapeCsvField(reg.confirmationCode || '');
      case 'QR Issued':
        return reg.qrIssued ? 'Yes' : 'No';
      case 'Checked In':
        return (reg._checkedIn ?? (reg.checkins && reg.checkins.length > 0)) ? 'Yes' : 'No';
      case 'Registration Date':
        return escapeCsvField(reg.createdAt ? new Date(reg.createdAt).toISOString() : '');
      default:
        return '';
    }
  }).join(',');
}

async function checkEventOwnership(eventId, userId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { ownerId: true, deletedAt: true },
  });

  if (!event || event.deletedAt) {
    throw new NotFoundError(msg.EVENT.NOT_FOUND);
  }

  if (event.ownerId !== userId) {
    throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
  }
}

export async function createRegistrationCsvStream(eventId, userId) {
  await checkEventOwnership(eventId, userId);

  let skip = 0;
  let hasMore = true;
  let headerWritten = false;
  let reading = false;

  const stream = new Readable({
    objectMode: false,
    async read() {
      if (reading) {
        return;
      }

      try {
        reading = true;

        if (!headerWritten) {
          this.push(CSV_HEADERS.join(',') + '\n');
          headerWritten = true;
        }

        if (!hasMore) {
          this.push(null);
          return;
        }

        const registrations = await prisma.registration.findMany({
          where: { eventId },
          include: {
            ticketType: { select: { name: true } },
            checkins: { select: { id: true }, take: 1 },
          },
          orderBy: { createdAt: 'asc' },
          skip,
          take: BATCH_SIZE,
        });

        if (registrations.length === 0) {
          reading = false;
          this.push(null);
          return;
        }

        skip += registrations.length;
        if (registrations.length < BATCH_SIZE) {
          hasMore = false;
        }

        for (const reg of registrations) {
          this.push(formatCsvRow(reg) + '\n');
        }

        reading = false;
      } catch (err) {
        this.destroy(err);
      }
    },
  });

  return stream;
}
