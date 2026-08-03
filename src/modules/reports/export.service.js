import prisma from "../../database/index.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../utils/error.js";
import { systemMessages } from "../../config/index.js";
import { generateTablePdf } from "./pdf.service.js";

const msg = systemMessages.ERROR;

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

function escapeCsv(value) {
  const str = value === null || value === undefined ? "" : String(value);
  const safeValue = /^[\t\r\n ]*[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  return [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

async function buildExport(format, { title, headers, rows }) {
  if (format === "csv") {
    return {
      contentType: "text/csv; charset=utf-8",
      data: toCsv(headers, rows),
      extension: "csv",
    };
  }

  if (format === "pdf") {
    const data = await generateTablePdf({ title, headers, rows });
    return {
      contentType: "application/pdf",
      data,
      extension: "pdf",
    };
  }

  throw new BadRequestError("Unsupported export format");
}

export async function exportRegistrations(eventId, userId, format) {
  await checkEventOwnership(eventId, userId);

  const [registrations, event] = await Promise.all([
    prisma.registration.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      include: {
        ticketCode: true,
        ticketType: true,
      },
    }),
    prisma.event.findUnique({ where: { id: eventId } }),
  ]);

  const headers = [
    "Name",
    "Email",
    "Phone",
    "Ticket Type",
    "Status",
    "Payment",
    "Ticket Code",
    "Registered At",
  ];
  const rows = registrations.map((reg) => [
    reg.attendeeName || "",
    reg.attendeeEmail || "",
    reg.phone || "",
    reg.ticketType?.name || "",
    reg.status || "",
    reg.paymentStatus || "",
    reg.ticketCode?.code || "",
    formatDateTime(reg.createdAt),
  ]);

  return buildExport(format, {
    title: `Registrations: ${event.title}`,
    headers,
    rows,
  });
}

export async function exportAttendance(eventId, userId, format) {
  await checkEventOwnership(eventId, userId);

  const [checkins, event] = await Promise.all([
    prisma.checkIn.findMany({
      where: { eventId, deletedAt: null },
      orderBy: { scannedAt: "desc" },
      include: {
        registration: {
          select: {
            attendeeName: true,
            attendeeEmail: true,
            ticketType: { select: { name: true } },
          },
        },
        staff: { select: { name: true, email: true } },
      },
    }),
    prisma.event.findUnique({ where: { id: eventId } }),
  ]);

  const headers = [
    "Attendee Name",
    "Email",
    "Ticket Type",
    "Checked In At",
    "Device Info",
    "Checked In By",
  ];
  const rows = checkins.map((checkin) => [
    checkin.registration?.attendeeName || "",
    checkin.registration?.attendeeEmail || "",
    checkin.registration?.ticketType?.name || "",
    formatDateTime(checkin.scannedAt),
    checkin.deviceInfo || "",
    checkin.staff?.name || "",
  ]);

  return buildExport(format, {
    title: `Attendance: ${event.title}`,
    headers,
    rows,
  });
}
