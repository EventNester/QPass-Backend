import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { hashToken } from '../../utils/crypto.js';

// Intercept rate limiting behaviors during testing
vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

// Mock the new config object state
vi.mock('../../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    EMAIL_HOST_USER: 'qpassevents@gmail.com',
    EMAIL_HOST_PASSWORD: 'mock-app-password',
    EMAIL_HOST: '://gmail.com',
    EMAIL_PORT: 465,
    NODE_ENV: 'production'
  })),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Mock Nodemailer to trap API verification emails
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(() => Promise.resolve({ messageId: 'smtp-auth-integration-msg' })),
    })),
  },
}));

vi.mock('../../utils/email.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendPasswordResetEmail: vi.fn(async () => ({ success: true })),
  };
});

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

    it('should default to ATTENDEE when no role is provided', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Default User',
          email: 'default@example.com',
          password: 'SecurePassword123',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('ATTENDEE');
    });

    it('should honor the requested ORGANIZER role at registration', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Event Organizer',
          email: 'organizer-register@example.com',
          password: 'SecurePassword123',
          role: 'ORGANIZER',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user.role).toBe('ORGANIZER');
    });

    it('should honor the requested STAFF role at registration', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Event Staff',
          email: 'staff-register@example.com',
          password: 'SecurePassword123',
          role: 'STAFF',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user.role).toBe('STAFF');
    });

    it('should return 422 for an unsupported role', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Rogue Admin',
          email: 'rogue-admin@example.com',
          password: 'SecurePassword123',
          role: 'ADMIN',
        });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid role');
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

    it('should return 200 and invalidate tokens upon logout', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken: refreshTokenValue });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should return 401 if trying to use the invalidated refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenValue });

      expect(response.status).toBe(401);
    });
  });
});
