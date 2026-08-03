import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { cleanDatabase } from '../helpers/cleanup.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Export Endpoints Integration Tests', () => {
  let organizerToken;
  let otherOrganizerToken;
  let staffToken;
  let eventId;
  let eventSlug;
  let ticketTypeId;
  let rawTokenA;
  const futureDate = new Date(Date.now() + 86400000);
  const laterDate = new Date(Date.now() + 172800000);

  beforeAll(async () => {
    await cleanDatabase();

    const orgRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Export Org',
        email: 'export-org@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    organizerToken = orgRes.body.data.accessToken;

    const otherRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Other Export Org',
        email: 'export-other@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    otherOrganizerToken = otherRes.body.data.accessToken;

    const staffRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Export Staff',
        email: 'export-staff@example.com',
        password: 'SecurePassword123',
        role: 'STAFF',
      });
    staffToken = staffRes.body.data.accessToken;

    const eventRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Export Event',
        description: 'For export testing',
        venue: 'Export Venue',
        startTime: futureDate.toISOString(),
        endTime: laterDate.toISOString(),
      });
    eventId = eventRes.body.data.id;

    const ticketRes = await request(app)
      .post(`/api/v1/events/${eventId}/ticket-types`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ name: 'Export Free', price: 0, capacity: 5 });
    ticketTypeId = ticketRes.body.data.id;

    const pubRes = await request(app)
      .post(`/api/v1/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`);
    eventSlug = pubRes.body.data.slug;

    const regA = await request(app)
      .post('/api/v1/registrations/free')
      .send({
        slug: eventSlug,
        name: 'Export Attendee A',
        email: 'export-a@example.com',
        ticketTypeId,
      });
    rawTokenA = regA.body.data.qr.token;

    await request(app)
      .post('/api/v1/registrations/free')
      .send({
        slug: eventSlug,
        name: 'Export Attendee B',
        email: 'export-b@example.com',
        ticketTypeId,
      });

    const scanRes = await request(app)
      .post(`/api/v1/checkins/${eventId}/scan`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ token: rawTokenA });
    expect(scanRes.status).toBe(200);
  });

  describe('GET /api/v1/events/:eventId/exports/registrations', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app).get(`/api/v1/events/${eventId}/exports/registrations`);
      expect(response.status).toBe(401);
    });

    it('should return 403 for a non-owner organizer', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/exports/registrations`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`);
      expect(response.status).toBe(403);
    });

    it('should return 403 for staff', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/exports/registrations`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(response.status).toBe(403);
    });

    it('should return 404 for an unknown event', async () => {
      const response = await request(app)
        .get('/api/v1/events/00000000-0000-4000-8000-000000000000/exports/registrations')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(response.status).toBe(404);
    });

    it('should return 422 for a malformed event id', async () => {
      const response = await request(app)
        .get('/api/v1/events/not-a-uuid/exports/registrations')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(response.status).toBe(422);
    });

    it('should return 422 for an unsupported format', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/exports/registrations?format=xls`)
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(response.status).toBe(422);
    });

    it('should export registrations as CSV by default', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/exports/registrations`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('registrations-export.csv');
      expect(response.text).toContain('Export Attendee A');
      expect(response.text).toContain('export-a@example.com');
      expect(response.text).toContain('export-b@example.com');
    });

    it('should export registrations as PDF', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/exports/registrations?format=pdf`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('.pdf');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('GET /api/v1/events/:eventId/exports/attendance', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app).get(`/api/v1/events/${eventId}/exports/attendance`);
      expect(response.status).toBe(401);
    });

    it('should return 403 for a non-owner organizer', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/exports/attendance`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`);
      expect(response.status).toBe(403);
    });

    it('should export attendance as CSV', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/exports/attendance?format=csv`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attendance-export.csv');
      expect(response.text).toContain('Export Attendee A');
      expect(response.text).toContain('export-a@example.com');
    });

    it('should export attendance as PDF', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/exports/attendance?format=pdf`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    });
  });
});
