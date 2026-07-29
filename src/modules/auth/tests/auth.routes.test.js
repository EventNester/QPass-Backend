import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { systemMessages } from '../../../config/index.js';

vi.mock('../auth.service.js', () => ({
  registerUser: vi.fn(),
  authenticateUser: vi.fn(),
  generateTokens: vi.fn(),
  refreshToken: vi.fn(),
  blacklistRefreshToken: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../auth.middleware.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user_1', role: 'ATTENDEE' };
    next();
  }
}));

vi.mock(import('../../../middlewares/rate-limit.middleware.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, authLimiter: (req, res, next) => next() };
});

import { registerUser, authenticateUser, generateTokens, refreshToken, blacklistRefreshToken, hashPassword } from '../auth.service.js';

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should return 422 for missing fields (Zod validation)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({});
      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
    });

    it('should return 422 for invalid password (Zod validation)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'John',
        email: 'john@example.com',
        password: 'weak',
        role: 'ATTENDEE'
      });
      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
    });

    it('should return 201 on successful registration', async () => {
      hashPassword.mockResolvedValue('hashed_pass');
      registerUser.mockResolvedValue({ id: 'user_1', name: 'John', email: 'john@example.com', role: 'ATTENDEE' });
      generateTokens.mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' });

      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'John',
        email: 'john@example.com',
        password: 'Password123',
        role: 'ATTENDEE'
      });
      
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.id).toBe('user_1');
      expect(res.body.data.accessToken).toBe('access');
      expect(res.body.message).toBe(systemMessages.SUCCESS.AUTH.REGISTER);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 422 for missing fields', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({});
      expect(res.status).toBe(422);
    });

    it('should return 200 on successful login', async () => {
      authenticateUser.mockResolvedValue({ id: 'user_1', name: 'John', email: 'john@example.com', role: 'ATTENDEE' });
      generateTokens.mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' });

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'john@example.com',
        password: 'Password123'
      });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.id).toBe('user_1');
      expect(res.body.data.accessToken).toBe('access');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should return 422 if refreshToken is missing', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({});
      expect(res.status).toBe(422);
    });

    it('should return 200 on successful refresh', async () => {
      refreshToken.mockResolvedValue({ accessToken: 'new_access', refreshToken: 'new_refresh' });

      const res = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: 'valid_refresh'
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.accessToken).toBe('new_access');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should return 422 if refreshToken is missing', async () => {
      const res = await request(app).post('/api/v1/auth/logout').send({});
      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
    });

    it('should call blacklistRefreshToken and return 200', async () => {
      blacklistRefreshToken.mockResolvedValue();

      const res = await request(app).post('/api/v1/auth/logout').send({
        refreshToken: 'refresh_to_blacklist'
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(blacklistRefreshToken).toHaveBeenCalledWith('refresh_to_blacklist');
    });
  });
});
