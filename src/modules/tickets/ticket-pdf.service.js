import PDFDocument from 'pdfkit';
import { qrService } from './qr.service.js';
import prisma from '../../database/index.js';
import { NotFoundError, ForbiddenError } from '../../utils/error.js';
import { systemMessages } from '../../config/index.js';

const msg = systemMessages.ERROR;
const NAME_MAX_CHARS_PER_LINE = 40;

export async function generateTicketPdf(ticketId, userId) {
  const registration = await prisma.registration.findUnique({
    where: { id: ticketId },
    include: {
      event: true,
      ticketCode: true,
      ticketType: true,
      qrToken: true,
    },
  });

  if (!registration || registration.event?.deletedAt) {
    throw new NotFoundError(msg.TICKET.NOT_FOUND);
  }

  if (registration.event.ownerId !== userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user || user.email !== registration.attendeeEmail) {
      throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
    }
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 50, right: 50 },
    info: {
      Title: `Ticket - ${registration.event.title}`,
      Author: 'QPass',
    },
  });

  doc.fontSize(24).font('Helvetica-Bold').text('QPass', { align: 'center' });
  doc.moveDown(0.5);

  doc.fontSize(18).font('Helvetica-Bold').text(registration.event.title, { align: 'center' });
  doc.moveDown(0.5);

  const eventDate = new Date(registration.event.startTime).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const venue = registration.event.venue || 'No venue specified';
  doc.fontSize(11).font('Helvetica').text(`${eventDate} | ${venue}`, { align: 'center' });
  doc.moveDown(1.5);

  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
  doc.moveDown(1);

  doc.fontSize(14).font('Helvetica-Bold').text('Attendee');
  doc.moveDown(0.5);

  const attendeeName = registration.attendeeName || '';
  const nameLines = wrapText(attendeeName, NAME_MAX_CHARS_PER_LINE);
  doc.fontSize(12).font('Helvetica');
  for (const line of nameLines) {
    doc.text(line);
  }

  doc.fontSize(11).font('Helvetica');
  doc.text(`Email: ${registration.attendeeEmail}`);
  if (registration.phone) {
    doc.text(`Phone: ${registration.phone}`);
  }
  doc.moveDown(1);

  doc.fontSize(14).font('Helvetica-Bold').text('Ticket Details');
  doc.moveDown(0.5);

  doc.fontSize(11).font('Helvetica');
  doc.text(`Ticket Type: ${registration.ticketType?.name || 'General'}`);
  doc.text(`Confirmation Code: ${registration.confirmationCode || 'N/A'}`);
  doc.text(`Status: ${registration.status}`);

  const startTime = new Date(registration.event.startTime).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });
  const endTime = new Date(registration.event.endTime).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });
  doc.text(`Time: ${startTime} - ${endTime}`);
  doc.moveDown(1.5);

  const qrRecord = registration.qrToken;
  if (qrRecord) {
    try {
      const qrBuffer = await qrService.createQrImage(qrRecord.tokenHash, { width: 150 });
      const centerX = (doc.page.width - 150) / 2;
      doc.image(qrBuffer, centerX, doc.y, { width: 150, height: 150 });
      doc.moveDown(5);
    } catch {
      doc.fontSize(10).font('Helvetica').text('QR code unavailable for this ticket', { align: 'center' });
      doc.moveDown(1);
    }
  } else {
    doc.fontSize(10).font('Helvetica').text('QR code unavailable for this ticket', { align: 'center' });
    doc.moveDown(1);
  }

  doc.moveDown(1);
  doc.fontSize(9).font('Helvetica-Oblique').text(
    'Present this ticket at the event entrance. A staff member will scan your QR code for entry.',
    { align: 'center' }
  );

  doc.end();
  return doc;
}

function wrapText(text, maxChars) {
  if (text.length <= maxChars) {
    return [text];
  }

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if ((currentLine.length + 1 + word.length) <= maxChars) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
