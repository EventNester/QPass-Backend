import prisma from "../../database/index.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../utils/error.js";
import { constants, systemMessages } from "../../config/index.js";
import { generateSlug } from "../../utils/slug.js";
import { writeAuditLog } from "../../utils/audit-log.js";

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
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
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

      writeAuditLog({
        actorId: ownerId,
        action: 'EVENT_CREATED',
        entity: 'Event',
        entityId: event.id,
        afterSnapshot: { title: event.title, slug: event.slug, status: event.status },
      });

      return event;
    } catch (err) {
      if (err.code === 'P2002' && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
};

// List all events the caller is assigned to as active staff.
// Returns a flat list of events regardless of ownership, so staff can
// reach their assignments from any device.
export const listAssignedEvents = async (userId) => {
  const assignments = await prisma.eventStaffAssignment.findMany({
    where: {
      userId,
      active: true,
      event: { deletedAt: null },
    },
    select: {
      permissionScope: true,
      assignedAt: true,
      event: true,
    },
    orderBy: { assignedAt: "desc" },
  });

  return {
    events: assignments.map(({ permissionScope, assignedAt, event }) => ({
      ...event,
      permissionScope,
      assignedAt,
    })),
  };
};

// Get one event (owner or admin only)
export const getEvent = async (eventId, userId, userRole) => {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      deletedAt: null,
    },
  });

  if (!event) {
    throw new NotFoundError(msg.EVENT.NOT_FOUND);
  }

  if (event.ownerId !== userId && userRole !== constants.ROLES.ADMIN) {
    throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
  }

  return event;
};

