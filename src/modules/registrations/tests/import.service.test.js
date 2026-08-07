import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseImportFile,
  validateRow,
  registerPublic,
  processImportFile,
  generateImportTemplate,
  getImportBatchById,
  listImportBatchesByEvent,
} from '../import.service.js';
import prisma from '../../../database/index.js';
import { BadRequestError, ConflictError, NotFoundError, ForbiddenError } from '../../../utils/error.js';
import * as notificationService from '../../../modules/notifications/notification.service.js';
import { parseFile } from '../../../utils/parsers/index.js';

vi.mock('../../../database/index.js', () => {
  const mockPrisma = {
    $transaction: vi.fn((cb) => cb(mockPrisma)),
    event: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    importBatch: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    ticketCode: {
      create: vi.fn(),
    },
    ticketType: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    registration: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    qrToken: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
  return { default: mockPrisma };
});

vi.mock('../../../utils/parsers/index.js', () => ({
  parseFile: vi.fn(),
}));

vi.mock('../../../modules/notifications/notification.service.js', () => ({
  sendNotification: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Import & Registration Service Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseImportFile (Empty File & Format Handling)', () => {
    it('should throw BadRequestError (400) when file content is null or undefined', () => {
      expect(() => parseImportFile(null)).toThrow(BadRequestError);
      expect(() => parseImportFile(undefined)).toThrow('Import file is empty. No rows found.');
    });

    it('should throw BadRequestError (400) when CSV is empty string or only whitespace', () => {
      expect(() => parseImportFile('')).toThrow(BadRequestError);
      expect(() => parseImportFile('   \n  \r\n ')).toThrow('Import file is empty. No rows found.');
    });

    it('should throw BadRequestError (400) when CSV contains only a header line with no data rows', () => {
      expect(() => parseImportFile('name,email,phone')).toThrow('Import file is empty. No rows found.');
    });

    it('should throw BadRequestError (400) when passed an empty array', () => {
      expect(() => parseImportFile([])).toThrow('Import file is empty. No rows found.');
    });

    it('should parse valid CSV string into array of row objects', () => {
      const csv = `name,email,phone\nAda Lovelace,ada@example.com,123456\n"Charles Babbage",charles@example.com,654321`;
      const rows = parseImportFile(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '123456',
      });
      expect(rows[1]).toEqual({
        name: 'Charles Babbage',
        email: 'charles@example.com',
        phone: '654321',
      });
    });

    it('should accept Buffer input and parse correctly', () => {
      const buffer = Buffer.from('name,email\nTest User,test@example.com', 'utf8');
      const rows = parseImportFile(buffer);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Test User');
      expect(rows[0].email).toBe('test@example.com');
    });
  });

  describe('validateRow (Row-Level Malformed & Duplicate Tracking)', () => {
    it('should mark a well-formed row as valid', () => {
      const seen = new Set();
      const res = validateRow({ name: 'Valid User', email: 'valid@example.com' }, 1, seen);
      expect(res.valid).toBe(true);
      expect(res.email).toBe('valid@example.com');
      expect(seen.has('valid@example.com')).toBe(true);
    });

    it('should fail row when email is missing', () => {
      const seen = new Set();
      const res = validateRow({ name: 'No Email' }, 2, seen);
      expect(res.valid).toBe(false);
      expect(res.row).toBe(2);
      expect(res.error).toBe('Missing or invalid email address');
    });

    it('should fail row when email is malformed', () => {
      const seen = new Set();
      const res = validateRow({ name: 'Bad Email', email: 'not-an-email' }, 3, seen);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Malformed email address');
    });

    it('should fail row when email exceeds 254 characters', () => {
      const seen = new Set();
      const longEmail = 'a'.repeat(245) + '@example.com';
      const res = validateRow({ name: 'Long Email User', email: longEmail }, 4, seen);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Email address exceeds maximum length of 254 characters');
    });

    it('should fail row when attendee name is missing or whitespace', () => {
      const seen = new Set();
      const res = validateRow({ email: 'noname@example.com', name: '   ' }, 5, seen);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Attendee name is required');
    });

    it('should flag duplicate emails in the same batch', () => {
      const seen = new Set();
      const first = validateRow({ name: 'User 1', email: 'duplicate@example.com' }, 1, seen);
      expect(first.valid).toBe(true);

      const second = validateRow({ name: 'User 2', email: 'DUPLICATE@example.com' }, 2, seen);
      expect(second.valid).toBe(false);
      expect(second.row).toBe(2);
      expect(second.error).toBe('Duplicate email in batch');
    });

    it('should read ticket type from the lowercased template TicketType column', () => {
      const seen = new Set();
      const res = validateRow({ name: 'Template User', email: 'template@example.com', tickettype: 'VIP' }, 1, seen);
      expect(res.valid).toBe(true);
      expect(res.ticketTypeId).toBe('VIP');
    });

    it('should read ticket type from a lowercased TicketTypeId column', () => {
      const seen = new Set();
      const res = validateRow({ name: 'Template User', email: 'template@example.com', tickettypeid: 'tt-1' }, 1, seen);
      expect(res.valid).toBe(true);
      expect(res.ticketTypeId).toBe('tt-1');
    });

    it('should map the download template header through parseImportFile and validateRow', () => {
      const rows = parseImportFile('Name,Email,Phone,TicketType\nJohn Doe,john@example.com,08012345678,VIP');
      expect(rows[0]).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        phone: '08012345678',
        tickettype: 'VIP',
      });

      const seen = new Set();
      const res = validateRow(rows[0], 2, seen);
      expect(res.valid).toBe(true);
      expect(res.ticketTypeId).toBe('VIP');
    });
  });

  describe('processImportFile (Full Import Pipeline)', () => {
    const eventId = 'event-uuid-1';
    const uploadedById = 'admin-uuid-1';
    const defaultEvent = { id: eventId, title: 'Tech Conf', endTime: new Date('2026-12-31'), ownerId: uploadedById, deletedAt: null };
    const fileBuffer = Buffer.from('name,email\nAlice,alice@example.com\nBob,bob@example.com', 'utf8');
    const filename = 'attendees.csv';

    beforeEach(() => {
      prisma.event.findUnique.mockResolvedValue(defaultEvent);
      prisma.importBatch.create.mockResolvedValue({ id: 'batch-1', eventId });
      prisma.importBatch.update.mockImplementation(async ({ data }) => ({ id: 'batch-1', ...data }));
      prisma.registration.findMany.mockResolvedValue([]);
      prisma.registration.create.mockImplementation(async ({ data }) => ({ id: 'reg-new', ...data }));
      prisma.ticketCode.create.mockResolvedValue({ id: 'tc-1' });
      prisma.qrToken.create.mockResolvedValue({ id: 'qt-1' });
      prisma.ticketType.findMany.mockResolvedValue([]);
      prisma.ticketType.update.mockResolvedValue({});
      prisma.ticketType.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ email: 'organizer@example.com' });
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      parseFile.mockResolvedValue({
        rows: [
          { sourceRow: 2, name: 'Alice', email: 'alice@example.com' },
          { sourceRow: 3, name: 'Bob', email: 'bob@example.com' },
        ],
        errors: [],
      });
    });

    it('should throw ForbiddenError when user does not own the event', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...defaultEvent, ownerId: 'other-user' });
      await expect(
        processImportFile({ eventId, uploadedById, fileBuffer, filename })
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError when event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(
        processImportFile({ eventId, uploadedById, fileBuffer, filename })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when event is soft-deleted', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...defaultEvent, deletedAt: new Date() });
      await expect(
        processImportFile({ eventId, uploadedById, fileBuffer, filename })
      ).rejects.toThrow(NotFoundError);
    });

    it('should store parse errors in batch errorReport', async () => {
      parseFile.mockResolvedValue({
        rows: [],
        errors: [{ row: 1, error: 'Invalid format at row 1' }],
      });
      prisma.importBatch.update.mockImplementation(async ({ data }) => ({ id: 'batch-1', ...data }));
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(prisma.importBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorReport: [{ row: 1, error: 'Invalid format at row 1' }],
          }),
        })
      );
      expect(result.status).toBe('FAILED');
    });

    it('should reject rows with validation errors and report them', async () => {
      parseFile.mockResolvedValue({
        rows: [
          { sourceRow: 2, name: 'Alice', email: 'alice@example.com' },
          { sourceRow: 3, name: '', email: 'bob@example.com' },
        ],
        errors: [],
      });
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(1);
      expect(result.failedRows).toBe(1);
      expect(result.errorReport).toHaveLength(1);
      expect(result.errorReport[0].error).toBe('Attendee name is required');
    });

    it('should reject rows whose email already exists in the event', async () => {
      prisma.registration.findMany.mockResolvedValue([{ attendeeEmail: 'alice@example.com' }]);
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(1);
      expect(result.failedRows).toBe(1);
      expect(result.errorReport[0].error).toBe('Attendee is already registered for this event');
    });

    it('should reject rows with invalid ticket type', async () => {
      parseFile.mockResolvedValue({
        rows: [
          { sourceRow: 2, name: 'Alice', email: 'alice@example.com', ticketTypeId: 'tt-invalid' },
        ],
        errors: [],
      });
      prisma.ticketType.findMany.mockResolvedValue([{ id: 'tt-valid', capacity: null, quantitySold: 0 }]);
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(0);
      expect(result.failedRows).toBe(1);
      expect(result.errorReport[0].error).toBe('Invalid or inactive ticket type');
    });

    it('should resolve ticket type names to IDs within the event', async () => {
      parseFile.mockResolvedValue({
        rows: [
          { sourceRow: 2, name: 'Alice', email: 'alice@example.com', ticketType: 'vip' },
          { sourceRow: 3, name: 'Bob', email: 'bob@example.com', ticketType: 'VIP' },
        ],
        errors: [],
      });
      prisma.ticketType.findMany.mockResolvedValue([
        { id: 'tt-vip', name: 'VIP', capacity: 10, quantitySold: 1 },
        { id: 'tt-ga', name: 'General', capacity: null, quantitySold: 0 },
      ]);
      prisma.ticketType.findUnique.mockResolvedValue({ id: 'tt-vip', capacity: 10, quantitySold: 1 });
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(2);
      expect(result.failedRows).toBe(0);
      expect(prisma.registration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ticketTypeId: 'tt-vip' }),
        })
      );
      expect(prisma.ticketType.findMany).toHaveBeenCalledWith({
        where: { eventId, active: true },
        select: { id: true, name: true, capacity: true, quantitySold: true },
      });
    });

    it('should reject rows when ticket type has reached capacity', async () => {
      parseFile.mockResolvedValue({
        rows: [
          { sourceRow: 2, name: 'Alice', email: 'alice@example.com', ticketTypeId: 'tt-full' },
        ],
        errors: [],
      });
      prisma.ticketType.findMany.mockResolvedValue([{ id: 'tt-full', capacity: 10, quantitySold: 10 }]);
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(0);
      expect(result.failedRows).toBe(1);
      expect(result.errorReport[0].error).toBe('Ticket type has reached capacity');
    });

    it('should create ticketCode, registration, and qrToken for each valid row', async () => {
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(2);
      expect(result.failedRows).toBe(0);
      expect(result.status).toBe('COMPLETED');
      expect(prisma.ticketCode.create).toHaveBeenCalledTimes(2);
      expect(prisma.registration.create).toHaveBeenCalledTimes(2);
      expect(prisma.qrToken.create).toHaveBeenCalledTimes(2);
    });

    it('should process rows in batches of 50', async () => {
      const manyRows = Array.from({ length: 120 }, (_, i) => ({
        sourceRow: i + 2,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
      }));
      parseFile.mockResolvedValue({ rows: manyRows, errors: [] });
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(120);
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction failures and continue with remaining batches', async () => {
      prisma.$transaction
        .mockRejectedValueOnce(new Error('DB timeout'))
        .mockImplementationOnce(async (cb) => cb(prisma));
      const manyRows = Array.from({ length: 60 }, (_, i) => ({
        sourceRow: i + 2,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
      }));
      parseFile.mockResolvedValue({ rows: manyRows, errors: [] });
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(10);
      expect(result.failedRows).toBe(50);
      expect(result.errorReport.filter((e) => e.error === 'Database error during batch processing')).toHaveLength(50);
    });

    it('should retry ticket code creation on P2002 collision without failing the batch', async () => {
      prisma.ticketCode.create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValue({ id: 'tc-1' });
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.successRows).toBe(2);
      expect(result.failedRows).toBe(0);
      expect(prisma.ticketCode.create).toHaveBeenCalledTimes(3);
    });

    it('should skip sending notification when sendEmails is false', async () => {
      await processImportFile({ eventId, uploadedById, fileBuffer, filename, sendEmails: false });
      expect(notificationService.sendNotification).not.toHaveBeenCalled();
    });

    it('should send notification with import summary when sendEmails is true', async () => {
      await processImportFile({ eventId, uploadedById, fileBuffer, filename, sendEmails: true });
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'organizer@example.com',
          subject: expect.stringContaining('Import Complete'),
          template: 'import-summary',
          eventId,
          context: expect.objectContaining({ successRows: 2, failedRows: 0 }),
        })
      );
    });

    it('should send each attendee a qr-issued email with qrData when sendEmails is true', async () => {
      await processImportFile({ eventId, uploadedById, fileBuffer, filename, sendEmails: true });
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'qr-issued',
          eventId,
          context: expect.objectContaining({
            qrData: expect.any(String),
            qrCodeUrl: expect.stringMatching(/^data:image\/png;base64,/),
          }),
        })
      );
      expect(
        notificationService.sendNotification.mock.calls.filter(([call]) => call.template === 'qr-issued')
      ).toHaveLength(2);
    });
    it('should not fail when notification fails (fire-and-forget)', async () => {
      notificationService.sendNotification.mockRejectedValueOnce(new Error('Email not sent'));
      await expect(
        processImportFile({ eventId, uploadedById, fileBuffer, filename })
      ).resolves.toBeDefined();
    });

    it('should create an audit log entry on completion', async () => {
      await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: uploadedById,
          action: 'IMPORT',
          entity: 'ImportBatch',
        }),
      });
    });

    it('should not throw when audit log creation fails', async () => {
      prisma.auditLog.create.mockRejectedValueOnce(new Error('DB error'));
      await expect(
        processImportFile({ eventId, uploadedById, fileBuffer, filename })
      ).resolves.toBeDefined();
    });

    it('should compute final status as FAILED when zero rows succeed', async () => {
      parseFile.mockResolvedValue({
        rows: [{ sourceRow: 2, name: '', email: '' }],
        errors: [],
      });
      const result = await processImportFile({ eventId, uploadedById, fileBuffer, filename });
      expect(result.status).toBe('FAILED');
      expect(result.successRows).toBe(0);
    });
  });

  describe('registerPublic (Public Registration Edge Cases)', () => {
    const eventId = 'event-uuid-1';

    it('should throw BadRequestError (400) when name is empty or whitespace', async () => {
      await expect(
        registerPublic({
          eventId,
          name: '   ',
          email: 'test@example.com',
        })
      ).rejects.toThrow(BadRequestError);
      await expect(
        registerPublic({
          eventId,
          name: '',
          email: 'test@example.com',
        })
      ).rejects.toThrow('Attendee name is required');
    });

    it('should throw BadRequestError (400) when email exceeds 254 characters', async () => {
      const longEmail = 'x'.repeat(245) + '@example.com';
      await expect(
        registerPublic({
          eventId,
          name: 'Valid Name',
          email: longEmail,
        })
      ).rejects.toThrow('Email address exceeds maximum length of 254 characters');
    });

    it('should throw BadRequestError (400) when email is malformed', async () => {
      await expect(
        registerPublic({
          eventId,
          name: 'Valid Name',
          email: 'not-an-email',
        })
      ).rejects.toThrow('Malformed or invalid email address');
    });

    it('should throw ConflictError (409) when attendee is already registered for event', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: eventId, title: 'Tech Conf', status: 'PUBLISHED' });
      prisma.ticketCode.create.mockResolvedValue({ id: 'ticket-code-existing' });
      prisma.registration.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        registerPublic({
          eventId,
          name: 'Existing User',
          email: 'existing@example.com',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should create registration with PUBLIC_LINK source for valid inputs', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: eventId, title: 'Tech Conf', status: 'PUBLISHED' });
      prisma.registration.findFirst.mockResolvedValue(null);
      prisma.ticketCode.create.mockResolvedValue({ id: 'ticket-code-pub' });
      prisma.registration.create.mockImplementation(async ({ data }) => ({
        id: 'new-reg-1',
        ...data,
      }));

      const reg = await registerPublic({
        eventId,
        name: '  Grace Hopper  ',
        email: '  grace@example.com  ',
      });

      expect(reg.source).toBe('PUBLIC_LINK');
      expect(reg.attendeeName).toBe('Grace Hopper');
      expect(reg.attendeeEmail).toBe('grace@example.com');
      expect(prisma.registration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId,
          attendeeEmail: 'grace@example.com',
          attendeeName: 'Grace Hopper',
          source: 'PUBLIC_LINK',
          status: 'CONFIRMED',
        }),
      });
      expect(notificationService.sendNotification).toHaveBeenCalled();
    });

    it('should throw NotFoundError when the event does not exist', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        registerPublic({ eventId, name: 'Valid Name', email: 'valid@example.com' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError when the event is not PUBLISHED', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: eventId, title: 'Tech Conf', status: 'DRAFT' });

      await expect(
        registerPublic({ eventId, name: 'Valid Name', email: 'valid@example.com' })
      ).rejects.toThrow('Event is not open for registration');
    });

    it('should throw BadRequestError for an invalid ticket type', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: eventId, title: 'Tech Conf', status: 'PUBLISHED' });
      prisma.ticketType.findFirst.mockResolvedValue(null);

      await expect(
        registerPublic({ eventId, name: 'Valid Name', email: 'valid@example.com', ticketTypeId: 'tt-bad' })
      ).rejects.toThrow('Invalid or inactive ticket type');
    });

    it('should throw BadRequestError when the ticket type has reached capacity', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: eventId, title: 'Tech Conf', status: 'PUBLISHED' });
      prisma.ticketType.findFirst.mockResolvedValue({ id: 'tt-1', capacity: 1, quantitySold: 1 });

      await expect(
        registerPublic({ eventId, name: 'Valid Name', email: 'valid@example.com', ticketTypeId: 'tt-1' })
      ).rejects.toThrow('Ticket type has reached capacity');
    });

    it('should rethrow non-P2002 transaction errors', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: eventId, title: 'Tech Conf', status: 'PUBLISHED' });
      prisma.ticketCode.create.mockRejectedValue(new Error('DB timeout'));

      await expect(
        registerPublic({ eventId, name: 'Valid Name', email: 'valid@example.com' })
      ).rejects.toThrow('DB timeout');
    });
  });

  describe('getImportBatchById', () => {
    it('should return the batch when found', async () => {
      const batch = { id: 'batch-1', eventId: 'event-1', status: 'COMPLETED' };
      prisma.importBatch.findUnique.mockResolvedValue(batch);

      const result = await getImportBatchById('batch-1');
      expect(result).toEqual(batch);
      expect(prisma.importBatch.findUnique).toHaveBeenCalledWith({ where: { id: 'batch-1' } });
    });

    it('should throw NotFoundError when the batch does not exist', async () => {
      prisma.importBatch.findUnique.mockResolvedValue(null);

      await expect(getImportBatchById('missing')).rejects.toThrow('Import batch not found');
    });
  });

  describe('listImportBatchesByEvent', () => {
    it('should list batches for an event ordered by createdAt desc', async () => {
      prisma.importBatch.findMany.mockResolvedValue([{ id: 'batch-1' }]);

      const result = await listImportBatchesByEvent('event-1');
      expect(result).toEqual([{ id: 'batch-1' }]);
      expect(prisma.importBatch.findMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('generateImportTemplate', () => {
    it('should return a CSV template string by default', async () => {
      const csv = await generateImportTemplate();
      expect(typeof csv).toBe('string');
      expect(csv).toContain('"Name","Email","Phone","TicketType"');
    });

    it('should return a CSV template string when format is csv', async () => {
      const csv = await generateImportTemplate('csv');
      expect(csv).toContain('"Name","Email","Phone","TicketType"');
    });

    it('should return a valid PDF buffer when format is pdf', async () => {
      const pdf = await generateImportTemplate('pdf');
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });
});
