import prisma from "../../database/index.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../utils/error.js";
import { constants, systemMessages } from "../../config/index.js";
import { generateSlug } from "../../utils/slug.js";

const msg = systemMessages.ERROR;

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
    throw new NotFoundError(msg.EVENT.NOT_FOUND);
  }

  return event;
};

// List all events with pagination
export const listEvents = async (
  page = constants.PAGINATION.DEFAULT_PAGE,
  limit = constants.PAGINATION.DEFAULT_LIMIT
) => {
  const take = Math.min(limit, constants.PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * take;

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        startTime: "asc",
      },
      skip,
      take,
    }),
    prisma.event.count({
      where: {
        deletedAt: null,
      },
    }),
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
    const exists = await prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
      },
    });

    if (!exists) {
      throw new NotFoundError(msg.EVENT.NOT_FOUND);
    }

    throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
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
    const exists = await prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
      },
    });

    if (!exists) {
      throw new NotFoundError(msg.EVENT.NOT_FOUND);
    }

    throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
  }

  return {
    id: eventId,
  };
};

// Publish an event
export const publishEvent = async (eventId, ownerId) => {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
    },
  });

  if (!event) {
    throw new NotFoundError(msg.EVENT.NOT_FOUND);
  }

  if (event.status !== "DRAFT") {
    throw new ValidationError(msg.EVENT.ALREADY_PUBLISHED);
  }

  let slug = generateSlug(event.title);

  // Ensure slug is unique
  while (await prisma.event.findUnique({ where: { slug } })) {
    slug = generateSlug(event.title);
  }

  const publishedEvent = await prisma.event.update({
    where: {
      id: eventId,
    },
    data: {
      status: "PUBLISHED",
      slug,
      publishedAt: new Date(),
    },
  });

  return publishedEvent;
};


// Cancel an event
export const cancelEvent = async (eventId, ownerId) => {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
    },
  });

  if (!event) {
    throw new NotFoundError(msg.EVENT.NOT_FOUND);
  }

  // Prevent cancelling an event twice
  if (event.status === "CANCELLED") {
    throw new ValidationError(msg.EVENT.ALREADY_CANCELLED);
  }

  const cancelledEvent = await prisma.event.update({
    where: {
      id: eventId,
    },
    data: {
      status: "CANCELLED",
    },
  });

  return cancelledEvent;
};