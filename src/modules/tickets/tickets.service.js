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
