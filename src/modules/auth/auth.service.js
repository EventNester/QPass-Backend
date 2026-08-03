import bcrypt from 'bcryptjs';
import prisma from '../../database/index.js';
import { ConflictError, UnauthorizedError } from '../../utils/error.js';
import { getRedisClient } from '../../config/redis.js';
import { systemMessages } from '../../config/index.js';
import { writeAuditLog } from '../../utils/audit-log.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../utils/jwt.utils.js';

const SALT_ROUNDS = 12;

export function generateTokens(user) {
  const payload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return { accessToken, refreshToken };
}

export function validateToken(token) {
  return verifyAccessToken(token);
}

export async function refreshToken(token) {
  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.TOKEN_REFRESH_REVOKED);
  }

  const decoded = verifyRefreshToken(token);

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, name: true, email: true, role: true, deletedAt: true },
  });

  if (!user || user.deletedAt) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.UNAUTHORIZED);
  }

  const payload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(payload);

  await blacklistRefreshToken(token);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

export async function registerUser({ name, email, passwordHash, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.deletedAt) {
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: { deletedAt: null, name, passwordHash, role },
      });
      await writeAuditLog({
        actorId: user.id,
        action: 'USER_REACTIVATED',
        entity: 'User',
        entityId: user.id,
        afterSnapshot: { email: user.email, role: user.role },
      });
      return user;
    }
    throw new ConflictError(systemMessages.ERROR.AUTH.ALREADY_EXISTS);
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
  });

  await writeAuditLog({
    actorId: user.id,
    action: 'USER_REGISTERED',
    entity: 'User',
    entityId: user.id,
    afterSnapshot: { email: user.email, role: user.role },
  });

  return user;
}

export async function authenticateUser(email, plainPassword) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.INVALID_CREDENTIALS);
  }

  const isMatch = await comparePassword(plainPassword, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.INVALID_CREDENTIALS);
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'USER_LOGIN',
    entity: 'User',
    entityId: user.id,
    afterSnapshot: { email: user.email, role: user.role },
  });

  return user;
}

export async function blacklistRefreshToken(token) {
  try {
    const decoded = verifyRefreshToken(token);
    const redis = getRedisClient();
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.set(`blacklist:refresh:${token}`, '1', 'EX', ttl);
    }
  } catch {
    // ignore already expired or invalid tokens
  }
}

export async function isTokenBlacklisted(token) {
  const redis = getRedisClient();
  const result = await redis.get(`blacklist:refresh:${token}`);
  return result !== null;
}

function publicProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.UNAUTHORIZED);
  }

  return publicProfile(user);
}

export async function updateProfile(userId, { name, phone }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.UNAUTHORIZED);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name !== undefined && name !== user.name ? { name } : {}),
      ...(phone !== undefined && phone !== user.phone ? { phone } : {}),
    },
  });

  await writeAuditLog({
    actorId: userId,
    action: 'USER_PROFILE_UPDATED',
    entity: 'User',
    entityId: userId,
    beforeSnapshot: { name: user.name, phone: user.phone },
    afterSnapshot: { name: updated.name, phone: updated.phone },
  });

  return publicProfile(updated);
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.UNAUTHORIZED);
  }

  const isMatch = await comparePassword(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.CURRENT_PASSWORD_INVALID);
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await writeAuditLog({
    actorId: userId,
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    entityId: userId,
  });

  return { success: true };
}