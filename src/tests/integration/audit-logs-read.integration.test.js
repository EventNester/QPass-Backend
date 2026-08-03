import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { cleanDatabase } from '../helpers/cleanup.js';
import { hashPassword, generateTokens } from '../../modules/auth/auth.service.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Audit Logs Read Endpoint Integration Tests', () => {
  let adminToken;
  let organizerToken;
  let organizerId;
  let eventId;
  let eventSlug;
  let ticketTypeId;
  let registrationId;
  let rawToken;
  const futureDate = new Date(Date.now() + 86400000);
  const laterDate = new Date(Date.now() + 172800000);

  beforeAll(async () => {
    await cleanDatabase();

    const adminUser = await prisma.user.create({
      data: {
        name: 'Audit Admin',
        email: 'audit-admin@example.com',
        passwordHash: await hashPassword('SecurePassword123'),
        role: 'ADMIN',
      },
    });
    adminToken = generateTokens(adminUser).accessToken;

    const orgRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Audit Org Read',
        email: 'audit-read-org@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    organizerToken = orgRes.body.data.accessToken;
    organizerId = orgRes.body.data.user.id;

    const eventRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Audit Read Event',
        description: 'For audit read testing',
        venue: 'Audit Read Venue',
        startTime: futureDate.toISOString(),
        endTime: laterDate.toISOString(),
      });
    eventId = eventRes.body.data.id;

    const ticketRes = await request(app)
      .post(`/api/v1/events/${eventId}/ticket-types`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ name: 'Audit Read Free', price: 0 });
    ticketTypeId = ticketRes.body.data.id;

    const pubRes = await request(app)
      .post(`/api/v1/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`);
    eventSlug = pubRes.body.data.slug;

    const regRes = await request(app)
      .post('/api/v1/registrations/free')
      .send({
        slug: eventSlug,
        name: 'Audit Read Attendee',
        email: 'audit-read-attendee@example.com',
        ticketTypeId,
      });
    registrationId = regRes.body.data.registration.id;
    rawToken = regRes.body.data.qr.token;

    const scanRes = await request(app)
      .post(`/api/v1/checkins/${eventId}/scan`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ token: rawToken });
    expect(scanRes.status).toBe(200);
  });

  describe('GET /api/v1/audit-logs', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app).get('/api/v1/audit-logs');
      expect(response.status).toBe(401);
    });

    it('should return 403 for a non-admin user', async () => {
      const response = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(response.status).toBe(403);
    });

    it('should return a paginated list of audit logs for an admin', async () => {
      const response = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data.auditLogs)).toBe(true);
      expect(response.body.data.auditLogs.length).toBeGreaterThan(0);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
      const actions = response.body.data.auditLogs.map((log) => log.action);
      expect(actions).toEqual(expect.arrayContaining(['CHECKIN_VALID']));
    });

    it('should filter by action', async () => {
      const response = await request(app)
        .get('/api/v1/audit-logs?action=CHECKIN_VALID')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.auditLogs.length).toBeGreaterThan(0);
      for (const log of response.body.data.auditLogs) {
        expect(log.action).toBe('CHECKIN_VALID');
      }
    });

    it('should filter by entity', async () => {
      const response = await request(app)
        .get('/api/v1/audit-logs?entity=Registration')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.auditLogs.length).toBeGreaterThan(0);
      const entry = response.body.data.auditLogs.find(
        (log) => log.entityId === registrationId
      );
      expect(entry).toBeDefined();
      expect(entry.action).toBe('PUBLIC_REGISTRATION');
    });

    it('should filter by actorId', async () => {
      const response = await request(app)
        .get(`/api/v1/audit-logs?actorId=${organizerId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.auditLogs.length).toBeGreaterThan(0);
      for (const log of response.body.data.auditLogs) {
        expect(log.actorId).toBe(organizerId);
      }
    });

    it('should include actor details on entries', async () => {
      const response = await request(app)
        .get('/api/v1/audit-logs?action=CHECKIN_VALID')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      const entry = response.body.data.auditLogs[0];
      expect(entry.actor).toMatchObject({
        id: organizerId,
        name: 'Audit Org Read',
        role: 'ORGANIZER',
      });
    });
  });
});
