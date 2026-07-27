import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../../database/index.js';
import { ConflictError, UnauthorizedError } from '../../utils/error.js';
import { getRedisClient } from "../../config/redis.js";
import { getConfig, systemMessages } from "../../config/index.js";

const SALT_ROUNDS = 12;

function getJwtConfig() {
  const config = getConfig();
  return {
    JWT_SECRET: config.JWT_SECRET,
    JWT_REFRESH_SECRET: config.JWT_REFRESH_SECRET,
    JWT_EXPIRES_IN: config.JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: config.JWT_REFRESH_EXPIRES_IN,
  };
}

/**
 * Generate Access and Refresh JWT Tokens
 */
export const generateTokens = (user) => {
  const { JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } = getJwtConfig();
  const payload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });

  return { accessToken, refreshToken };
};

/**
 * Validate Access Token
 */
export const validateToken = (token) => {
  const { JWT_SECRET } = getJwtConfig();
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.TOKEN_INVALID_OR_EXPIRED);
  }
};

/**
 * Refresh Access Token using Refresh Token
 */
export const refreshToken = async (token) => {
  const { JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } = getJwtConfig();
  try {
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      throw new UnauthorizedError(systemMessages.ERROR.AUTH.TOKEN_REFRESH_REVOKED);
    }
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    const newAccessToken = jwt.sign(
      { sub: decoded.sub, name: decoded.name, email: decoded.email, role: decoded.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const newRefreshToken = jwt.sign(
      { sub: decoded.sub, name: decoded.name, email: decoded.email, role: decoded.role },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
    await blacklistRefreshToken(token);
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.TOKEN_REFRESH_INVALID);
  }
};

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
    const { JWT_REFRESH_SECRET } = getJwtConfig();
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    const redis = getRedisClient();
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.set(`blacklist:refresh:${token}`, "1", "EX", ttl);
    }
  } catch {
    // Token already invalid — nothing to blacklist
  }
}

export async function isTokenBlacklisted(token) {
  const redis = getRedisClient();
  const result = await redis.get(`blacklist:refresh:${token}`);
  return result !== null;
}