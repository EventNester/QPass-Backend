import prisma from "../../database/index.js";
import { NotFoundError, ForbiddenError } from "../../utils/error.js";
import { constants, systemMessages } from "../../config/index.js";

const msg = systemMessages.ERROR;

export async function getDashboardStats(eventId, userId, userRole) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { id: true, capacity: true, ownerId: true },
  });

  if (!event) {
    throw new NotFoundError(msg.EVENT.NOT_FOUND);
  }

  if (event.ownerId !== userId && userRole !== constants.ROLES.ADMIN) {
    const assignment = await prisma.eventStaffAssignment.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { active: true },
    });

    if (!assignment?.active) {
      throw new ForbiddenError(msg.EVENT.UNAUTHORIZED);
    }
  }

  const [
    totalRegistrations,
    confirmedRegistrations,
    pendingRegistrations,
    cancelledRegistrations,
    checkedInRows,
    ticketTypes,
    registrationCounts,
    validCheckins,
  ] = await Promise.all([
    prisma.registration.count({ where: { eventId } }),
    prisma.registration.count({ where: { eventId, status: "CONFIRMED" } }),
    prisma.registration.count({ where: { eventId, status: "PENDING" } }),
    prisma.registration.count({ where: { eventId, status: "CANCELLED" } }),
    prisma.checkIn.findMany({
      where: { eventId, deletedAt: null },
      select: { id: true, result: true },
    }),
    prisma.ticketType.findMany({
      where: { eventId },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.registration.groupBy({
      by: ["ticketTypeId"],
      where: { eventId, status: { not: "CANCELLED" }, ticketTypeId: { not: null } },
      _count: { _all: true },
    }),
    prisma.checkIn.findMany({
      where: {
        eventId,
        result: constants.CHECKIN_RESULT.VALID,
        deletedAt: null,
      },
      select: { registration: { select: { ticketTypeId: true } } },
    }),
  ]);

  const validCheckinCount = checkedInRows.filter(
    (row) => row.result === constants.CHECKIN_RESULT.VALID
  ).length;

  const duplicateScanCount = checkedInRows.length
    ? await prisma.auditLog.count({
        where: {
          action: "DUPLICATE_SCAN",
          entity: "CheckIn",
          entityId: { in: checkedInRows.map((row) => row.id) },
        },
      })
    : 0;

  const registrationsByTicketType = new Map(
    registrationCounts.map((row) => [row.ticketTypeId, row._count._all])
  );

  const checkedInByTicketType = new Map();
  for (const checkin of validCheckins) {
    const ticketTypeId = checkin.registration?.ticketTypeId;
    if (ticketTypeId) {
      checkedInByTicketType.set(
        ticketTypeId,
        (checkedInByTicketType.get(ticketTypeId) ?? 0) + 1
      );
    }
  }

  return {
    registrations: {
      total: totalRegistrations,
      confirmed: confirmedRegistrations,
      pending: pendingRegistrations,
      cancelled: cancelledRegistrations,
    },
    checkins: {
      total: checkedInRows.length,
      valid: validCheckinCount,
      duplicate: duplicateScanCount,
    },
    noShows: Math.max(confirmedRegistrations - validCheckinCount, 0),
    capacity: {
      max: event.capacity ?? null,
      utilization:
        event.capacity != null && event.capacity > 0
          ? Math.round((confirmedRegistrations / event.capacity) * 100)
          : null,
    },
    ticketBreakdown: ticketTypes.map((ticketType) => ({
      ticketType: ticketType.name,
      sold: registrationsByTicketType.get(ticketType.id) ?? 0,
      checkedIn: checkedInByTicketType.get(ticketType.id) ?? 0,
    })),
  };
}
