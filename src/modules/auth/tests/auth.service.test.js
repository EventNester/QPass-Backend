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
import prisma from '../../../database/index.js';

import bcrypt from 'bcryptjs';
import { ConflictError, UnauthorizedError } from '../../../utils/error.js';

// Mock dependencies
vi.mock('../../../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    JWT_SECRET: 'testsecret',
    JWT_REFRESH_SECRET: 'testrefreshsecret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d'
  }))
}));

vi.mock('../../../database/index.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
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

    test('should refresh access token correctly', async () => {
      const { refreshToken: token } = generateTokens(mockUser);
      mRedisClient.get.mockResolvedValue(null);
      const result = await refreshToken(token);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    test('should throw error if refresh token is blacklisted', async () => {
      const { refreshToken: token } = generateTokens(mockUser);
      mRedisClient.get.mockResolvedValue('1');
      await expect(refreshToken(token)).rejects.toThrow(UnauthorizedError);
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
      
      await expect(registerUser({ name: 'Lucas Nash', email: 'lucas@example.com', passwordHash: 'hashed_password', role: 'ORGANIZER' }))
        .rejects
        .toThrow(ConflictError);
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

      await expect(authenticateUser('lucas@example.com', 'password123'))
        .rejects
        .toThrow(UnauthorizedError);
    });

    test('should throw UnauthorizedError if password incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      await expect(authenticateUser('lucas@example.com', 'password123'))
        .rejects
        .toThrow(UnauthorizedError);
    });
  });

  describe('Redis Token Blacklisting', () => {
    test('blacklistRefreshToken should set token in redis', async () => {
      const { refreshToken: token } = generateTokens(mockUser);
      mRedisClient.set.mockResolvedValue('OK');
      
      await blacklistRefreshToken(token);
      expect(mRedisClient.set).toHaveBeenCalled();
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
});