const prisma = require("../../database");
const { getRedisClient } = require("../../config/redis");
const { hashToken } = require("../../utils/crypto");
const { NotFoundError, ConflictError } = require("../../utils/error");

async function scanQr(eventId, data, staffId) {
  const redis = getRedisClient();
  const tokenHash = hashToken(data.token);

  const lockKey = `scan:${eventId}:${tokenHash}`;
  const locked = await redis.set(lockKey, "1", "EX", 10, "NX");

  if (!locked) {
    throw new ConflictError("Scan already in progress");
  }

  try {
    const qrToken = await prisma.qrToken.findUnique({
      where: { tokenHash },
      include: { registration: true },
    });

    if (!qrToken) {
      return { result: "INVALID", message: "Invalid QR code" };
    }

    if (new Date(qrToken.expiresAt) < new Date()) {
      return { result: "INVALID", message: "QR code has expired" };
    }

    if (qrToken.registration.eventId !== eventId) {
      return { result: "INVALID", message: "QR code is not valid for this event" };
    }

    const existingCheckin = await prisma.checkIn.findUnique({
      where: { eventId_registrationId: { eventId, registrationId: qrToken.registrationId } },
    });

    if (existingCheckin) {
      await prisma.auditLog.create({
        data: {
          actorId: staffId,
          action: "DUPLICATE_SCAN",
          entity: "CheckIn",
          entityId: existingCheckin.id,
          afterSnapshot: { tokenHash, attemptTime: new Date().toISOString() },
        },
      });
      return { result: "DUPLICATE", message: "Duplicate check-in detected" };
    }

    const checkin = await prisma.checkIn.create({
      data: {
        eventId,
        registrationId: qrToken.registrationId,
        staffId,
        result: "VALID",
        deviceInfo: data.deviceInfo,
      },
      include: { registration: true },
    });

    await prisma.qrToken.update({
      where: { id: qrToken.id },
      data: { scanCount: { increment: 1 }, revokedAt: new Date() },
    });

    return {
      result: "VALID",
      message: "Check-in successful",
      attendeeName: checkin.registration.attendeeName,
      checkinId: checkin.id,
    };
  } finally {
    await redis.del(lockKey);
  }
}

async function getCheckins(eventId) {
  return prisma.checkIn.findMany({
    where: { eventId },
    include: {
      registration: { select: { attendeeName: true, attendeeEmail: true } },
      staff: { select: { name: true, email: true } },
    },
    orderBy: { scannedAt: "desc" },
  });
}

async function undoCheckin(checkInId) {
  const checkin = await prisma.checkIn.findUnique({ where: { id: checkInId } });
  if (!checkin) throw new NotFoundError("Check-in not found");

  await prisma.checkIn.update({
    where: { id: checkInId },
    data: { result: "INVALID" },
  });

  return { success: true };
}

module.exports = { scanQr, getCheckins, undoCheckin };
