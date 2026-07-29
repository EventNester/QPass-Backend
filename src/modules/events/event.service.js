import prisma from "../../database/index.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../utils/error.js";
import { constants, systemMessages } from "../../config/index.js";
import { generateSlug } from "../../utils/slug.js";

const msg = systemMessages.ERROR;
const MAX_SLUG_RETRIES = 10;

async function generateUniqueSlug(title) {
  let attempts = 0;
  let slug = generateSlug(title);

  while (
    await prisma.event.findFirst({ where: { slug, deletedAt: null } })
  ) {
    if (++attempts >= MAX_SLUG_RETRIES) {
      throw new Error("Failed to generate unique slug after max retries");
    }
    slug = generateSlug(title);
  }

  return slug;
}

// Create an event
export const createEvent = async (eventData, ownerId) => {
  const slug = await generateUniqueSlug(eventData.title);

  const event = await prisma.event.create({
    data: {
      title: eventData.title,
      description: eventData.description,
      venue: eventData.venue,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      slug,
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

// Publish an event (atomic ownership + draft-status check)
export const publishEvent = async (eventId, ownerId) => {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
    },
  });

  if (!event) {
    const exists = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });

    if (!exists) {
      throw new NotFoundError(msg.EVENT.NOT_FOUND);
    }

    throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
  }

  if (event.status !== constants.EVENT_STATUS.DRAFT) {
    throw new ValidationError(
      `${msg.EVENT.NOT_DRAFT} (current: ${event.status})`
    );
  }

  const slug = await generateUniqueSlug(event.title);

  const published = await prisma.event.updateMany({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
      status: constants.EVENT_STATUS.DRAFT,
    },
    data: {
      status: constants.EVENT_STATUS.PUBLISHED,
      slug,
      publishedAt: new Date(),
    },
  });

  if (published.count === 0) {
    throw new ValidationError(
      `${msg.EVENT.NOT_DRAFT} (current: ${event.status})`
    );
  }

  return getEvent(eventId);
};

// Cancel an event (atomic ownership check)
export const cancelEvent = async (eventId, ownerId) => {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
    },
  });

  if (!event) {
    const exists = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });

    if (!exists) {
      throw new NotFoundError(msg.EVENT.NOT_FOUND);
    }

    throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
  }

  if (event.status === constants.EVENT_STATUS.DRAFT) {
    throw new ValidationError(msg.EVENT.CANNOT_CANCEL_DRAFT);
  }

  if (event.status === constants.EVENT_STATUS.CANCELLED) {
    throw new ValidationError(msg.EVENT.ALREADY_CANCELLED);
  }

  const cancelled = await prisma.event.updateMany({
    where: {
      id: eventId,
      ownerId,
      deletedAt: null,
      status: {
        in: [
          constants.EVENT_STATUS.PUBLISHED,
          constants.EVENT_STATUS.ACTIVE,
          constants.EVENT_STATUS.COMPLETED,
        ],
      },
    },
    data: {
      status: constants.EVENT_STATUS.CANCELLED,
    },
  });

  if (cancelled.count === 0) {
    throw new ValidationError(msg.EVENT.ALREADY_CANCELLED);
  }

  return getEvent(eventId);
};