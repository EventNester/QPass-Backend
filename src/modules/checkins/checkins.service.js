import prisma from "../../database/index.js";
import { getRedisClient } from "../../config/redis.js";
import { hashToken } from "../../utils/crypto.js";
import { NotFoundError, ConflictError, ForbiddenError, BadRequestError } from "../../utils/error.js";
import { constants, systemMessages, logger } from "../../config/index.js";
import { getIO } from "../../realtime/socket.js";
import { emitCheckinUpdate, emitScanResult } from "../../realtime/rooms.js";

const errMsg = systemMessages.ERROR;
const successMsg = systemMessages.SUCCESS;
const HOURS_24_MS = 24 * 60 * 60 * 1000;

export async function scanQr(eventId, data, staffId) {
  const redis = getRedisClient();
  const tokenHash = hashToken(data.token);

  const [event, assignment] = await Promise.all([
    prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { ownerId: true },
    }),
    prisma.eventStaffAssignment.findUnique({
      where: { eventId_userId: { eventId, userId: staffId } },
      select: { active: true },
    }),
  ]);

  if (!event || (event.ownerId !== staffId && !assignment?.active)) {
    throw new ForbiddenError(errMsg.CHECKIN.NOT_AUTHORIZED);
  }

  const lockKey = `scan:${eventId}:${tokenHash}`;
  const locked = await redis.set(lockKey, "1", "EX", 10, "NX");

  if (!locked) {
    throw new ConflictError(errMsg.CHECKIN.SCAN_IN_PROGRESS);
  }

  try {
    const qrToken = await prisma.qrToken.findUnique({
      where: { tokenHash },
      include: { registration: true },
    });

    let scanResult;
    let attendeeName;

    if (!qrToken) {
      scanResult = { result: constants.CHECKIN_RESULT.INVALID, message: errMsg.CHECKIN.INVALID_QR };
    } else if (new Date(qrToken.expiresAt) < new Date()) {
      attendeeName = qrToken.registration.attendeeName;
      scanResult = { result: constants.CHECKIN_RESULT.EXPIRED, message: errMsg.CHECKIN.QR_EXPIRED };
    } else if (qrToken.registration.status !== "CONFIRMED") {
      attendeeName = qrToken.registration.attendeeName;
      scanResult = { result: constants.CHECKIN_RESULT.INVALID, message: errMsg.CHECKIN.REGISTRATION_NOT_CONFIRMED };
    } else if (qrToken.registration.eventId !== eventId) {
      attendeeName = qrToken.registration.attendeeName;
      scanResult = { result: constants.CHECKIN_RESULT.WRONG_EVENT, message: errMsg.CHECKIN.EVENT_MISMATCH };
    } else if (qrToken.revokedAt) {
      attendeeName = qrToken.registration.attendeeName;
      scanResult = { result: constants.CHECKIN_RESULT.REVOKED, message: errMsg.CHECKIN.QR_REVOKED };
    } else {
      const existingCheckin = await prisma.checkIn.findUnique({
        where: { eventId_registrationId: { eventId, registrationId: qrToken.registrationId } },
      });

      if (existingCheckin && !existingCheckin.deletedAt) {
        attendeeName = qrToken.registration.attendeeName;
        await prisma.auditLog.create({
          data: {
            actorId: staffId,
            action: "DUPLICATE_SCAN",
            entity: "CheckIn",
            entityId: existingCheckin.id,
            afterSnapshot: { tokenHash, attemptTime: new Date().toISOString() },
          },
        });
        scanResult = { result: constants.CHECKIN_RESULT.DUPLICATE, message: errMsg.CHECKIN.DUPLICATE };
      } else if (existingCheckin) {
        const restored = await prisma.$transaction(async (tx) => {
          const checkin = await tx.checkIn.update({
            where: { id: existingCheckin.id },
            data: {
              deletedAt: null,
              staffId,
              result: constants.CHECKIN_RESULT.VALID,
              scannedAt: new Date(),
              deviceInfo: data.deviceInfo,
            },
            include: { registration: true },
          });

          await tx.qrToken.update({
            where: { id: qrToken.id },
            data: { scanCount: { increment: 1 }, revokedAt: new Date() },
          });

          await tx.auditLog.create({
            data: {
              actorId: staffId,
              action: "CHECKIN_VALID",
              entity: "CheckIn",
              entityId: checkin.id,
              afterSnapshot: {
                tokenHash,
                restored: true,
                scannedAt: new Date().toISOString(),
              },
            },
          });

          return checkin;
        });

        attendeeName = restored.registration.attendeeName;
        scanResult = {
          result: constants.CHECKIN_RESULT.VALID,
          message: successMsg.CHECKIN.SUCCESS,
          attendeeName: restored.registration.attendeeName,
          checkinId: restored.id,
        };
      } else {
        const checkin = await prisma.$transaction(async (tx) => {
          const created = await tx.checkIn.create({
            data: {
              eventId,
              registrationId: qrToken.registrationId,
              staffId,
              result: constants.CHECKIN_RESULT.VALID,
              deviceInfo: data.deviceInfo,
            },
            include: { registration: true },
          });

          await tx.qrToken.update({
            where: { id: qrToken.id },
            data: { scanCount: { increment: 1 }, revokedAt: new Date() },
          });

          await tx.auditLog.create({
            data: {
              actorId: staffId,
              action: "CHECKIN_VALID",
              entity: "CheckIn",
              entityId: created.id,
              afterSnapshot: {
                tokenHash,
                scannedAt: new Date().toISOString(),
              },
            },
          });

          return created;
        });

        attendeeName = checkin.registration.attendeeName;
        scanResult = {
          result: constants.CHECKIN_RESULT.VALID,
          message: successMsg.CHECKIN.SUCCESS,
          attendeeName: checkin.registration.attendeeName,
          checkinId: checkin.id,
        };
      }
    }

    try {
      const totalCheckedIn = await prisma.checkIn.count({
        where: { eventId, result: constants.CHECKIN_RESULT.VALID, deletedAt: null },
      });

      emitCheckinUpdate(getIO(), eventId, {
        result: scanResult.result,
        attendeeName,
        totalCheckedIn,
      });
    } catch (err) {
      logger.warn({ err, eventId }, "failed to emit checkin:update");
    }

    try {
      emitScanResult(getIO(), eventId, {
        result: scanResult.result,
        message: scanResult.message,
        ...(attendeeName ? { attendee: { name: attendeeName } } : {}),
      });
    } catch (err) {
      logger.warn({ err, eventId }, "failed to emit scan:result");
    }

    return scanResult;
  } finally {
    await redis.del(lockKey);
  }
}

