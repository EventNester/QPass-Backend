import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { hashToken } from '../../utils/crypto.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
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

  describe('Profile, password, verification and sessions', () => {
    let accessToken;
    let refreshTokenValue;

    beforeAll(async () => {
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Me Flow',
          email: 'me-flow@example.com',
          password: 'SecurePassword123',
        });

      accessToken = registerRes.body.data.accessToken;
      refreshTokenValue = registerRes.body.data.refreshToken;
    });

    it('GET /auth/me returns the authenticated profile', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.email).toBe('me-flow@example.com');
      expect(response.body.data.emailVerifiedAt).toBeNull();
    });

    it('GET /auth/me returns 401 without a token', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
    });

    it('PATCH /auth/me updates the profile', async () => {
      const response = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Me Flow Updated', phone: '08012345678' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.name).toBe('Me Flow Updated');
      expect(response.body.data.phone).toBe('08012345678');
    });

    it('PATCH /auth/me rejects an invalid phone', async () => {
      const response = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: 'not-a-phone' });

      expect(response.status).toBe(422);
    });

    it('POST /auth/change-password changes the password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'SecurePassword123', newPassword: 'BrandNewPassword456' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('login works with the new password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'me-flow@example.com', password: 'BrandNewPassword456' });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBeDefined();
      refreshTokenValue = response.body.data.refreshToken;
      expect(refreshTokenValue).toBeDefined();
    });

    it('POST /auth/request-verification returns a verify token in test env', async () => {
      const response = await request(app)
        .post('/api/v1/auth/request-verification')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.verifyToken).toBeDefined();
    });

    it('POST /auth/verify-email verifies the email', async () => {
      const requestRes = await request(app)
        .post('/api/v1/auth/request-verification')
        .set('Authorization', `Bearer ${accessToken}`);
      const verifyToken = requestRes.body.data.verifyToken;

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: verifyToken });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(meRes.body.data.emailVerifiedAt).not.toBeNull();
    });

    it('POST /auth/verify-email rejects an invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(401);
    });

    it('GET /auth/sessions lists active sessions', async () => {
      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data.sessions)).toBe(true);
      expect(response.body.data.sessions.length).toBeGreaterThanOrEqual(1);
    });

    it('DELETE /auth/sessions/:id revokes the session for refreshTokenValue', async () => {
      const sessionId = hashToken(refreshTokenValue);

      const response = await request(app)
        .delete(`/api/v1/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('refresh is rejected after the session is revoked', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenValue });

      expect(response.status).toBe(401);    });
  });
});
