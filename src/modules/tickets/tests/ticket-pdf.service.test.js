import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pdfkit', () => {
  const mockDoc = {
    fontSize: vi.fn().mockReturnThis(),
    font: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    moveDown: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    strokeColor: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    image: vi.fn().mockReturnThis(),
    end: vi.fn(),
    pipe: vi.fn(),
    page: { width: 595 },
  };
  function PDFDocument() {
    return mockDoc;
  }
  return { default: PDFDocument };
});

vi.mock('qrcode', () => ({
  default: {
    toBuffer: vi.fn(),
  },
}));

vi.mock('../../../database/index.js', () => ({
  default: {
    registration: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { generateTicketPdf } from '../ticket-pdf.service.js';
import prisma from '../../../database/index.js';
import { qrService } from '../qr.service.js';
import { NotFoundError, ForbiddenError } from '../../../utils/error.js';

const OWNER_USER = 'owner-user-id';
const ATTENDEE_USER = 'attendee-user-id';
const ATTENDEE_EMAIL = 'test@example.com';
const STRANGER_USER = 'stranger-user-id';

function buildMockRegistration(overrides = {}) {
  return {
    id: 'reg-1',
    attendeeEmail: ATTENDEE_EMAIL,
    attendeeName: overrides.attendeeName ?? 'Ada Lovelace',
    phone: '+2348012345678',
    status: 'CONFIRMED',
    confirmationCode: 'CNF-ABC-123',
    qrIssued: true,
    qrIssuedAt: new Date(),
    createdAt: new Date(),
    event: {
      ownerId: OWNER_USER,
      deletedAt: null,
      title: 'Tech Summit 2026',
      startTime: new Date('2026-08-15T09:00:00Z'),
      endTime: new Date('2026-08-15T17:00:00Z'),
      venue: 'Eko Convention Centre, Lagos',
      slug: 'tech-summit-2026',
    },
    ticketCode: {
      code: 'TICKET-001',
    },
    ticketType: {
      name: 'VIP',
    },
    qrToken: {
      id: 'qr-1',
      tokenHash: 'abc123def456',
    },
    ...overrides,
  };
}

describe('generateTicketPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a PDFDocument stream for event owner', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration());
    vi.spyOn(qrService, 'createQrImage').mockResolvedValue(Buffer.from('mock-png'));

    const doc = await generateTicketPdf('reg-1', OWNER_USER);
    expect(doc).toBeDefined();
    expect(doc.end).toBeDefined();
    expect(doc.fontSize).toBeDefined();
  });

  it('should return a PDFDocument stream for registration attendee', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration());
    prisma.user.findUnique.mockResolvedValue({ id: ATTENDEE_USER, email: ATTENDEE_EMAIL });
    vi.spyOn(qrService, 'createQrImage').mockResolvedValue(Buffer.from('mock-png'));

    const doc = await generateTicketPdf('reg-1', ATTENDEE_USER);
    expect(doc).toBeDefined();
  });

  it('should throw NotFoundError when registration does not exist', async () => {
    prisma.registration.findUnique.mockResolvedValue(null);
    await expect(generateTicketPdf('nonexistent', OWNER_USER)).rejects.toThrow(NotFoundError);
  });

  it('should throw ForbiddenError for a stranger', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration());
    prisma.user.findUnique.mockResolvedValue({ id: STRANGER_USER, email: 'stranger@evil.com' });

    await expect(generateTicketPdf('reg-1', STRANGER_USER)).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError when user lookup fails', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration());
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(generateTicketPdf('reg-1', STRANGER_USER)).rejects.toThrow(ForbiddenError);
  });

  it('should handle long attendee names without error', async () => {
    const longName = 'Chief Dr. Sir Chukwudi Emmanuel Okafor-Mbah of Anambra State Kingdom';
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration({ attendeeName: longName }));
    vi.spyOn(qrService, 'createQrImage').mockResolvedValue(Buffer.from('mock-png'));

    const doc = await generateTicketPdf('reg-1', OWNER_USER);
    expect(doc).toBeDefined();
  });

  it('should handle special characters in attendee name', async () => {
    const specialName = 'José Martínez-González ñuñoa Pérez übel';
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration({ attendeeName: specialName }));
    vi.spyOn(qrService, 'createQrImage').mockResolvedValue(Buffer.from('mock-png'));

    const doc = await generateTicketPdf('reg-1', OWNER_USER);
    expect(doc).toBeDefined();
  });

  it('should handle missing qrToken gracefully (fallback text)', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration({ qrToken: null }));

    const doc = await generateTicketPdf('reg-1', OWNER_USER);
    expect(doc).toBeDefined();
  });

  it('should handle QR image generation failure gracefully (fallback text)', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration());
    vi.spyOn(qrService, 'createQrImage').mockRejectedValue(new Error('QR generation failed'));

    const doc = await generateTicketPdf('reg-1', OWNER_USER);
    expect(doc).toBeDefined();
  });

  it('should handle null phone number', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration({ phone: null }));
    vi.spyOn(qrService, 'createQrImage').mockResolvedValue(Buffer.from('mock-png'));

    const doc = await generateTicketPdf('reg-1', OWNER_USER);
    expect(doc).toBeDefined();
  });

  it('should handle null ticket type', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration({ ticketType: null }));
    vi.spyOn(qrService, 'createQrImage').mockResolvedValue(Buffer.from('mock-png'));

    const doc = await generateTicketPdf('reg-1', OWNER_USER);
    expect(doc).toBeDefined();
  });

  it('should handle null confirmation code', async () => {
    prisma.registration.findUnique.mockResolvedValue(buildMockRegistration({ confirmationCode: null }));
    vi.spyOn(qrService, 'createQrImage').mockResolvedValue(Buffer.from('mock-png'));

    const doc = await generateTicketPdf('reg-1', OWNER_USER);
    expect(doc).toBeDefined();
  });
});
