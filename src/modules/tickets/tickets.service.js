import prisma from "../../database/index.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../../utils/error.js";
import { systemMessages } from "../../config/index.js";

const msg = systemMessages.ERROR;

/**
 * Helper to ensure the event exists and the user is its owner
 */
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

export async function createTicketType(eventId, userId, data) {
  await checkEventOwnership(eventId, userId);

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const ticketType = await prisma.$transaction(async (tx) => {
        const maxSortOrder = await tx.ticketType.aggregate({
          where: { eventId },
          _max: { sortOrder: true },
        });

        const sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

        return tx.ticketType.create({
          data: {
            eventId,
            ...data,
            sortOrder,
          },
        });
      });

      return ticketType;
    } catch (err) {
      if (err.code === 'P2002' && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
}

export async function getTicketTypes(eventId, userId) {
  await checkEventOwnership(eventId, userId);

  const ticketTypes = await prisma.ticketType.findMany({
    where: { eventId },
    orderBy: { sortOrder: "asc" },
  });

  return ticketTypes;
}

export async function updateTicketType(eventId, ticketTypeId, userId, data) {
  await checkEventOwnership(eventId, userId);

  const ticketType = await prisma.ticketType.findFirst({
    where: { id: ticketTypeId, eventId },
  });

  if (!ticketType) {
    throw new NotFoundError(msg.GENERAL.NOT_FOUND);
  }

  const updated = await prisma.ticketType.update({
    where: { id: ticketTypeId },
    data,
  });

  return updated;
}

export async function deleteTicketType(eventId, ticketTypeId, userId) {
  await checkEventOwnership(eventId, userId);

  await prisma.$transaction(async (tx) => {
    const ticketType = await tx.ticketType.findFirst({
      where: { id: ticketTypeId, eventId },
    });

    if (!ticketType) {
      throw new NotFoundError(msg.GENERAL.NOT_FOUND);
    }

    try {
      await tx.ticketType.delete({
        where: { id: ticketTypeId },
      });
    } catch (err) {
      if (err.code === 'P2003') {
        throw new ConflictError("Cannot delete ticket type with existing registrations");
      }
      throw err;
    }
  });

  return true;
}

export async function getTicketDetails(ticketId, userId) {
  const { getRegistrationById } = await import("../registrations/registration.service.js");
  const { qrService } = await import("./qr.service.js");

  const registration = await getRegistrationById(ticketId);

  // Authorization: must be the event owner OR the attendee (email match)
  const event = await prisma.event.findUnique({
    where: { id: registration.eventId },
    select: { ownerId: true },
  });

  const isOwner = event && event.ownerId === userId;
  
  if (!isOwner) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email.toLowerCase() !== registration.attendeeEmail.toLowerCase()) {
      throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
    }
  }

  // Generate QR data URL
  let qrDataUrl = null;
  if (registration.ticketCode?.code) {
    const qrBuffer = await qrService.createQrImage(registration.ticketCode.code);
    qrDataUrl = `data:image/png;base64,${qrBuffer.toString("base64")}`;
  }

  return { ...registration, qrDataUrl };
}

export async function listEventTickets(eventId, userId, filters = {}) {
  await checkEventOwnership(eventId, userId);

  const { listRegistrationsByEvent } = await import("../registrations/registration.service.js");
  return listRegistrationsByEvent(eventId, filters.page, filters.limit, filters);
}

export async function exportEventTickets(eventId, userId, format) {
  await checkEventOwnership(eventId, userId);

  const { listRegistrationsByEvent } = await import("../registrations/registration.service.js");
  // Fetch all registrations (up to a reasonable max like 10000 for export)
  const { registrations } = await listRegistrationsByEvent(eventId, 1, 10000);
  
  const event = await prisma.event.findUnique({ where: { id: eventId } });

  if (format === "csv") {
    // Generate CSV string
    const headers = ["Name", "Email", "Ticket Type", "Status", "Payment", "Ticket Code"];
    const rows = registrations.map(reg => [
      reg.attendeeName || "",
      reg.attendeeEmail || "",
      reg.ticketType?.name || "",
      reg.status || "",
      reg.paymentStatus || "",
      reg.ticketCode?.code || ""
    ]);

    const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;
    
    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map(row => row.map(escapeCsv).join(","))
    ].join("\n");

    return { contentType: "text/csv", data: csvContent, extension: "csv" };
  } else if (format === "pdf") {
    const { generateTicketListPdf } = await import("./ticket-pdf.service.js");
    const pdfBuffer = await generateTicketListPdf(registrations, event);
    return { contentType: "application/pdf", data: pdfBuffer, extension: "pdf" };
  }

  throw new Error("Unsupported format");
}
