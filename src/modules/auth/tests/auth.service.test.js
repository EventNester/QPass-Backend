import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateTokens,
  validateToken,
  refreshToken,
  registerUser,
  authenticateUser,
  blacklistRefreshToken,
  isTokenBlacklisted,
  hashPassword,
  comparePassword
} from '../auth.service.js';
import { requireAuth } from '../auth.middleware.js';
import prisma from '../../../database/index.js';

import bcrypt from 'bcryptjs';
import { ConflictError, UnauthorizedError } from '../../../utils/error.js';
import { systemMessages } from '../../../config/index.js';

// Mock dependencies
vi.mock('../../../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    JWT_SECRET: 'testsecret',
    JWT_REFRESH_SECRET: 'testrefreshsecret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d'
  })),
  systemMessages: {
    ERROR: {
      AUTH: {
        UNAUTHORIZED: 'Unauthorized access',
        TOKEN_INVALID_OR_EXPIRED: 'Invalid or expired token',
        TOKEN_REFRESH_REVOKED: 'Refresh token has been revoked',
        TOKEN_REFRESH_INVALID: 'Invalid or expired refresh token',
        ALREADY_EXISTS: 'Account already exists with this email',
        INVALID_CREDENTIALS: 'Invalid email or password',
      },
    },
  },
}));

vi.mock('../../../database/index.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    }
  }
}));

const mRedisClient = {
  set: vi.fn(),
  get: vi.fn(),
};
vi.mock('../../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => mRedisClient)
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  }
}));

