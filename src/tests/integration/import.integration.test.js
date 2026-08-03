import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import app from '../../app.js';
import prisma from '../../database/index.js';
import { cleanDatabase } from '../helpers/cleanup.js';

vi.mock('../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

describe('Attendee Import API Integration Tests', () => {
  let organizerToken;
  let otherOrganizerToken;
  let organizerId;
  let eventId;
  let ticketTypeId;
  const futureDate = new Date(Date.now() + 86400000);
  const laterDate = new Date(Date.now() + 172800000);

  beforeAll(async () => {
    await cleanDatabase();

    const orgRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Import Org',
        email: 'import-org@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    organizerToken = orgRes.body.data.accessToken;
    const orgUser = await prisma.user.findUnique({
      where: { email: 'import-org@example.com' },
      select: { id: true },
    });
    organizerId = orgUser.id;

    const otherRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Import Other Org',
        email: 'import-other@example.com',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    otherOrganizerToken = otherRes.body.data.accessToken;

    const eventRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Import Test Event',
        description: 'For attendee import testing',
        venue: 'Import Venue',
        startTime: futureDate.toISOString(),
        endTime: laterDate.toISOString(),
      });
    eventId = eventRes.body.data.id;

    const ticketRes = await request(app)
      .post(`/api/v1/events/${eventId}/ticket-types`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ name: 'Standard', price: 0 });
    ticketTypeId = ticketRes.body.data.id;
  });

  describe('POST /api/v1/events/:eventId/import', () => {
    it('should return 401 without auth', async () => {
      const csv = 'Name,Email,Phone,TicketType\nX,x@example.com,\n';
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/import`)
        .attach('file', Buffer.from(csv), { filename: 'attendees.csv', contentType: 'text/csv' });
      expect(response.status).toBe(401);
    });

    it('should return 403 for a non-owner organizer', async () => {
      const csv = 'Name,Email,Phone,TicketType\nX,x@example.com,\n';
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/import`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .attach('file', Buffer.from(csv), { filename: 'attendees.csv', contentType: 'text/csv' });
      expect(response.status).toBe(403);
    });

    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${eventId}/import`)
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(response.status).toBe(400);
    });

    it('should import a valid CSV and create registrations', async () => {
      const csv = [
        'Name,Email,Phone,TicketType',
        `Alice,import-alice@example.com,+2348012345678,${ticketTypeId}`,
        `Bob,import-bob@example.com,,${ticketTypeId}`,
        `Carol,import-carol@example.com,+2348098765432,`,
      ].join('\n');

      const response = await request(app)
        .post(`/api/v1/events/${eventId}/import`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .attach('file', Buffer.from(csv), { filename: 'attendees.csv', contentType: 'text/csv' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.batchId).toBeDefined();
      expect(response.body.data.totalRows).toBe(3);
      expect(response.body.data.successRows).toBe(3);
      expect(response.body.data.failedRows).toBe(0);

      const registrations = await prisma.registration.findMany({
        where: { eventId },
        select: {
          attendeeEmail: true,
          attendeeName: true,
          phone: true,
          source: true,
          status: true,
          ticketCodeId: true,
        },
        orderBy: { attendeeEmail: 'asc' },
      });

      const emails = registrations.map((r) => r.attendeeEmail);
      expect(emails).toEqual(expect.arrayContaining([
        'import-alice@example.com',
        'import-bob@example.com',
        'import-carol@example.com',
      ]));

      for (const reg of registrations) {
        expect(reg.status).toBe('CONFIRMED');
        expect(reg.source).toBe('IMPORT');
        expect(reg.ticketCodeId).toBeTruthy();
      }

      const alice = registrations.find((r) => r.attendeeEmail === 'import-alice@example.com');
      expect(alice.phone).toBe('+2348012345678');
      expect(alice.attendeeName).toBe('Alice');
    });

    it('should report per-row errors without importing invalid rows', async () => {
      const dupTicketCode = await prisma.ticketCode.create({
        data: {
          eventId,
          code: `SEED-${randomBytes(4).toString('hex').toUpperCase()}`,
          attendeeEmail: 'import-dup@example.com',
          attendeeName: 'Dup Attendee',
        },
      });
      await prisma.registration.create({
        data: {
          eventId,
          ticketCodeId: dupTicketCode.id,
          attendeeEmail: 'import-dup@example.com',
          attendeeName: 'Dup Attendee',
          ticketTypeId,
          source: 'IMPORT',
          status: 'CONFIRMED',
        },
      });

      const csv = [
        'Name,Email,Phone,TicketType',
        `Valid,import-valid@example.com,,${ticketTypeId}`,
        'Bad,not-an-email,',
        `Dup,import-dup@example.com,,`,
      ].join('\n');

      const response = await request(app)
        .post(`/api/v1/events/${eventId}/import`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .attach('file', Buffer.from(csv), { filename: 'attendees.csv', contentType: 'text/csv' });

      expect(response.status).toBe(200);
      expect(response.body.data.totalRows).toBe(3);
      expect(response.body.data.successRows).toBe(1);
      expect(response.body.data.failedRows).toBe(2);
      expect(response.body.data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: 'not-an-email' }),
          expect.objectContaining({ email: 'import-dup@example.com' }),
        ])
      );

      const validReg = await prisma.registration.findUnique({
        where: { eventId_attendeeEmail: { eventId, attendeeEmail: 'import-valid@example.com' } },
      });
      expect(validReg).not.toBeNull();
      expect(validReg.status).toBe('CONFIRMED');
    });

    it('should list import batches for the event', async () => {
      const seedBatch = (suffix) =>
        prisma.importBatch.create({
          data: {
            eventId,
            uploadedById: organizerId,
            originalFilename: `seed-${suffix}.csv`,
            fileType: 'text/csv',
            totalRows: 1,
            successRows: 1,
            failedRows: 0,
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
      await seedBatch(randomBytes(4).toString('hex'));
      await seedBatch(randomBytes(4).toString('hex'));

      const response = await request(app)
        .get(`/api/v1/events/${eventId}/import`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data[0]).toHaveProperty('id');
    });

    it('should generate a unique ticket code for each import', async () => {
      const csv = [
        'Name,Email,Phone,TicketType',
        `Code A,import-code-a@example.com,,${ticketTypeId}`,
        `Code B,import-code-b@example.com,,${ticketTypeId}`,
        `Code C,import-code-c@example.com,,${ticketTypeId}`,
      ].join('\n');

      const response = await request(app)
        .post(`/api/v1/events/${eventId}/import`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .attach('file', Buffer.from(csv), { filename: 'attendees.csv', contentType: 'text/csv' });

      expect(response.status).toBe(200);
      expect(response.body.data.successRows).toBe(3);
      expect(response.body.data.failedRows).toBe(0);

      const importedEmails = [
        'import-code-a@example.com',
        'import-code-b@example.com',
        'import-code-c@example.com',
      ];
      const codes = await prisma.ticketCode.findMany({
        where: { eventId, attendeeEmail: { in: importedEmails } },
        select: { code: true },
      });
      const unique = new Set(codes.map((c) => c.code));
      expect(codes).toHaveLength(3);
      expect(unique.size).toBe(3);
    });
  });
});
