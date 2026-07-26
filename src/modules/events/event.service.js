import prisma from "../../database/index.js";
import { NotFoundError, ForbiddenError } from "../../utils/error.js";
import { constants } from "../../config/index.js";

// Create an event
export const createEvent = async (eventData, ownerId) => {
  const event = await prisma.event.create({
    data: {
      title: eventData.title,
      description: eventData.description,
      venue: eventData.venue,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      ownerId,
    },
  });

  return event;
};

// Get one event
export const getEvent = async (eventId) => {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      deletedAt: null,
    },
  });

  if (!event) {
    throw new NotFoundError("Event not found");
  }

  return event;
};

// List all events with pagination
export const listEvents = async (page = constants.PAGINATION.DEFAULT_PAGE, limit = constants.PAGINATION.DEFAULT_LIMIT) => {
  const take = Math.min(limit, constants.PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * take;

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where: { deletedAt: null },
      orderBy: { startTime: "asc" },
      skip,
      take,
    }),
    prisma.event.count({ where: { deletedAt: null } }),
  ]);

  return {
    events,
    pagination: {
      page,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
};

// Update an event (atomic ownership check)
export const updateEvent = async (eventId, eventData, ownerId) => {
  const updatedEvent = await prisma.event.updateMany({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
    },
    data: eventData,
  });

  if (updatedEvent.count === 0) {
    const exists = await prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!exists) throw new NotFoundError("Event not found");
    throw new ForbiddenError("You are not the owner of this event");
  }

  return getEvent(eventId);
};

// Soft-delete an event (atomic ownership check)
export const deleteEvent = async (eventId, ownerId) => {
  const deletedEvent = await prisma.event.updateMany({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  if (deletedEvent.count === 0) {
    const exists = await prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!exists) throw new NotFoundError("Event not found");
    throw new ForbiddenError("You are not the owner of this event");
  }

  return { id: eventId };
};
