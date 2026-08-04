import prisma from "../../database/index.js";
import { Prisma } from "@prisma/client";
import { ForbiddenError } from "../../utils/error.js";
import { constants, systemMessages } from "../../config/index.js";

const errMsg = systemMessages.ERROR;

/**
 * Build a Postgres query that counts distinct attendee emails across all
 * registrations for the given event filter. Used instead of a `findMany` +
 * `Set` so the count stays efficient as registrations grow.
 *
 * @param {boolean} ownScope - Restrict to a single organizer's events
 * @param {string} userId - Organizer id to restrict to when `ownScope`
 * @returns {import("@prisma/client").Prisma.PrismaPromise<Array<{ count: number }>>}
 */
function countDistinctAttendees(ownScope, userId) {
  const ownerClause = ownScope ? Prisma.sql`AND e.owner_id = ${userId}` : Prisma.empty;

  return prisma.$queryRaw`
    SELECT COUNT(DISTINCT r.attendee_email)::int AS count
    FROM registrations r
    INNER JOIN events e ON e.id = r.event_id
    WHERE e.deleted_at IS NULL
    ${ownerClause}
  `;
}

/**
 * Count ATTENDEE-role user accounts. System-wide (no `ownScope`) this is the
 * total of all non-deleted attendee accounts; organizer-scoped it counts
 * distinct non-deleted attendee accounts that hold at least one registration
 * for the organizer's events, matched through `registrations.attendee_email`.
 *
 * @param {boolean} ownScope - Restrict to a single organizer's events
 * @param {string} userId - Organizer id to restrict to when `ownScope`
 * @returns {Promise<number>}
 */
async function countRegisteredUsers(ownScope, userId) {
  if (!ownScope) {
    return prisma.user.count({
      where: { role: constants.ROLES.ATTENDEE, deletedAt: null },
    });
  }

  const rows = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT u.id)::int AS count
    FROM users u
    INNER JOIN registrations r ON LOWER(r.attendee_email) = LOWER(u.email)
    INNER JOIN events e ON e.id = r.event_id
    WHERE u.role = 'ATTENDEE'
      AND u.deleted_at IS NULL
      AND e.deleted_at IS NULL
      AND e.owner_id = ${userId}
  `;

  return Number(rows[0]?.count ?? 0);
}

/**
 * System-wide (or organizer-scoped) overview totals: event count, published
 * event count, total registrations, distinct attendee count, and registered
 * attendee accounts. ADMIN sees every event by default; a non-ADMIN caller is
 * always restricted to their own events unless an ADMIN requests `scope=own`.
 *
 * @param {string} userId - ID of the authenticated caller
 * @param {string} userRole - Role of the authenticated caller
 * @param {Object} [options]
 * @param {"own"|"system"} [options.scope] - Force a scope (system-wide is ADMIN only)
 * @returns {Promise<{ totalEvents: number, publishedEvents: number, totalAttendees: number, totalRegistrations: number, registeredUsers: number }>}
 * @throws {ForbiddenError} If a non-ADMIN requests the system-wide scope
 */
export async function getOverviewStats(userId, userRole, { scope } = {}) {
  const isAdmin = userRole === constants.ROLES.ADMIN;

  if (scope === "system" && !isAdmin) {
    throw new ForbiddenError(errMsg.AUTH.FORBIDDEN);
  }

  const ownScope = scope === "own" || !isAdmin;
  const ownerFilter = ownScope ? { ownerId: userId } : {};
  const eventWhere = { deletedAt: null, ...ownerFilter };

  const [totalEvents, publishedEvents, totalRegistrations, distinctAttendees, registeredUsers] =
    await Promise.all([
      prisma.event.count({ where: eventWhere }),
      prisma.event.count({ where: { ...eventWhere, status: constants.EVENT_STATUS.PUBLISHED } }),
      prisma.registration.count({ where: { event: eventWhere } }),
      countDistinctAttendees(ownScope, userId),
      countRegisteredUsers(ownScope, userId),
    ]);

  return {
    totalEvents,
    publishedEvents,
    totalAttendees: Number(distinctAttendees[0]?.count ?? 0),
    totalRegistrations,
    registeredUsers,
  };
}
