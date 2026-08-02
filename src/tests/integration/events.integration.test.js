import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { cleanDatabase } from '../helpers/cleanup.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Events API Integration Tests', () => {
  let organizerToken;
  let eventId;
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const laterDate = new Date(Date.now() + 172800000).toISOString();

  beforeAll(async () => {
    await cleanDatabase();

    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Organizer User',
        email: 'organizer@example.com',
        password: 'SecurePassword123',
      });

    await prisma.user.update({
      where: { id: regRes.body.data.user.id },
      data: { role: 'ORGANIZER' },
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'organizer@example.com', password: 'SecurePassword123' });

    organizerToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/events', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          title: 'Unauthorized Event',
          startTime: futureDate,
          endTime: laterDate,
        });

      expect(response.status).toBe(401);
    });

    it('should return 422 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ title: 'Incomplete Event' });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 422 for invalid date range (end before start)', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Bad Date Event',
          startTime: laterDate,
          endTime: futureDate,
        });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 201 and create a draft event', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'QPass Launch Party',
          description: 'A grand launch event',
          venue: 'Convention Center',
          startTime: futureDate,
          endTime: laterDate,
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.title).toBe('QPass Launch Party');
      expect(response.body.data.status).toBe('DRAFT');
      expect(response.body.data.slug).toBeDefined();
      expect(response.body.data.venue).toBe('Convention Center');

      eventId = response.body.data.id;
    });
  });

  describe('GET /api/v1/events', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app)
        .get('/api/v1/events');

      expect(response.status).toBe(401);
    });

    it('should return 403 for an ATTENDEE', async () => {
      const attendeeReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Attendee User',
          email: 'attendee@example.com',
          password: 'SecurePassword123',
        });

      const response = await request(app)
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${attendeeReg.body.data.accessToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 200 with paginated events list', async () => {
      const response = await request(app)
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.events).toBeDefined();
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
    });

    it('should return 422 for an invalid status filter', async () => {
      const response = await request(app)
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .query({ status: 'BOGUS' });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/v1/events/:id', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}`);

      expect(response.status).toBe(401);
    });

    it('should return 422 for an invalid event ID format', async () => {
      const response = await request(app)
        .get('/api/v1/events/not-a-uuid')
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 403 for a non-owner', async () => {
      const viewerReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Viewer User',
          email: 'viewer@example.com',
          password: 'SecurePassword123',
        });

      const response = await request(app)
        .get(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${viewerReg.body.data.accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.status).toBe('error');
    });

    it('should return 200 with event details', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBe(eventId);
      expect(response.body.data.title).toBe('QPass Launch Party');
    });

    it('should return 404 for non-existent event', async () => {
      const response = await request(app)
        .get('/api/v1/events/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
    });
  });

  describe('PATCH /api/v1/events/:id', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .send({ title: 'Hacked Title' });

      expect(response.status).toBe(401);
    });

    it('should return 200 and update the event', async () => {
      const response = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'QPass Launch Party Updated',
          description: 'Updated description',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.title).toBe('QPass Launch Party Updated');
      expect(response.body.data.description).toBe('Updated description');
    });

    it('should return 403 for non-owner update', async () => {
      const otherReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Other User',
          email: 'other@example.com',
          password: 'SecurePassword123',
        });

      const otherToken = otherReg.body.data.accessToken;

      const response = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Hacked Title' });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/events/:id/publish', () => {
    it('should return 200 and publish the event', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.status).toBe('PUBLISHED');
      expect(response.body.data.publishedAt).toBeDefined();
    });

    it('should return 422 when publishing an already published event', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /api/v1/events/:id/cancel', () => {
    it('should return 200 and cancel the published event', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/cancel`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.status).toBe('CANCELLED');
    });

    it('should return 422 when cancelling an already cancelled event', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/cancel`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 422 when cancelling a draft event', async () => {
      const draftRes = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Draft Event',
          startTime: futureDate,
          endTime: laterDate,
        });

      const draftId = draftRes.body.data.id;

      const response = await request(app)
        .post(`/api/v1/events/${draftId}/cancel`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });
  });

  describe('DELETE /api/v1/events/:id', () => {
    let deleteEventId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Event To Delete',
          startTime: futureDate,
          endTime: laterDate,
        });

      deleteEventId = res.body.data.id;
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .delete(`/api/v1/events/${deleteEventId}`);

      expect(response.status).toBe(401);
    });

    it('should return 200 and soft-delete the event', async () => {
      const response = await request(app)
        .delete(`/api/v1/events/${deleteEventId}`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should return 404 for deleted event', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${deleteEventId}`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(404);
    });
  });
});
