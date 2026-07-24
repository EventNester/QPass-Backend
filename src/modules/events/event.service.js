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

// Update an event
export const updateEvent = async (eventId, eventData, ownerId) => {
  const existingEvent = await prisma.event.findFirst({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
    },
  });

  if (!existingEvent) {
    throw new NotFoundError(
      "Event not found or you are not the owner"
    );
  }

  const updatedEvent = await prisma.event.update({
    where: {
      id: eventId,
    },
    data: eventData,
  });

  return updatedEvent;
};

// Soft-delete an event
export const deleteEvent = async (eventId, ownerId) => {
  const existingEvent = await prisma.event.findFirst({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
    },
  });

  if (!existingEvent) {
    throw new NotFoundError(
      "Event not found or you are not the owner"
    );
  }

  const deletedEvent = await prisma.event.update({
    where: {
      id: eventId,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  return deletedEvent;
};