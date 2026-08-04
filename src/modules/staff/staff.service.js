import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../../database/index.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/error.js';
import { systemMessages, logger } from '../../config/index.js';
import { sendNotification } from '../../modules/notifications/notification.service.js';

const msg = systemMessages.ERROR;

async function verifyEventOwnership(eventId, ownerId) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
  });

  if (!event) {
    throw new NotFoundError(msg.EVENT.NOT_FOUND);
  }

  if (event.ownerId !== ownerId) {
    throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
  }

  return event;
}

function toEventSummary(event) {
  return {
    id: event.id,
    title: event.title,
    venue: event.venue ?? null,
    startTime: event.startTime,
    endTime: event.endTime,
  };
}

export async function assignStaff(eventId, ownerId, data) {
  const event = await verifyEventOwnership(eventId, ownerId);
  const email = data.email.trim().toLowerCase();

  let user = await prisma.user.findUnique({ where: { email } });

  let isNewUser = false;

  if (!user) {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 12);
    const name = email.split('@')[0];

    try {
      user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: 'STAFF',
        },
      });
    } catch (err) {
      if (err.code === 'P2002') {
        user = await prisma.user.findUnique({ where: { email } });
        if (!user) throw err;
      } else {
        throw err;
      }
    }
    isNewUser = true;
  }

  const existingAssignment = await prisma.eventStaffAssignment.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });

  if (existingAssignment) {
    throw new ConflictError(msg.STAFF.ALREADY_ASSIGNED);
  }

  if (user.role === 'ATTENDEE') {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'STAFF' },
    });
  } else if (user.role !== 'STAFF') {
    throw new ForbiddenError('Cannot assign privileged user as staff');
  }

  const [assignment] = await prisma.$transaction(async (tx) => {
    const created = await tx.eventStaffAssignment.create({
      data: {
        eventId,
        userId: user.id,
        permissionScope: data.permissionScope || null,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, status: true },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: ownerId,
        action: isNewUser ? 'STAFF_INVITE_CREATE' : 'STAFF_ASSIGN',
        entity: 'EventStaffAssignment',
        entityId: created.id,
        afterSnapshot: { email, eventId, permissionScope: data.permissionScope || null },
      },
    });

    return [created];
  });

  sendNotification({
    recipient: email,
    subject: `You're Invited as Staff — ${event.title}`,
    template: 'staff-invite',
    context: {
      name: user.name,
      eventName: event.title,
      role: data.permissionScope || 'Staff',
      inviteUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/events/${eventId}/staff`,
    },
    userId: user.id,
    eventId,
  }).catch((err) => {
    logger.error({ err: err.message, email, eventId }, 'Staff invite email send failed');
  });

  return { event: toEventSummary(event), staff: assignment };
}

export async function listStaff(eventId, ownerId) {
  const event = await verifyEventOwnership(eventId, ownerId);

  const staff = await prisma.eventStaffAssignment.findMany({
    where: { eventId, active: true },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
        },
      },
    },
    orderBy: { assignedAt: 'desc' },
  });

  return { event: toEventSummary(event), staff };
}

export async function removeStaff(eventId, staffId, ownerId) {
  await verifyEventOwnership(eventId, ownerId);

  const assignment = await prisma.eventStaffAssignment.findUnique({
    where: { id: staffId },
  });

  if (!assignment || assignment.eventId !== eventId) {
    throw new NotFoundError(msg.STAFF.NOT_FOUND);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.eventStaffAssignment.delete({
        where: { id: staffId },
      });

      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: 'STAFF_REMOVE',
          entity: 'EventStaffAssignment',
          entityId: staffId,
          beforeSnapshot: { eventId, userId: deleted.userId, permissionScope: deleted.permissionScope },
        },
      });
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new NotFoundError(msg.STAFF.NOT_FOUND);
    }
    throw err;
  }

  return { id: staffId, eventId };
}
