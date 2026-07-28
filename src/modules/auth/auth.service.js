import bcrypt from 'bcryptjs';
import prisma from '../../database/index.js';
import { ConflictError, UnauthorizedError } from '../../utils/error.js';
import { getRedisClient } from '../../config/redis.js';
import { systemMessages } from '../../config/index.js';
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

  const payload = {
    sub: decoded.sub,
    name: decoded.name,
    email: decoded.email,
    role: decoded.role,
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
    throw new ConflictError(systemMessages.ERROR.AUTH.ALREADY_EXISTS);
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
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