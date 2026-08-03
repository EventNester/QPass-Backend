import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { cleanDatabase } from '../helpers/cleanup.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Audit Log Trail Integration Tests', () => {
  let organizerToken;
  let organizerId;
  let staffToken;
  let staffUserId;
  let eventId;
  let eventSlug;
  let ticketTypeId;
  let assignmentId;
  let registrationId;
  let checkinId;
  let rawToken;
  const futureDate = new Date(Date.now() + 86400000);
  const laterDate = new Date(Date.now() + 172800000);

  beforeAll(async () => {
    await cleanDatabase();

    const orgRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Audit Org',
        email: 'audit-org@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    organizerToken = orgRes.body.data.accessToken;
    organizerId = orgRes.body.data.user.id;

    const staffRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Audit Staff',
        email: 'audit-staff@example.com',
        password: 'SecurePassword123',
        role: 'STAFF',
      });
    staffToken = staffRes.body.data.accessToken;
    staffUserId = staffRes.body.data.user.id;

    const eventRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Audit Trail Event',
        description: 'For audit logging testing',
        venue: 'Audit Venue',
        startTime: futureDate.toISOString(),
        endTime: laterDate.toISOString(),
      });
    eventId = eventRes.body.data.id;

    const ticketRes = await request(app)
      .post(`/api/v1/events/${eventId}/ticket-types`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ name: 'Audit Free', price: 0 });
    ticketTypeId = ticketRes.body.data.id;

    const pubRes = await request(app)
      .post(`/api/v1/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`);
    eventSlug = pubRes.body.data.slug;

    const assignRes = await request(app)
      .post(`/api/v1/events/${eventId}/staff`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ email: 'audit-staff@example.com', permissionScope: 'SCANNER' });
    assignmentId = assignRes.body.data.id;

    const regRes = await request(app)
      .post('/api/v1/registrations/free')
      .send({
        slug: eventSlug,
        name: 'Audit Attendee',
        email: 'audit-attendee@example.com',
        ticketTypeId,
      });
    registrationId = regRes.body.data.registration.id;
    rawToken = regRes.body.data.qr.token;

    const scanRes = await request(app)
      .post(`/api/v1/checkins/${eventId}/scan`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ token: rawToken });
    checkinId = scanRes.body.data.checkinId;

    await request(app)
      .post(`/api/v1/checkins/${eventId}/checkins/${checkinId}/undo`)
      .set('Authorization', `Bearer ${organizerToken}`);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('audit log entries are written', () => {
    it('should record a STAFF_ASSIGN entry when staff is assigned', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { entity: 'EventStaffAssignment', entityId: assignmentId },
      });

      expect(entry).not.toBeNull();
      expect(entry.action).toBe('STAFF_ASSIGN');
      expect(entry.actorId).toBe(organizerId);
      expect(entry.afterSnapshot.eventId).toBe(eventId);
    });

    it('should record a PUBLIC_REGISTRATION entry when an attendee registers', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { entity: 'Registration', entityId: registrationId },
      });

      expect(entry).not.toBeNull();
      expect(entry.action).toBe('PUBLIC_REGISTRATION');
      expect(entry.afterSnapshot.attendeeEmail).toBe('audit-attendee@example.com');
      expect(entry.afterSnapshot.eventId).toBe(eventId);
    });

    it('should record a CHECKIN_VALID entry when a QR is scanned', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { entity: 'CheckIn', entityId: checkinId, action: 'CHECKIN_VALID' },
      });

      expect(entry).not.toBeNull();
      expect(entry.actorId).toBe(organizerId);
      expect(entry.afterSnapshot).toHaveProperty('tokenHash');
    });

    it('should record an UNDO_CHECKIN entry when a checkin is undone', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { entity: 'CheckIn', entityId: checkinId, action: 'UNDO_CHECKIN' },
      });

      expect(entry).not.toBeNull();
      expect(entry.actorId).toBe(organizerId);
      expect(entry.beforeSnapshot.registrationId).toBe(registrationId);
    });

    it('should attribute CHECKIN_VALID to the scanning staff member', async () => {
      const rescanRes = await request(app)
        .post(`/api/v1/checkins/${eventId}/scan`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ token: rawToken });

      expect(rescanRes.status).toBe(200);
      expect(rescanRes.body.data.result).toBe('VALID');

      const entry = await prisma.auditLog.findFirst({
        where: {
          entity: 'CheckIn',
          entityId: checkinId,
          action: 'CHECKIN_VALID',
          actorId: staffUserId,
        },
      });

      expect(entry).not.toBeNull();
    });
  });
});
