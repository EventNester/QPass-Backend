import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { cleanDatabase } from '../helpers/cleanup.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Tickets API Integration Tests', () => {
  let organizerToken;
  let otherToken;
  let eventId;
  let ticketTypeId;
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const laterDate = new Date(Date.now() + 172800000).toISOString();

  beforeAll(async () => {
    await cleanDatabase();

    const orgReg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Ticket Organizer',
        email: 'ticket-org@example.com',
        password: 'SecurePassword123',
      });
    organizerToken = orgReg.body.data.accessToken;

    const otherReg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Other User',
        email: 'other-user@example.com',
        password: 'SecurePassword123',
      });
    otherToken = otherReg.body.data.accessToken;

    const eventRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Ticket Test Event',
        description: 'For ticket type testing',
        venue: 'Test Venue',
        startTime: futureDate,
        endTime: laterDate,
      });
    eventId = eventRes.body.data.id;
  }, 30000);

  afterAll(async () => {
    try {
      await cleanDatabase();
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('POST /api/v1/events/:eventId/ticket-types', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .send({ name: 'VIP', price: 5000 });

      expect(response.status).toBe(401);
    });

    it('should return 422 for missing required fields', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ description: 'Missing name and price' });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 422 for negative price', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Free Ticket', price: -100 });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 403 for non-owner', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'VIP', price: 5000 });

      expect(response.status).toBe(403);
      expect(response.body.status).toBe('error');
    });

    it('should return 201 and create a ticket type', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'VIP', description: 'VIP access', price: 5000, capacity: 100 });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('VIP');
      expect(response.body.data.price).toBe(5000);
      expect(response.body.data.capacity).toBe(100);
      expect(response.body.data.active).toBe(true);
      expect(response.body.data.sortOrder).toBe(0);

      ticketTypeId = response.body.data.id;
    });

    it('should return 201 and create another ticket type with auto-incremented sort order', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Regular', price: 0 });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe('Regular');
      expect(response.body.data.price).toBe(0);
      expect(response.body.data.sortOrder).toBe(1);
    });

    it('should return 404 for non-existent event', async () => {
      const response = await request(app)
        .post('/api/v1/events/00000000-0000-0000-0000-000000000000/ticket-types')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Ghost Ticket', price: 100 });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/events/:eventId/ticket-types', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/ticket-types`);

      expect(response.status).toBe(401);
    });

    it('should return 200 with all ticket types sorted by sortOrder', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data[0].name).toBeDefined();
      expect(response.body.data[0].price).toBeDefined();
      expect(response.body.data[0].sortOrder).toBe(0);
      expect(response.body.data[1].sortOrder).toBe(1);
    });

    it('should return 403 for non-owner', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/events/:eventId/ticket-types/:id', () => {
    it('should return 200 and update the ticket type', async () => {
      const response = await request(app)
        .patch(`/api/v1/events/${eventId}/ticket-types/${ticketTypeId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'VVIP', price: 10000, capacity: 50 });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.name).toBe('VVIP');
      expect(response.body.data.price).toBe(10000);
      expect(response.body.data.capacity).toBe(50);
    });

    it('should return 200 and update just capacity while preserving other fields', async () => {
      const response = await request(app)
        .patch(`/api/v1/events/${eventId}/ticket-types/${ticketTypeId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ capacity: 75 });

      expect(response.status).toBe(200);
      expect(response.body.data.capacity).toBe(75);
      expect(response.body.data.name).toBe('VVIP');
    });

    it('should return 422 for empty update payload', async () => {
      const response = await request(app)
        .patch(`/api/v1/events/${eventId}/ticket-types/${ticketTypeId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({});

      expect(response.status).toBe(422);
    });

    it('should return 403 for non-owner', async () => {
      const response = await request(app)
        .patch(`/api/v1/events/${eventId}/ticket-types/${ticketTypeId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked' });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent ticket type', async () => {
      const response = await request(app)
        .patch(`/api/v1/events/${eventId}/ticket-types/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Ghost' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/events/:eventId/ticket-types/:id', () => {
    let deletableTicketId;

    beforeAll(async () => {
      const res = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Deletable', price: 100 });
      deletableTicketId = res.body.data.id;
    });

    it('should return 200 and delete the ticket type', async () => {
      const response = await request(app)
        .delete(`/api/v1/events/${eventId}/ticket-types/${deletableTicketId}`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should return 404 for already deleted ticket type', async () => {
      const response = await request(app)
        .delete(`/api/v1/events/${eventId}/ticket-types/${deletableTicketId}`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .delete(`/api/v1/events/${eventId}/ticket-types/${ticketTypeId}`);

      expect(response.status).toBe(401);
    });

    it('should return 403 for non-owner', async () => {
      const anotherRes = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Temp', price: 100 });
      const tempId = anotherRes.body.data.id;

      const response = await request(app)
        .delete(`/api/v1/events/${eventId}/ticket-types/${tempId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
    });
  });
});
