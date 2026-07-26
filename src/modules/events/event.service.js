import prisma from "../../database/index.js";
import { NotFoundError } from "../../utils/error.js";

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

// List all events
export const listEvents = async () => {
  const events = await prisma.event.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      startTime: "asc",
    },
  });

  return events;
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
    throw new NotFoundError("Event not found or you are not the owner");
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
    throw new NotFoundError("Event not found or you are not the owner");
  }

  return getEvent(eventId);
};