export async function getCheckins(eventId, userId) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { ownerId: true },
  });

  if (!event) {
    throw new NotFoundError(errMsg.EVENT.NOT_FOUND);
  }

  if (event.ownerId !== userId) {
    const assignment = await prisma.eventStaffAssignment.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { active: true },
    });

    if (!assignment?.active) {
      throw new NotFoundError(errMsg.EVENT.NOT_FOUND);
    }
  }

  return prisma.checkIn.findMany({
    where: { eventId, deletedAt: null },
    include: {
      registration: { select: { attendeeName: true, attendeeEmail: true } },
      staff: { select: { name: true, email: true } },
    },
    orderBy: { scannedAt: "desc" },
  });
}

export async function undoCheckin(eventId, checkInId, staffId) {
  const checkin = await prisma.checkIn.findUnique({ where: { id: checkInId } });
  if (!checkin) throw new NotFoundError(errMsg.CHECKIN.NOT_FOUND);
  if (checkin.eventId !== eventId) throw new NotFoundError(errMsg.CHECKIN.NOT_FOUND);
  if (checkin.deletedAt) throw new NotFoundError(errMsg.CHECKIN.NOT_FOUND);

  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { ownerId: true },
  });
  if (!event) throw new NotFoundError(errMsg.EVENT.NOT_FOUND);

  if (event.ownerId !== staffId && checkin.staffId !== staffId) {
    throw new ForbiddenError(errMsg.CHECKIN.UNDO_NOT_AUTHORIZED);
  }

  if (Date.now() - new Date(checkin.scannedAt).getTime() > HOURS_24_MS) {
    throw new BadRequestError(errMsg.CHECKIN.UNDO_WINDOW_EXPIRED);
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.checkIn.updateMany({
      where: { id: checkInId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundError(errMsg.CHECKIN.NOT_FOUND);
    }

    await tx.auditLog.create({
      data: {
        actorId: staffId,
        action: "UNDO_CHECKIN",
        entity: "CheckIn",
        entityId: checkInId,
        beforeSnapshot: {
          eventId: checkin.eventId,
          registrationId: checkin.registrationId,
          result: checkin.result,
          scannedAt: checkin.scannedAt.toISOString(),
        },
      },
    });

    await tx.registration.update({
      where: { id: checkin.registrationId },
      data: { status: "CONFIRMED" },
    });

    await tx.qrToken.update({
      where: { registrationId: checkin.registrationId },
      data: { revokedAt: null, scanCount: { decrement: 1 } },
    });
  });

  return { success: true };
}
