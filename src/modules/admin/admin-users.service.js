import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../../database/index.js";
import { getRedisClient } from "../../config/redis.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../utils/error.js";
import { constants, systemMessages, logger } from "../../config/index.js";
import { writeAuditLog } from "../../utils/audit-log.js";
import { sendAdminInviteEmail } from "../../utils/email.js";

const msg = systemMessages.ERROR;
const SALT_ROUNDS = 12;
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const REDIS_PREFIX = "admin_invite:";

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

/**
 * Invite someone to become an ADMIN. Sends an email with a single-use, expiring
 * invite token; the invitee sets their own password on acceptance, so no one
 * else ever sees it. Only callable by an existing ADMIN (enforced at the route
 * layer). The token is stored in Redis and deleted if the email fails to send.
 *
 * @param {Object} payload - { email }
 * @param {string} actorId - ADMIN performing the invite
 * @returns {Promise<{success: boolean, inviteToken?: string, error?: string}>}
 */
export async function sendAdminInvite({ email }, actorId) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing && !existing.deletedAt) {
    if (existing.role === constants.ROLES.ADMIN) {
      throw new ConflictError(msg.ADMIN.INVITE_ALREADY_ADMIN);
    }
    throw new ConflictError(msg.ADMIN.USER_ALREADY_EXISTS);
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const redis = getRedisClient();
  await redis.set(`${REDIS_PREFIX}${inviteToken}`, normalizedEmail, "EX", INVITE_TTL_SECONDS);

  const emailResult = await sendAdminInviteEmail(normalizedEmail, inviteToken).catch(async (err) => {
    try {
      await redis.del(`${REDIS_PREFIX}${inviteToken}`);
    } catch { /* ignore cleanup error */ }
    return { success: false, error: err.message };
  });

  if (emailResult && emailResult.success === false) {
    try {
      await redis.del(`${REDIS_PREFIX}${inviteToken}`);
    } catch { /* ignore cleanup error */ }
    logger.error({ err: emailResult.error || "unknown", email: normalizedEmail }, "Admin invite email failed to send");
    return { success: false, error: emailResult.error || "Failed to send admin invitation" };
  }

  writeAuditLog({
    actorId,
    action: "ADMIN_INVITE_SENT",
    entity: "User",
    entityId: null,
    afterSnapshot: { email: normalizedEmail, invitedRole: constants.ROLES.ADMIN },
  });

  return { success: true, inviteToken };
}

/**
 * Accept an admin invitation by setting the invitee's own name and password.
 * Creates the ADMIN account (or reactivates a previously soft-deleted user with
 * that email). The invite token is deleted on success — it is single-use.
 *
 * @param {Object} payload - { token, name, password }
 * @returns {Promise<Object>} Public user fields
 * @throws {UnauthorizedError} If the invite token is invalid or expired
 * @throws {ConflictError} If a non-admin account already exists with that email
 */
export async function acceptAdminInvite({ token, name, password }) {
  const redis = getRedisClient();
  const invitedEmail = await redis.get(`${REDIS_PREFIX}${token}`);
  if (!invitedEmail) {
    throw new UnauthorizedError(msg.ADMIN.INVITE_INVALID);
  }

  const existing = await prisma.user.findUnique({ where: { email: invitedEmail } });
  if (existing && !existing.deletedAt) {
    if (existing.role === constants.ROLES.ADMIN) {
      throw new ConflictError(msg.ADMIN.INVITE_ALREADY_ADMIN);
    }
    throw new ConflictError(msg.ADMIN.USER_ALREADY_EXISTS);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const data = {
    name,
    email: invitedEmail,
    passwordHash,
    role: constants.ROLES.ADMIN,
    status: "ACTIVE",
    emailVerifiedAt: new Date(),
  };

  let user;
  if (existing && existing.deletedAt) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: { ...data, deletedAt: null },
    });
  } else {
    user = await prisma.user.create({ data });
  }

  await redis.del(`${REDIS_PREFIX}${token}`);

  writeAuditLog({
    actorId: null,
    action: "ADMIN_INVITE_ACCEPTED",
    entity: "User",
    entityId: user.id,
    afterSnapshot: { role: user.role },
  });

  return toPublicUser(user);
}

/**
 * List registered users for the admin "users directory".
 *
 * Only returns real accounts from the `users` table (soft-deleted users are
 * excluded). "Derived" rows — actors inferred from audit logs or event owners
 * that do not correspond to a registered account — are never produced here, so
 * only real, deactivatable users are listed. ADMIN role enforced at the route.
 *
 * @param {Object} [query] - { page, limit, search }
 * @returns {Promise<{users: Object[], pagination: Object}>}
 */
export async function listUsers({
  page,
  limit,
  search,
} = {}) {
  const pageNum = page ?? constants.PAGINATION.DEFAULT_PAGE;
  const limitNum = Math.min(
    limit ?? constants.PAGINATION.DEFAULT_LIMIT,
    constants.PAGINATION.MAX_LIMIT
  );
  const skip = (pageNum - 1) * limitNum;

  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNum,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Deactivate a user's account (set status to INACTIVE) so they can no longer
 * sign in or act. Only a real, non-deleted account can be deactivated — an id
 * that references no user (e.g. a frontend "derived" row) yields 404. Idempotent:
 * deactivating an already-INACTIVE user succeeds without changes. Cannot be used
 * on your own account. ADMIN role enforced at the route.
 *
 * @param {Object} params - { userId }
 * @param {string} actorId - ADMIN performing the action
 * @returns {Promise<Object>} Updated public user fields
 */
export async function deactivateUser({ userId }, actorId) {
  if (userId === actorId) {
    throw new ForbiddenError(msg.ADMIN.CANNOT_DEACTIVATE_SELF);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new NotFoundError(msg.ADMIN.USER_NOT_FOUND);
  }

  if (user.status === "INACTIVE") {
    return toPublicUser(user);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: "INACTIVE" },
  });

  writeAuditLog({
    actorId,
    action: "ADMIN_USER_DEACTIVATED",
    entity: "User",
    entityId: userId,
    beforeSnapshot: { status: user.status },
    afterSnapshot: { status: updated.status },
  });

  return toPublicUser(updated);
}

/**
 * Promote an existing (non-deleted) user to ADMIN. Idempotent — promoting a
 * user who is already an ADMIN succeeds without changes. Only callable by an
 * existing ADMIN (enforced at the route layer).
 *
 * @param {string} userId - Target user id
 * @param {string} actorId - ADMIN performing the action
 * @returns {Promise<Object>} Public user fields
 */
export async function promoteToAdmin(userId, actorId) {
  if (userId === actorId) {
    throw new ForbiddenError(msg.ADMIN.CANNOT_MODIFY_SELF);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new NotFoundError(msg.ADMIN.USER_NOT_FOUND);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: constants.ROLES.ADMIN },
  });

  writeAuditLog({
    actorId,
    action: "ADMIN_USER_PROMOTED",
    entity: "User",
    entityId: userId,
    beforeSnapshot: { role: user.role },
    afterSnapshot: { role: updated.role },
  });

  return toPublicUser(updated);
}
