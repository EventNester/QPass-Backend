import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Auth API Integration Tests', () => {

  beforeAll(async () => {
    await prisma.checkIn.deleteMany();
    await prisma.qrToken.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.ticketCode.deleteMany();
    await prisma.ticketType.deleteMany();
    await prisma.importBatch.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.eventStaffAssignment.deleteMany();
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register', () => {

    it('should return 422 if payload is missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Incomplete User',
        });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBeDefined();
    });

    it('should return 422 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'not-an-email',
          password: 'SecurePassword123',
        });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 201 and create user for a valid payload', async () => {
      const validPayload = {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'SecurePassword123',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe('ada@example.com');
      expect(response.body.data.user.role).toBe('ATTENDEE');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

  });

  describe('POST /api/v1/auth/login', () => {

    it('should return 422 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 401 for wrong password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ada@example.com',
          password: 'WrongPassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });

    it('should return 200 with tokens for valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ada@example.com',
          password: 'SecurePassword123',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshTokenValue;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ada@example.com', password: 'SecurePassword123' });
      refreshTokenValue = loginRes.body.data.refreshToken;
    });

    it('should return 422 if refresh token is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 200 with new tokens for a valid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenValue });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should return 401 when refresh token is reused (replay protection)', async () => {
      const replayResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenValue });

      expect(replayResponse.status).toBe(401);
    });

    it('should return 401 for an invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let accessToken;
    let refreshTokenValue;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ada@example.com', password: 'SecurePassword123' });
      accessToken = loginRes.body.data.accessToken;
      refreshTokenValue = loginRes.body.data.refreshToken;
    });

    it('should return 401 without auth header', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: refreshTokenValue });

      expect(response.status).toBe(401);
    });

    it('should return 200 and blacklist the refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken: refreshTokenValue });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should return 401 when using a blacklisted refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenValue });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /api/v1/auth/forgot-password & reset-password', () => {
    let generatedResetToken;

    it('should return 200 for forgot-password with non-existent email (no enumeration)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'notfound@example.com',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toEqual({});
    });

    it('should return 200 and generate reset token for existing user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'ada@example.com',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.resetToken).toBeDefined();
      generatedResetToken = response.body.data.resetToken;
    });

    it('should return 200 and reset password with a valid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: generatedResetToken,
          password: 'NewSecurePassword456',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should allow user to login with the new reset password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ada@example.com',
          password: 'NewSecurePassword456',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should return 401 when trying to reuse an invalidated reset token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: generatedResetToken,
          password: 'AnotherPassword789',
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });

    it('should return 401 for an invalid reset token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'invalid-token-string',
          password: 'AnotherPassword789',
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });
});
