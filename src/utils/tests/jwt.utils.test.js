import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  getJwtConfig,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
} from '../jwt.utils.js';
import { UnauthorizedError } from '../error.js';
import { systemMessages } from '../../config/index.js';

vi.mock('../../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    JWT_SECRET: 'test_access_secret',
    JWT_REFRESH_SECRET: 'test_refresh_secret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  })),
  systemMessages: {
    ERROR: {
      AUTH: {
        TOKEN_INVALID_OR_EXPIRED: 'Invalid or expired token',
        TOKEN_REFRESH_INVALID: 'Invalid or expired refresh token',
      },
    },
  },
}));

describe('JWT Utils', () => {
  const mockPayload = { sub: 'user-123', email: 'test@example.com', role: 'ATTENDEE' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return configured JWT settings', () => {
    const config = getJwtConfig();
    expect(config.JWT_SECRET).toBe('test_access_secret');
    expect(config.JWT_REFRESH_SECRET).toBe('test_refresh_secret');
    expect(config.JWT_EXPIRES_IN).toBe('15m');
    expect(config.JWT_REFRESH_EXPIRES_IN).toBe('7d');
  });

  test('should sign and verify access token', () => {
    const token = signAccessToken(mockPayload);
    expect(typeof token).toBe('string');

    const verified = verifyAccessToken(token);
    expect(verified.sub).toBe(mockPayload.sub);
    expect(verified.email).toBe(mockPayload.email);
    expect(verified.role).toBe(mockPayload.role);
  });

  test('should sign and verify refresh token', () => {
    const token = signRefreshToken(mockPayload);
    expect(typeof token).toBe('string');

    const verified = verifyRefreshToken(token);
    expect(verified.sub).toBe(mockPayload.sub);
    expect(verified.email).toBe(mockPayload.email);
  });

  test('should throw UnauthorizedError when verifying invalid access token', () => {
    expect(() => verifyAccessToken('invalid.token.string')).toThrow(UnauthorizedError);
    try {
      verifyAccessToken('invalid.token.string');
    } catch (err) {
      expect(err.message).toBe(systemMessages.ERROR.AUTH.TOKEN_INVALID_OR_EXPIRED);
    }
  });

  test('should throw UnauthorizedError when verifying invalid refresh token', () => {
    expect(() => verifyRefreshToken('invalid.token.string')).toThrow(UnauthorizedError);
    try {
      verifyRefreshToken('invalid.token.string');
    } catch (err) {
      expect(err.message).toBe(systemMessages.ERROR.AUTH.TOKEN_REFRESH_INVALID);
    }
  });

  test('should decode token without verifying signature', () => {
    const token = signAccessToken(mockPayload);
    const decoded = decodeToken(token);
    expect(decoded.sub).toBe(mockPayload.sub);
    expect(decoded.exp).toBeDefined();
  });
});
