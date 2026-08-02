import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { hashToken } from '../../utils/crypto.js';
import { cleanDatabase } from '../helpers/cleanup.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

async function waitFor(fn, timeout = 4000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return null;
}

describe('Public Registration API Integration Tests', () => {
  let organizerToken;
  let eventId;
  let eventSlug;
  let freeTicketTypeId;
  let paidTicketTypeId;
  const futureDate = new Date(Date.now() + 86400000);
  const laterDate = new Date(Date.now() + 172800000);

  async function createPublishedEvent(title) {
    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title,
        description: 'For public registration testing',
        venue: 'Test Venue',
        startTime: futureDate.toISOString(),
        endTime: laterDate.toISOString(),
      });

    const id = res.body.data.id;
    const pubRes = await request(app)
      .post(`/api/v1/events/${id}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`);

    return { id, slug: pubRes.body.data.slug };
  }

  async function createTicketType(targetEventId, { name, price, capacity }) {
    const res = await request(app)
      .post(`/api/v1/events/${targetEventId}/ticket-types`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ name, price, capacity });
    return res.body.data.id;
  }

  beforeAll(async () => {
    await cleanDatabase();

    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Public Org',
        email: 'public-org@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });

    organizerToken = regRes.body.data.accessToken;

    const eventRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Public Registration Event',
        description: 'A free event for the public',
        venue: 'Lagos Convention Center',
        startTime: futureDate.toISOString(),
        endTime: laterDate.toISOString(),
      });

    eventId = eventRes.body.data.id;
    eventSlug = eventRes.body.data.slug;

    freeTicketTypeId = await createTicketType(eventId, { name: 'Free Entry', price: 0, capacity: 50 });
    paidTicketTypeId = await createTicketType(eventId, { name: 'VIP', price: 5000 });

    await request(app)
      .post(`/api/v1/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/e/:slug', () => {
    it('should return 200 with event and ticket types without auth', async () => {
      const response = await request(app).get(`/api/v1/e/${eventSlug}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBe(eventId);
      expect(response.body.data.title).toBe('Public Registration Event');
      expect(response.body.data.slug).toBe(eventSlug);
      expect(response.body.data.status).toBe('PUBLISHED');
      expect(response.body.data.ticketTypes).toBeInstanceOf(Array);
      expect(response.body.data.ticketTypes.length).toBe(2);
      expect(response.body.data.ticketTypes.some((tt) => tt.id === freeTicketTypeId)).toBe(true);
      expect(response.body.data.ticketTypes.some((tt) => tt.id === paidTicketTypeId)).toBe(true);
    });

    it('should return 404 for unknown slug', async () => {
      const response = await request(app).get('/api/v1/e/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
    });

    it('should return 404 for a draft (not yet published) event', async () => {
      const draftRes = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Draft Public Event',
          startTime: futureDate.toISOString(),
          endTime: laterDate.toISOString(),
        });

      const response = await request(app).get(`/api/v1/e/${draftRes.body.data.slug}`);

      expect(response.status).toBe(404);
    });

    it('should only expose active ticket types', async () => {
      const inactiveRes = await request(app)
        .post(`/api/v1/events/${eventId}/ticket-types`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Hidden Ticket', price: 0 });

      await prisma.ticketType.update({
        where: { id: inactiveRes.body.data.id },
        data: { active: false },
      });

      const response = await request(app).get(`/api/v1/e/${eventSlug}`);

      expect(response.status).toBe(200);
      expect(response.body.data.ticketTypes.some((tt) => tt.id === inactiveRes.body.data.id)).toBe(false);
    });
  });

  describe('POST /api/v1/registrations/free', () => {
    it('should return 422 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });

    it('should return 400 for a draft event', async () => {
      const draftRes = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Draft Reg Event',
          startTime: futureDate.toISOString(),
          endTime: laterDate.toISOString(),
        });

      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({
          slug: draftRes.body.data.slug,
          name: 'Draft Attendee',
          email: 'draft-attendee@example.com',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBeDefined();
    });

    it('should return 400 when registration window is closed', async () => {
      const { slug } = await createPublishedEvent('Closed Window Event');
      await prisma.event.update({
        where: { slug },
        data: { registrationClosesAt: new Date(Date.now() - 60000) },
      });

      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({
          slug,
          name: 'Late Attendee',
          email: 'late-attendee@example.com',
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 for an invalid ticket type', async () => {
      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({
          slug: eventSlug,
          name: 'Bad Ticket Attendee',
          email: 'bad-ticket@example.com',
          ticketTypeId: randomUUID(),
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 for a paid ticket type on the free endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({
          slug: eventSlug,
          name: 'Paid Ticket Attendee',
          email: 'paid-ticket@example.com',
          ticketTypeId: paidTicketTypeId,
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should return 400 for a paid event when no ticket type is selected', async () => {
      const { id, slug } = await createPublishedEvent('Paid Event');
      await prisma.event.update({ where: { id }, data: { isPaid: true } });

      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({ slug, name: 'Paid Event Attendee', email: 'paid-event@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should create a CONFIRMED registration with QR without auth', async () => {
      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({
          slug: eventSlug,
          name: 'Jane Attendee',
          email: 'jane@example.com',
          phone: '+2348000000000',
          ticketTypeId: freeTicketTypeId,
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.registration.status).toBe('CONFIRMED');
      expect(response.body.data.registration.source).toBe('PUBLIC_LINK');
      expect(response.body.data.registration.attendeeEmail).toBe('jane@example.com');
      expect(response.body.data.registration.confirmationCode).toBeDefined();
      expect(response.body.data.registration.qrIssued).toBe(true);
      expect(response.body.data.qr.token).toBeDefined();
      expect(response.body.data.qr.image).toMatch(/^data:image\/png;base64,/);

      const registration = await prisma.registration.findUnique({
        where: { eventId_attendeeEmail: { eventId, attendeeEmail: 'jane@example.com' } },
        include: { qrToken: true, ticketType: true },
      });

      expect(registration).not.toBeNull();
      expect(registration.qrToken).not.toBeNull();
      expect(registration.qrToken.tokenHash).toBe(hashToken(response.body.data.qr.token));
      expect(registration.qrIssued).toBe(true);
      expect(registration.qrIssuedAt).not.toBeNull();
      expect(registration.ticketType.quantitySold).toBe(1);
    });

    it('should queue registration confirmation and QR emails', async () => {
      const notifications = await waitFor(async () => {
        const rows = await prisma.notification.findMany({
          where: { recipient: 'jane@example.com' },
        });
        return rows.length >= 2 ? rows : null;
      });

      expect(notifications).not.toBeNull();
      const templates = notifications.map((n) => n.template);
      expect(templates).toContain('registration');
      expect(templates).toContain('qr-issued');
    });

    it('should reject a duplicate email for the same event with 409', async () => {
      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({
          slug: eventSlug,
          name: 'Jane Again',
          email: 'JANE@example.com',
        });

      expect(response.status).toBe(409);
      expect(response.body.status).toBe('error');
    });

    it('should complete QR issuance on retry for a confirmed registration with qrIssued false', async () => {
      const { id, slug } = await createPublishedEvent('Retry Event');
      const ticketCode = await prisma.ticketCode.create({
        data: {
          eventId: id,
          code: 'RETRY-TICKET-1',
          status: 'USED',
          attendeeEmail: 'retry@example.com',
          attendeeName: 'Retry Attendee',
        },
      });
      await prisma.registration.create({
        data: {
          eventId: id,
          ticketCodeId: ticketCode.id,
          attendeeEmail: 'retry@example.com',
          attendeeName: 'Retry Attendee',
          source: 'PUBLIC_LINK',
          status: 'CONFIRMED',
          paymentStatus: 'SUCCESS',
          confirmationCode: 'QPC-RETRY1',
        },
      });

      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({ slug, name: 'Retry Attendee', email: 'retry@example.com' });

      expect(response.status).toBe(201);
      expect(response.body.data.registration.qrIssued).toBe(true);
      expect(response.body.data.qr.token).toBeDefined();

      const updated = await prisma.registration.findUnique({
        where: { eventId_attendeeEmail: { eventId: id, attendeeEmail: 'retry@example.com' } },
        include: { qrToken: true },
      });
      expect(updated.qrIssued).toBe(true);
      expect(updated.qrToken.tokenHash).toBe(hashToken(response.body.data.qr.token));
    });

    it('should reject registration when the event is at full capacity', async () => {
      const { id, slug } = await createPublishedEvent('Capacity Event');
      await prisma.event.update({ where: { id }, data: { capacity: 1 } });

      await request(app)
        .post('/api/v1/registrations/free')
        .send({ slug, name: 'First Attendee', email: 'first@example.com' });

      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({ slug, name: 'Second Attendee', email: 'second@example.com' });

      expect(response.status).toBe(400);
    });

    it('should reject registration when the ticket type is sold out', async () => {
      const { id, slug } = await createPublishedEvent('Sold Out Ticket Event');
      const limitedTicketTypeId = await createTicketType(id, { name: 'Limited', price: 0, capacity: 1 });

      await request(app)
        .post('/api/v1/registrations/free')
        .send({ slug, name: 'Shopper One', email: 'shopper1@example.com', ticketTypeId: limitedTicketTypeId });

      const response = await request(app)
        .post('/api/v1/registrations/free')
        .send({ slug, name: 'Shopper Two', email: 'shopper2@example.com', ticketTypeId: limitedTicketTypeId });

      expect(response.status).toBe(400);
    });

    it('should allow exactly one of two concurrent registrations when capacity is 1', async () => {
      const { id, slug } = await createPublishedEvent('Race Condition Event');
      await prisma.event.update({ where: { id }, data: { capacity: 1 } });

      const [first, second] = await Promise.all([
        request(app)
          .post('/api/v1/registrations/free')
          .send({ slug, name: 'Racer One', email: 'racer1@example.com' }),
        request(app)
          .post('/api/v1/registrations/free')
          .send({ slug, name: 'Racer Two', email: 'racer2@example.com' }),
      ]);

      const statuses = [first.status, second.status];
      expect(statuses.filter((s) => s >= 200 && s < 300)).toHaveLength(1);
      expect(statuses.filter((s) => s === 400)).toHaveLength(1);
    });
  });

  describe('public route isolation', () => {
    it('should not expose unintended endpoints from shared router mounts', async () => {
      const wrongGet = await request(app).get(`/api/v1/registrations/${eventSlug}`);
      const wrongPost = await request(app)
        .post('/api/v1/e/free')
        .send({ slug: eventSlug, name: 'Wrong Route', email: 'wrong@example.com' });

      expect(wrongGet.status).toBe(404);
      expect(wrongPost.status).toBe(404);
    });
  });
});
