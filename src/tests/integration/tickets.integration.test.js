import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('TicketType Integration Tests', () => {
  let userToken;
  let testEventId;
  let testTicketTypeId;

  beforeAll(async () => {
    // 1. Clean the database
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

    // 2. Register a test user
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Ticket Tester',
        email: 'tester@tickets.com',
        password: 'SecurePassword123',
      });

    userToken = response.body.data.accessToken;
    const userId = response.body.data.user.id;

    // 3. Create an Event owned by the test user
    const event = await prisma.event.create({
      data: {
        title: 'Integration Test Event',
        slug: 'integration-test-event-1',
        description: 'An event for testing tickets',
        venue: 'Virtual',
        startTime: new Date(),
        endTime: new Date(Date.now() + 86400000), // Tomorrow
        capacity: 1000,
        ownerId: userId,
        status: 'PUBLISHED'
      }
    });
    testEventId = event.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/events/:eventId/ticket-types', () => {
    it('should create a valid ticket type and assign sortOrder 0', async () => {
      const payload = {
        name: 'Early Bird',
        price: 1500,
        capacity: 100
      };

      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/ticket-types`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.name).toBe('Early Bird');
      expect(res.body.data.sortOrder).toBe(0);
      
      testTicketTypeId = res.body.data.id;
    });

    it('should assign incremented sortOrder to a second ticket type', async () => {
      const payload = {
        name: 'Regular',
        price: 3000,
        capacity: 200
      };

      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/ticket-types`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.sortOrder).toBe(1);
    });

    it('should return 401 if user is not authenticated', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/ticket-types`)
        .send({ name: 'VIP', price: 5000, capacity: 50 });

      expect(res.status).toBe(401);
    });
    
    it('should return 422 for invalid negative price (zod validation)', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/ticket-types`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'VIP', price: -5000, capacity: 50 });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/events/:eventId/ticket-types', () => {
    it('should fetch all ticket types ordered by sortOrder', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${testEventId}/ticket-types`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Early Bird');
      expect(res.body.data[1].name).toBe('Regular');
    });
  });

  describe('PATCH /api/v1/events/:eventId/ticket-types/:id', () => {
    it('should update an existing ticket type successfully', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${testEventId}/ticket-types/${testTicketTypeId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Super Early Bird', price: 1200 });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Super Early Bird');
      expect(res.body.data.price).toBe(1200);
    });
  });

  describe('DELETE /api/v1/events/:eventId/ticket-types/:id', () => {
    it('should throw 409 Conflict if ticket type has registrations', async () => {
      // Create a ticket code first
      const ticketCode = await prisma.ticketCode.create({
        data: {
          eventId: testEventId,
          code: 'TEST-CODE-DELETE'
        }
      });

      // Create a dummy registration
      await prisma.registration.create({
        data: {
          eventId: testEventId,
          ticketTypeId: testTicketTypeId,
          ticketCodeId: ticketCode.id,
          status: 'CONFIRMED',
          paymentStatus: 'SUCCESS',
          attendeeEmail: 'test@example.com',
          attendeeName: 'Test Attendee'
        }
      });

      const res = await request(app)
        .delete(`/api/v1/events/${testEventId}/ticket-types/${testTicketTypeId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(409);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('registrations');
    });

    it('should successfully delete a ticket type with no registrations', async () => {
      // Create a dummy ticket type that has no registrations
      const dummyTicket = await prisma.ticketType.create({
        data: {
          eventId: testEventId,
          name: 'To Be Deleted',
          price: 500,
          capacity: 10,
          sortOrder: 2
        }
      });

      const res = await request(app)
        .delete(`/api/v1/events/${testEventId}/ticket-types/${dummyTicket.id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify it's gone from the DB
      const deletedCheck = await prisma.ticketType.findUnique({
        where: { id: dummyTicket.id }
      });
      expect(deletedCheck).toBeNull();
    });
  });
});