// List events with pagination and optional status filter.
// Organizers see only their own events; admins see all non-deleted events.
export const listEvents = async (userId, userRole, query = {}) => {
  const page = query.page ?? constants.PAGINATION.DEFAULT_PAGE;
  const limit = query.limit ?? constants.PAGINATION.DEFAULT_LIMIT;
  const take = Math.min(limit, constants.PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * take;

  const where = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(userRole !== constants.ROLES.ADMIN ? { ownerId: userId } : {}),
  };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: {
        startTime: "asc",
      },
      skip,
      take,
    }),
    prisma.event.count({
      where,
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

// Update an event (atomic ownership check; ADMIN may update any event)
export const updateEvent = async (
  eventId,
  eventData,
  ownerId,
  userRole = constants.ROLES.ORGANIZER
) => {
  const isAdmin = userRole === constants.ROLES.ADMIN;

  const before = await prisma.event.findFirst({
    where: {
      id: eventId,
      deletedAt: null,
      ...(isAdmin ? {} : { ownerId }),
    },
    select: { id: true, title: true, slug: true, status: true },
  });

  const updatedEvent = await prisma.event.updateMany({
    where: {
      id: eventId,
      deletedAt: null,
      ...(isAdmin ? {} : { ownerId }),
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

  if (before) {
    writeAuditLog({
      actorId: ownerId,
      action: 'EVENT_UPDATED',
      entity: 'Event',
      entityId: eventId,
      beforeSnapshot: before,
      afterSnapshot: eventData,
    });
  }

  return getEvent(eventId, ownerId, userRole);
};

// Soft-delete an event (atomic ownership check; ADMIN may delete any event)
export const deleteEvent = async (
  eventId,
  ownerId,
  userRole = constants.ROLES.ORGANIZER
) => {
  const isAdmin = userRole === constants.ROLES.ADMIN;

  const deletedEvent = await prisma.event.updateMany({
    where: {
      id: eventId,
      deletedAt: null,
      ...(isAdmin ? {} : { ownerId }),
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

  writeAuditLog({
    actorId: ownerId,
    action: 'EVENT_DELETED',
    entity: 'Event',
    entityId: eventId,
  });

  return {
    id: eventId,
  };
};

// Publish an event (atomic ownership + draft-status check; ADMIN may publish any event)
export const publishEvent = async (
  eventId,
  ownerId,
  userRole = constants.ROLES.ORGANIZER
) => {
  const isAdmin = userRole === constants.ROLES.ADMIN;

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      deletedAt: null,
      ...(isAdmin ? {} : { ownerId }),
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

  const published = await prisma.event.updateMany({
    where: {
      id: eventId,
      deletedAt: null,
      status: constants.EVENT_STATUS.DRAFT,
      ...(isAdmin ? {} : { ownerId }),
    },
    data: {
      status: constants.EVENT_STATUS.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  if (published.count === 0) {
    throw new ValidationError(
      `${msg.EVENT.NOT_DRAFT} (current: ${event.status})`
    );
  }

  writeAuditLog({
    actorId: ownerId,
    action: 'EVENT_PUBLISHED',
    entity: 'Event',
    entityId: eventId,
    beforeSnapshot: { status: event.status },
    afterSnapshot: { status: constants.EVENT_STATUS.PUBLISHED },
  });

  return getEvent(eventId, ownerId, userRole);
};

// Unpublish an event (atomic ownership check; ADMIN may unpublish any event).
// A PUBLISHED or ACTIVE event returns to DRAFT; the slug is preserved.
export const unpublishEvent = async (
  eventId,
  ownerId,
  userRole = constants.ROLES.ORGANIZER
) => {
  const isAdmin = userRole === constants.ROLES.ADMIN;

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      deletedAt: null,
      ...(isAdmin ? {} : { ownerId }),
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

  if (
    event.status !== constants.EVENT_STATUS.PUBLISHED &&
    event.status !== constants.EVENT_STATUS.ACTIVE
  ) {
    throw new ValidationError(
      `${msg.EVENT.NOT_PUBLISHED} (current: ${event.status})`
    );
  }

  const unpublished = await prisma.event.updateMany({
    where: {
      id: eventId,
      deletedAt: null,
      status: {
        in: [
          constants.EVENT_STATUS.PUBLISHED,
          constants.EVENT_STATUS.ACTIVE,
        ],
      },
      ...(isAdmin ? {} : { ownerId }),
    },
    data: {
      status: constants.EVENT_STATUS.DRAFT,
    },
  });

  if (unpublished.count === 0) {
    throw new ValidationError(
      `${msg.EVENT.NOT_PUBLISHED} (current: ${event.status})`
    );
  }

  writeAuditLog({
    actorId: ownerId,
    action: 'EVENT_UNPUBLISHED',
    entity: 'Event',
    entityId: eventId,
    beforeSnapshot: { status: event.status },
    afterSnapshot: { status: constants.EVENT_STATUS.DRAFT },
  });

  return getEvent(eventId, ownerId, userRole);
};

// Cancel an event (atomic ownership check; ADMIN may cancel any event)
export const cancelEvent = async (
  eventId,
  ownerId,
  userRole = constants.ROLES.ORGANIZER
) => {
  const isAdmin = userRole === constants.ROLES.ADMIN;

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      deletedAt: null,
      ...(isAdmin ? {} : { ownerId }),
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
      deletedAt: null,
      status: {
        in: [
          constants.EVENT_STATUS.PUBLISHED,
          constants.EVENT_STATUS.ACTIVE,
          constants.EVENT_STATUS.COMPLETED,
        ],
      },
      ...(isAdmin ? {} : { ownerId }),
    },
    data: {
      status: constants.EVENT_STATUS.CANCELLED,
    },
  });

  if (cancelled.count === 0) {
    throw new ValidationError(msg.EVENT.ALREADY_CANCELLED);
  }

  writeAuditLog({
    actorId: ownerId,
    action: 'EVENT_CANCELLED',
    entity: 'Event',
    entityId: eventId,
    beforeSnapshot: { status: event.status },
    afterSnapshot: { status: constants.EVENT_STATUS.CANCELLED },
  });

  return getEvent(eventId, ownerId, userRole);
};