describe('Auth Service Tests', () => {
  const mockUser = {
    id: 'user_1',
    name: 'Lucas Nash',
    email: 'lucas@example.com',
    role: 'ORGANIZER',
    passwordHash: 'hashed_password'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Generation and Validation', () => {
    test('should generate valid access and refresh tokens with user payload', () => {
      const tokens = generateTokens(mockUser);
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
    });

    test('should validate access token and contain user attributes', () => {
      const { accessToken } = generateTokens(mockUser);
      const decoded = validateToken(accessToken);
      expect(decoded.sub).toBe(mockUser.id);
      expect(decoded.name).toBe(mockUser.name);
      expect(decoded.role).toBe('ORGANIZER');
    });

    test('should throw UnauthorizedError with exact message on invalid token', () => {
      expect(() => validateToken('garbage_token')).toThrow(UnauthorizedError);
      try {
        validateToken('garbage_token');
      } catch (err) {
        expect(err.message).toBe(systemMessages.ERROR.AUTH.TOKEN_INVALID_OR_EXPIRED);
      }
    });

    test('should refresh access token correctly', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const { refreshToken: token } = generateTokens(mockUser);
      mRedisClient.get.mockResolvedValue(null);
      const result = await refreshToken(token);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    test('should throw error if refresh token is blacklisted', async () => {
      const { refreshToken: token } = generateTokens(mockUser);
      mRedisClient.get.mockResolvedValue('1');
      try {
        await refreshToken(token);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedError);
        expect(err.message).toBe(systemMessages.ERROR.AUTH.TOKEN_REFRESH_REVOKED);
      }
    });

    test('should throw error if refresh token is invalid', async () => {
      mRedisClient.get.mockResolvedValue(null);
      try {
        await refreshToken('not_a_real_jwt');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedError);
        expect(err.message).toBe(systemMessages.ERROR.AUTH.TOKEN_REFRESH_INVALID);
      }
    });

    test('should throw UnauthorizedError when the user is missing or deleted', async () => {
      const { refreshToken: token } = generateTokens(mockUser);
      mRedisClient.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(refreshToken(token)).rejects.toThrow(
        systemMessages.ERROR.AUTH.UNAUTHORIZED
      );

      prisma.user.findUnique.mockResolvedValue({ ...mockUser, deletedAt: new Date() });
      await expect(refreshToken(token)).rejects.toThrow(
        systemMessages.ERROR.AUTH.UNAUTHORIZED
      );
    });
  });

  describe('Password Hashing', () => {
    test('hashPassword should return hashed password', async () => {
      bcrypt.hash.mockResolvedValue('hashed');
      const result = await hashPassword('plain');
      expect(result).toBe('hashed');
      expect(bcrypt.hash).toHaveBeenCalledWith('plain', 12);
    });

    test('comparePassword should return true on match', async () => {
      bcrypt.compare.mockResolvedValue(true);
      const result = await comparePassword('plain', 'hashed');
      expect(result).toBe(true);
    });
  });

  describe('registerUser', () => {
    test('should register a new user successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashed_password');
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await registerUser({ name: 'Lucas Nash', email: 'lucas@example.com', passwordHash: 'hashed_password', role: 'ORGANIZER' });
      expect(result).toEqual(mockUser);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    test('should throw ConflictError if email exists', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      
      try {
        await registerUser({ name: 'Lucas Nash', email: 'lucas@example.com', passwordHash: 'hashed_password', role: 'ORGANIZER' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        expect(err.message).toBe(systemMessages.ERROR.AUTH.ALREADY_EXISTS);
      }
    });

    test('should reactivate a soft-deleted account instead of creating a new one', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      prisma.user.findUnique.mockResolvedValue(deletedUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, deletedAt: null });

      const result = await registerUser({
        name: 'Lucas Nash',
        email: 'lucas@example.com',
        passwordHash: 'hashed_password',
        role: 'ORGANIZER',
      });

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          deletedAt: null,
          name: 'Lucas Nash',
          passwordHash: 'hashed_password',
          role: 'ORGANIZER',
        },
      });
      expect(result).toEqual({ ...mockUser, deletedAt: null });
    });
  });

  describe('authenticateUser', () => {
    test('should authenticate valid user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      const result = await authenticateUser('lucas@example.com', 'password123');
      expect(result).toEqual(mockUser);
    });

    test('should throw UnauthorizedError if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      try {
        await authenticateUser('lucas@example.com', 'password123');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedError);
        expect(err.message).toBe(systemMessages.ERROR.AUTH.INVALID_CREDENTIALS);
      }
    });

    test('should throw UnauthorizedError if password incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      try {
        await authenticateUser('lucas@example.com', 'password123');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedError);
        expect(err.message).toBe(systemMessages.ERROR.AUTH.INVALID_CREDENTIALS);
      }
    });
  });

  describe('Redis Token Blacklisting', () => {
    test('blacklistRefreshToken should set token in redis', async () => {
      const { refreshToken: token } = generateTokens(mockUser);
      mRedisClient.set.mockResolvedValue('OK');
      
      await blacklistRefreshToken(token);
      expect(mRedisClient.set).toHaveBeenCalled();
    });

    test('blacklistRefreshToken should ignore invalid or expired tokens', async () => {
      await blacklistRefreshToken('garbage_token');
      expect(mRedisClient.set).not.toHaveBeenCalled();
    });

    test('isTokenBlacklisted should return true if found', async () => {
      mRedisClient.get.mockResolvedValue('1');
      const result = await isTokenBlacklisted('some_token');
      expect(result).toBe(true);
    });

    test('isTokenBlacklisted should return false if not found', async () => {
      mRedisClient.get.mockResolvedValue(null);
      const result = await isTokenBlacklisted('some_token');
      expect(result).toBe(false);
    });
  });

  describe('requireAuth Middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      vi.clearAllMocks();
      req = { headers: {} };
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      next = vi.fn();
    });

    test('should return 401 if no authorization header', async () => {
      await requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: systemMessages.ERROR.AUTH.UNAUTHORIZED });
    });

    test('should return 401 if token does not start with Bearer', async () => {
      req.headers.authorization = 'Basic token123';
      await requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('should return 401 if token is invalid', async () => {
      req.headers.authorization = 'Bearer invalid_token';
      await requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('should attach user and call next if token is valid', async () => {
      const { accessToken } = generateTokens(mockUser);
      req.headers.authorization = `Bearer ${accessToken}`;
      await requireAuth(req, res, next);
      expect(req.user).toBeDefined();
      expect(next).toHaveBeenCalled();
    });
  });
});