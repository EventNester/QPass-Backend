import jwt from 'jsonwebtoken';
import { getConfig, systemMessages } from '../config/index.js';
import { UnauthorizedError } from './error.js';

export function getJwtConfig() {
  const config = getConfig();
  return {
    JWT_SECRET: config.JWT_SECRET,
    JWT_REFRESH_SECRET: config.JWT_REFRESH_SECRET,
    JWT_EXPIRES_IN: config.JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: config.JWT_REFRESH_EXPIRES_IN,
  };
}

export function signAccessToken(payload, expiresIn) {
  const { JWT_SECRET, JWT_EXPIRES_IN } = getJwtConfig();
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: expiresIn || JWT_EXPIRES_IN,
  });
}

export function signRefreshToken(payload, expiresIn) {
  const { JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN } = getJwtConfig();
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: expiresIn || JWT_REFRESH_EXPIRES_IN,
  });
}

export function verifyAccessToken(token) {
  const { JWT_SECRET } = getJwtConfig();
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.TOKEN_INVALID_OR_EXPIRED);
  }
}

export function verifyRefreshToken(token) {
  const { JWT_REFRESH_SECRET } = getJwtConfig();
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch {
    throw new UnauthorizedError(systemMessages.ERROR.AUTH.TOKEN_REFRESH_INVALID);
  }
}

export function decodeToken(token) {
  return jwt.decode(token);
}
