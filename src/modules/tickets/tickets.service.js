import prisma from "../../database/index.js";
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from "../../utils/error.js";
import { systemMessages } from "../../config/index.js";
import { writeAuditLog } from "../../utils/audit-log.js";

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

      writeAuditLog({
        actorId: userId,
        action: 'TICKET_TYPE_CREATED',
        entity: 'TicketType',
        entityId: ticketType.id,
        afterSnapshot: { eventId, name: ticketType.name, price: ticketType.price, isPaid: ticketType.isPaid },
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

  writeAuditLog({
    actorId: userId,
    action: 'TICKET_TYPE_UPDATED',
    entity: 'TicketType',
    entityId: ticketTypeId,
    beforeSnapshot: { name: ticketType.name, price: ticketType.price, isPaid: ticketType.isPaid, capacity: ticketType.capacity, active: ticketType.active },
    afterSnapshot: { name: updated.name, price: updated.price, isPaid: updated.isPaid, capacity: updated.capacity, active: updated.active },
  });

  return updated;
}

export async function deleteTicketType(eventId, ticketTypeId, userId) {
  await checkEventOwnership(eventId, userId);

  const deletedTicketType = await prisma.$transaction(async (tx) => {
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
      return ticketType;
    } catch (err) {
      if (err.code === 'P2003') {
        throw new ConflictError("Cannot delete ticket type with existing registrations");
      }
      throw err;
    }
  });

  writeAuditLog({
    actorId: userId,
    action: 'TICKET_TYPE_DELETED',
    entity: 'TicketType',
    entityId: ticketTypeId,
    beforeSnapshot: { eventId, name: deletedTicketType.name, price: deletedTicketType.price, isPaid: deletedTicketType.isPaid },
  });

  return true;
}

export async function getTicketDetails(ticketId, userId) {
  const { getRegistrationById } = await import("../registrations/registration.service.js");
  const { qrService } = await import("./qr.service.js");

  const registration = await getRegistrationById(ticketId);

  const event = await prisma.event.findUnique({
    where: { id: registration.eventId },
    select: { ownerId: true },
  });

  const isOwner = event && event.ownerId === userId;
  
  if (!isOwner) {
    const isStaff = await prisma.eventStaffAssignment.findUnique({
      where: { eventId_userId: { eventId: registration.eventId, userId } },
    });

    if (!isStaff) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.email.toLowerCase() !== registration.attendeeEmail.toLowerCase()) {
        throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
      }
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

  const registrations = await prisma.registration.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    include: {
      ticketCode: true,
      ticketType: true,
    },
  });
  
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

    const escapeCsv = (value) => {
      const str = String(value);
      const safeValue = /^[\t\r\n ]*[=+\-@]/.test(str) ? `'${str}` : str;
      return `"${safeValue.replace(/"/g, '""')}"`;
    };
    
    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map(row => row.map(escapeCsv).join(","))    ].join("\n");

    return { contentType: "text/csv", data: csvContent, extension: "csv" };
  } else if (format === "pdf") {
    const { generateTicketListPdf } = await import("./ticket-pdf.service.js");
    const pdfBuffer = await generateTicketListPdf(registrations, event);
    return { contentType: "application/pdf", data: pdfBuffer, extension: "pdf" };
  }

  throw new BadRequestError("Unsupported export format");
}
