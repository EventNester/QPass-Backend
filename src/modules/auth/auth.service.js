import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../../database/index.js';
import { ConflictError, UnauthorizedError } from '../../utils/error.js';
import { getRedisClient } from "../../config/redis.js";

import { getConfig } from "../../config/index.js";

const config = getConfig();
const { JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } = config;

/**
 * Generate Access and Refresh JWT Tokens
 */
export const generateTokens = (user) => {
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
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Refresh Access Token using Refresh Token
 */
export const refreshToken = async (token) => {
  try {
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      throw new Error('Refresh token has been revoked');
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
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch (error) {
    if (error.message === 'Refresh token has been revoked') {
      throw new UnauthorizedError(error.message);
    }
    throw new Error('Invalid or expired refresh token');
  }
};

const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

export async function registerUser({ name, email, passwordHash, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError("Account already exists with this email");
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
  });

  return user;
}

export async function authenticateUser(email, plainPassword) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const isMatch = await comparePassword(plainPassword, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError("Invalid email or password");
  }

  return user;
}

export async function blacklistRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    const redis = getRedisClient();
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.set(`blackedlist:refresh:${token}`, "1", "EX", ttl);
    }
  } catch {
    // Token already invalid — nothing to blacklist
  }
}

export async function isTokenBlacklisted(token) {
  const redis = getRedisClient();
  const result = await redis.get(`blackedlist:refresh:${token}`);
  return result !== null;
}