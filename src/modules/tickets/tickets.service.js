import prisma from "../../database/index.js";
import { NotFoundError, UnauthorizedError, ConflictError } from "../../utils/error.js";
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
    throw new UnauthorizedError(msg.EVENT.UNAUTHORIZED);
  }
}

export async function createTicketType(eventId, userId, data) {
  await checkEventOwnership(eventId, userId);

  // Get the current max sortOrder to append this new ticket type at the end
  const maxSortOrder = await prisma.ticketType.aggregate({
    where: { eventId },
    _max: { sortOrder: true },
  });
  
  const sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  const ticketType = await prisma.ticketType.create({
    data: {
      eventId,
      ...data,
      sortOrder,
    },
  });

  return ticketType;
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

  const ticketType = await prisma.ticketType.findFirst({
    where: { id: ticketTypeId, eventId },
    include: {
      _count: {
        select: { registrations: true }
      }
    }
  });

  if (!ticketType) {
    throw new NotFoundError(msg.GENERAL.NOT_FOUND);
  }

  // Guard: Reject deletion if any registrations are associated with this ticket type
  if (ticketType._count.registrations > 0) {
    throw new ConflictError("Cannot delete ticket type with existing registrations");
  }

  await prisma.ticketType.delete({
    where: { id: ticketTypeId },
  });

  return true;
}
