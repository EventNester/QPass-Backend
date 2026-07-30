import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { cleanDatabase } from '../helpers/cleanup.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Event Tickets (Registrations) API Integration Tests', () => {
  let organizerToken;
  let otherToken;
  let eventId;
  let ticketTypeId;
  let registrationId;
  let ticketCodeId;

  beforeAll(async () => {
    await cleanDatabase();

    // Setup Organizer
    const orgReg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Organizer',
        email: 'org@example.com',
        password: 'Password123',
      });
    organizerToken = orgReg.body.data.accessToken;

    // Setup Other User
    const otherReg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Other',
        email: 'other@example.com',
        password: 'Password123',
      });
    otherToken = otherReg.body.data.accessToken;

    // Create Event
    const eventRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Export Test Event',
        description: 'For testing ticket exports',
        venue: 'Test Venue',
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 172800000).toISOString(),
      });
    eventId = eventRes.body.data.id;

    // Create TicketType
    const typeRes = await request(app)
      .post(`/api/v1/events/${eventId}/ticket-types`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: 'General',
        price: 1000,
      });
    ticketTypeId = typeRes.body.data.id;

    // Manually create a TicketCode and Registration for the event
    const code = await prisma.ticketCode.create({
      data: {
        eventId,
        code: 'TEST-CODE-123',
        status: 'UNUSED',
      },
    });
    ticketCodeId = code.id;

    const reg = await prisma.registration.create({
      data: {
        eventId,
        ticketTypeId,
        ticketCodeId,
        attendeeName: 'John Doe',
        attendeeEmail: 'john@example.com',
        status: 'CONFIRMED',
        paymentStatus: 'SUCCESS',
      },
    });
    registrationId = reg.id;
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/events/:eventId/tickets', () => {
    it('should list event tickets for the owner', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/tickets`)
        .set('Authorization', `Bearer ${organizerToken}`);
      
      if (response.status !== 200) console.error("List tickets error:", response.body);
      expect(response.status).toBe(200);
      expect(response.body.data.registrations.length).toBe(1);
      expect(response.body.data.registrations[0].attendeeName).toBe('John Doe');
    });

    it('should filter tickets by status', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/tickets?status=PENDING`)
        .set('Authorization', `Bearer ${organizerToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.registrations.length).toBe(0);
    });

    it('should deny access to non-owners', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/tickets`)
        .set('Authorization', `Bearer ${otherToken}`);
      
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/events/:eventId/tickets/export', () => {
    it('should export tickets as CSV', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/tickets/export`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ format: 'csv' });
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('John Doe');
      expect(response.text).toContain('TEST-CODE-123');
    });

    it('should export tickets as PDF', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/tickets/export`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ format: 'pdf' });
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('GET /api/v1/tickets/:ticketId', () => {
    it('should return ticket details for the owner', async () => {
      const response = await request(app)
        .get(`/api/v1/tickets/${registrationId}`)
        .set('Authorization', `Bearer ${organizerToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.attendeeName).toBe('John Doe');
      expect(response.body.data.qrDataUrl).toBeDefined();
    });
  });

  describe('GET /api/v1/tickets/:ticketId/download', () => {
    it('should download ticket as PDF', async () => {
      const response = await request(app)
        .get(`/api/v1/tickets/${registrationId}/download`)
        .set('Authorization', `Bearer ${organizerToken}`);
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      // The updated filename logic includes the event slug
      expect(response.headers['content-disposition']).toContain('-ticket.pdf');
    });
  });

  describe('Edge Cases', () => {
    let emptyEventId;
    let edgeRegistrationId;

    beforeAll(async () => {
      // Create a second event with no registrations
      const emptyEventRes = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Empty Event',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 172800000).toISOString(),
        });
      emptyEventId = emptyEventRes.body.data.id;

      const edgeCode = await prisma.ticketCode.create({
        data: {
          eventId,
          code: 'EDGE-CODE-999',
          status: 'UNUSED',
        },
      });

      const edgeReg = await prisma.registration.create({
        data: {
          eventId,
          ticketTypeId,
          ticketCodeId: edgeCode.id,
          attendeeName: 'O\'Connor, Bartholomew Bartholomew Bartholomew Bartholomew',
          attendeeEmail: 'edge@example.com',
          status: 'CONFIRMED',
          paymentStatus: 'SUCCESS',
        },
      });
      edgeRegistrationId = edgeReg.id;
    });

    it('should export tickets as CSV with empty data', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${emptyEventId}/tickets/export`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ format: 'csv' });
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('"Name","Email","Ticket Type","Status","Payment","Ticket Code"');
      expect(response.text.split('\n').length).toBeLessThanOrEqual(2);
    });

    it('should generate PDF correctly with long names and no QR code', async () => {
      const response = await request(app)
        .get(`/api/v1/tickets/${edgeRegistrationId}/download`)
        .set('Authorization', `Bearer ${organizerToken}`);
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
    });
  });
});
