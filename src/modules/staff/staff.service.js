import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../../database/index.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/error.js';
import { systemMessages, logger } from '../../config/index.js';
import { sendNotification } from '../../services/notification.service.js';

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

export async function assignStaff(eventId, ownerId, data) {
  const event = await verifyEventOwnership(eventId, ownerId);

  let user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  let isNewUser = false;

  if (!user) {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 12);
    const name = data.email.split('@')[0];

    user = await prisma.user.create({
      data: {
        name,
        email: data.email,
        passwordHash,
        role: 'STAFF',
      },
    });
    isNewUser = true;
  }

  const existingAssignment = await prisma.eventStaffAssignment.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });

  if (existingAssignment) {
    throw new ConflictError(msg.STAFF.ALREADY_ASSIGNED);
  }

  if (user.role !== 'STAFF') {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'STAFF' },
    });
  }

  const assignment = await prisma.eventStaffAssignment.create({
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

  sendNotification({
    recipient: data.email,
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
    logger.error({ err: err.message, email: data.email, eventId }, 'Staff invite email send failed');
  });

  await prisma.auditLog.create({
    data: {
      actorId: ownerId,
      action: isNewUser ? 'STAFF_INVITE_CREATE' : 'STAFF_ASSIGN',
      entity: 'EventStaffAssignment',
      entityId: assignment.id,
      afterSnapshot: { email: data.email, eventId, permissionScope: data.permissionScope || null },
    },
  });

  return assignment;
}

export async function listStaff(eventId, ownerId) {
  await verifyEventOwnership(eventId, ownerId);

  const assignments = await prisma.eventStaffAssignment.findMany({
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

  return assignments;
}

export async function removeStaff(eventId, staffId, ownerId) {
  await verifyEventOwnership(eventId, ownerId);

  const assignment = await prisma.eventStaffAssignment.findUnique({
    where: { id: staffId },
  });

  if (!assignment || assignment.eventId !== eventId) {
    throw new NotFoundError(msg.STAFF.NOT_FOUND);
  }

  const deletedAssignment = await prisma.eventStaffAssignment.delete({
    where: { id: staffId },
  });

  await prisma.auditLog.create({
    data: {
      actorId: ownerId,
      action: 'STAFF_REMOVE',
      entity: 'EventStaffAssignment',
      entityId: staffId,
      beforeSnapshot: { eventId, userId: deletedAssignment.userId, permissionScope: deletedAssignment.permissionScope },
    },
  });

  return { id: staffId, eventId };
}
