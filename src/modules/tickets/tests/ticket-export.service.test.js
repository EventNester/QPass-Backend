import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../database/index.js', () => ({
  default: {
    event: {
      findUnique: vi.fn(),
    },
    registration: {
      findMany: vi.fn(),
    },
  },
}));

import { createRegistrationCsvStream } from '../ticket-export.service.js';
import prisma from '../../../database/index.js';
import { ForbiddenError, NotFoundError } from '../../../utils/error.js';

function buildRegistrationRow(overrides = {}) {
  const idx = overrides.idx ?? 1;
  return {
    id: `reg-${idx}`,
    attendeeEmail: overrides.email ?? `attendee${idx}@example.com`,
    attendeeName: overrides.name ?? `Attendee ${idx}`,
    phone: overrides.phone ?? `+2348012345${String(idx).padStart(4, '0')}`,
    status: overrides.status ?? 'CONFIRMED',
    confirmationCode: overrides.confirmationCode ?? `CNF-${idx}`,
    qrIssued: overrides.qrIssued ?? true,
    qrIssuedAt: overrides.qrIssuedAt ?? new Date(),
    createdAt: overrides.createdAt ?? new Date('2026-07-01T12:00:00Z'),
    ticketType: overrides.ticketType ?? { name: 'VIP' },
    checkins: overrides.checkins ?? [],
  };
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

describe('createRegistrationCsvStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw NotFoundError when event does not exist', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(createRegistrationCsvStream('event-1', 'user-1')).rejects.toThrow(NotFoundError);
  });

  it('should throw ForbiddenError when user is not the owner', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      ownerId: 'other-user',
      deletedAt: null,
    });
    await expect(createRegistrationCsvStream('event-1', 'user-1')).rejects.toThrow(ForbiddenError);
  });

  it('should return CSV with headers when there are no registrations', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      ownerId: 'user-1',
      deletedAt: null,
    });
    prisma.registration.findMany.mockResolvedValue([]);

    const stream = await createRegistrationCsvStream('event-1', 'user-1');
    const csv = await collectStream(stream);

    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe('Name,Email,Phone,Ticket Type,Status,Confirmation Code,QR Issued,Checked In,Registration Date');
  });

  it('should include all required columns in CSV output', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      ownerId: 'user-1',
      deletedAt: null,
    });
    prisma.registration.findMany.mockResolvedValue([buildRegistrationRow({ idx: 1 })]);

    const stream = await createRegistrationCsvStream('event-1', 'user-1');
    const csv = await collectStream(stream);

    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);

    const headers = lines[0].split(',');
    expect(headers).toContain('Name');
    expect(headers).toContain('Email');
    expect(headers).toContain('Phone');
    expect(headers).toContain('Ticket Type');
    expect(headers).toContain('Status');
    expect(headers).toContain('Confirmation Code');
    expect(headers).toContain('QR Issued');
    expect(headers).toContain('Checked In');
    expect(headers).toContain('Registration Date');
  });

  it('should properly format email addresses', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      ownerId: 'user-1',
      deletedAt: null,
    });
    prisma.registration.findMany.mockResolvedValue([
      buildRegistrationRow({ idx: 1, email: 'test.user+tag@example.com' }),
    ]);

    const stream = await createRegistrationCsvStream('event-1', 'user-1');
    const csv = await collectStream(stream);

    expect(csv).toContain('test.user+tag@example.com');
  });

  it('should handle large datasets with batched fetching', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      ownerId: 'user-1',
      deletedAt: null,
    });

    const batch1 = Array.from({ length: 500 }, (_, i) => buildRegistrationRow({ idx: i + 1 }));
    const batch2 = Array.from({ length: 500 }, (_, i) => buildRegistrationRow({ idx: i + 501 }));
    const batch3 = Array.from({ length: 100 }, (_, i) => buildRegistrationRow({ idx: i + 1001 }));

    prisma.registration.findMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce(batch3);

    const stream = await createRegistrationCsvStream('event-1', 'user-1');
    const csv = await collectStream(stream);

    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1101);
    expect(prisma.registration.findMany).toHaveBeenCalledTimes(3);
  });

  it('should mark checked-in attendees correctly', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      ownerId: 'user-1',
      deletedAt: null,
    });
    prisma.registration.findMany.mockResolvedValue([
      buildRegistrationRow({ idx: 1, checkins: [{ id: 'checkin-1' }] }),
      buildRegistrationRow({ idx: 2, checkins: [] }),
    ]);

    const stream = await createRegistrationCsvStream('event-1', 'user-1');
    const csv = await collectStream(stream);

    const lines = csv.trim().split('\n');
    expect(lines[1]).toContain('Yes');
    expect(lines[2]).toContain('No');
  });

  it('should escape fields containing commas', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      ownerId: 'user-1',
      deletedAt: null,
    });
    prisma.registration.findMany.mockResolvedValue([
      buildRegistrationRow({ idx: 1, name: 'Okafor, Chinedu' }),
    ]);

    const stream = await createRegistrationCsvStream('event-1', 'user-1');
    const csv = await collectStream(stream);

    expect(csv).toContain('"Okafor, Chinedu"');
  });

  it('should handle deleted event', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      ownerId: 'user-1',
      deletedAt: new Date(),
    });
    await expect(createRegistrationCsvStream('event-1', 'user-1')).rejects.toThrow(NotFoundError);
  });
});
