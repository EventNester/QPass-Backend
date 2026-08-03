import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'crypto';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { cleanDatabase } from '../helpers/cleanup.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Dashboard Stats API Integration Tests', () => {
  let organizerToken;
  let otherOrganizerToken;
  let staffToken;
  let staffUserId;
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
        name: 'Dashboard Org',
        email: 'dashboard-org@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    organizerToken = orgRes.body.data.accessToken;

    const otherRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Other Org',
        email: 'dashboard-other@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    otherOrganizerToken = otherRes.body.data.accessToken;

    const staffRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Dashboard Staff',
        email: 'dashboard-staff@example.com',
        password: 'SecurePassword123',
        role: 'STAFF',
      });
    staffToken = staffRes.body.data.accessToken;
    staffUserId = staffRes.body.data.user.id;

    const eventRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Dashboard Stats Event',
        description: 'For dashboard stats testing',
        venue: 'Dashboard Venue',
        startTime: futureDate.toISOString(),
        endTime: laterDate.toISOString(),
      });

    eventId = eventRes.body.data.id;
    await prisma.event.update({
      where: { id: eventId },
      data: { capacity: 10 },
    });

    const ticketRes = await request(app)
      .post(`/api/v1/events/${eventId}/ticket-types`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ name: 'Free', price: 0, capacity: 5 });
    ticketTypeId = ticketRes.body.data.id;

    const pubRes = await request(app)
      .post(`/api/v1/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`);
    eventSlug = pubRes.body.data.slug;

    const regA = await request(app)
      .post('/api/v1/registrations/free')
      .send({
        slug: eventSlug,
        name: 'Attendee A',
        email: 'dashboard-a@example.com',
        ticketTypeId,
      });
    rawTokenA = regA.body.data.qr.token;

    await request(app)
      .post('/api/v1/registrations/free')
      .send({
        slug: eventSlug,
        name: 'Attendee B',
        email: 'dashboard-b@example.com',
        ticketTypeId,
      });

    const cancelledTicketCode = await prisma.ticketCode.create({
      data: {
        eventId,
        code: `CANCEL-${randomBytes(4).toString('hex').toUpperCase()}`,
        status: 'USED',
        attendeeEmail: 'dashboard-cancelled@example.com',
        attendeeName: 'Cancelled Attendee',
      },
    });
    await prisma.registration.create({
      data: {
        eventId,
        ticketCodeId: cancelledTicketCode.id,
        attendeeEmail: 'dashboard-cancelled@example.com',
        attendeeName: 'Cancelled Attendee',
        ticketTypeId,
        source: 'IMPORT',
        status: 'CANCELLED',
      },
    });

    const scanRes = await request(app)
      .post(`/api/v1/checkins/${eventId}/scan`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ token: rawTokenA });
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.data.result).toBe('VALID');

    await prisma.eventStaffAssignment.create({
      data: { eventId, userId: staffUserId, permissionScope: 'SCANNER' },
    });
  });

  describe('GET /api/v1/events/:id/dashboard', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app).get(`/api/v1/events/${eventId}/dashboard`);
      expect(response.status).toBe(401);
    });

    it('should return 403 for an attendee role', async () => {
      const attendeeRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Dashboard Attendee',
          email: 'dashboard-attendee@example.com',
          password: 'SecurePassword123',
        });
      const attendeeToken = attendeeRes.body.data.accessToken;

      const response = await request(app)
        .get(`/api/v1/events/${eventId}/dashboard`)
        .set('Authorization', `Bearer ${attendeeToken}`);
      expect(response.status).toBe(403);
    });

    it('should return 403 for a non-owner organizer without assignment', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/dashboard`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`);
      expect(response.status).toBe(403);
    });

    it('should return 404 for an unknown event', async () => {
      const response = await request(app)
        .get('/api/v1/events/00000000-0000-4000-8000-000000000000/dashboard')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(response.status).toBe(404);
    });

    it('should return correct aggregate stats for the owner', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/dashboard`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.registrations).toEqual({
        total: 3,
        confirmed: 2,
        pending: 0,
        cancelled: 1,
      });
      expect(response.body.data.checkins).toEqual({
        total: 1,
        valid: 1,
        duplicate: 0,
      });
      expect(response.body.data.noShows).toBe(1);
      expect(response.body.data.capacity).toEqual({
        max: 10,
        utilization: 20,
      });
      expect(response.body.data.ticketBreakdown).toHaveLength(1);
      expect(response.body.data.ticketBreakdown[0]).toEqual({
        ticketType: 'Free',
        sold: 2,
        checkedIn: 1,
      });
    });

    it('should return 200 for an active assigned staff member', async () => {
      const response = await request(app)
        .get(`/api/v1/events/${eventId}/dashboard`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(response.status).toBe(200);
      expect(response.body.data.registrations).toBeDefined();
    });

    it('should return 422 for a malformed event id', async () => {
      const response = await request(app)
        .get('/api/v1/events/not-a-uuid/dashboard')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(response.status).toBe(422);
    });
  });
});
