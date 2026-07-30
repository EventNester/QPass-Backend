import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createTicketType,
  getTicketTypes,
  updateTicketType,
  deleteTicketType
} from '../tickets.service.js';
import prisma from '../../../database/index.js';
import { NotFoundError, UnauthorizedError, ConflictError } from '../../../utils/error.js';
import { systemMessages } from '../../../config/index.js';

vi.mock('../../../database/index.js', () => ({
  default: {
    event: {
      findUnique: vi.fn(),
    },
    ticketType: {
      create: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
  }
}));

describe('Tickets Service Tests', () => {
  const msg = systemMessages.ERROR;

  const mockUser = {
    id: 'user_1',
    name: 'Event Owner',
    email: 'owner@example.com',
  };

  const mockEvent = {
    id: 'event_1',
    ownerId: 'user_1',
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkEventOwnership (internal helper)', () => {
    test('should throw NotFoundError if event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(createTicketType('event_x', mockUser.id, {}))
        .rejects.toThrow(NotFoundError);
    });

    test('should throw NotFoundError if event is soft-deleted', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...mockEvent, deletedAt: new Date() });
      await expect(createTicketType(mockEvent.id, mockUser.id, {}))
        .rejects.toThrow(NotFoundError);
    });

    test('should throw UnauthorizedError if user is not the owner', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      await expect(createTicketType(mockEvent.id, 'not_the_owner', {}))
        .rejects.toThrow(UnauthorizedError);
    });
  });

  describe('createTicketType', () => {
    test('should create ticket type and assign next sortOrder', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.ticketType.aggregate.mockResolvedValue({ _max: { sortOrder: 3 } });
      const newTicketType = { id: 'tt_1', eventId: mockEvent.id, name: 'VIP', price: 1000, capacity: 50, sortOrder: 4 };
      prisma.ticketType.create.mockResolvedValue(newTicketType);

      const result = await createTicketType(mockEvent.id, mockUser.id, { name: 'VIP', price: 1000, capacity: 50 });
      
      expect(prisma.ticketType.aggregate).toHaveBeenCalledWith({
        where: { eventId: mockEvent.id },
        _max: { sortOrder: true },
      });
      expect(prisma.ticketType.create).toHaveBeenCalledWith({
        data: {
          eventId: mockEvent.id,
          name: 'VIP',
          price: 1000,
          capacity: 50,
          sortOrder: 4,
        }
      });
      expect(result).toEqual(newTicketType);
    });
  });

  describe('getTicketTypes', () => {
    test('should retrieve ticket types ordered by sortOrder', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      const mockTickets = [{ id: 'tt_1', sortOrder: 0 }, { id: 'tt_2', sortOrder: 1 }];
      prisma.ticketType.findMany.mockResolvedValue(mockTickets);

      const result = await getTicketTypes(mockEvent.id, mockUser.id);
      
      expect(prisma.ticketType.findMany).toHaveBeenCalledWith({
        where: { eventId: mockEvent.id },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual(mockTickets);
    });
  });

  describe('updateTicketType', () => {
    test('should update ticket type if it exists and belongs to event', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.ticketType.findFirst.mockResolvedValue({ id: 'tt_1', eventId: mockEvent.id });
      const updatedTicket = { id: 'tt_1', name: 'Updated VIP' };
      prisma.ticketType.update.mockResolvedValue(updatedTicket);

      const result = await updateTicketType(mockEvent.id, 'tt_1', mockUser.id, { name: 'Updated VIP' });

      expect(prisma.ticketType.update).toHaveBeenCalledWith({
        where: { id: 'tt_1' },
        data: { name: 'Updated VIP' },
      });
      expect(result).toEqual(updatedTicket);
    });

    test('should throw NotFoundError if ticket type does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.ticketType.findFirst.mockResolvedValue(null);

      await expect(updateTicketType(mockEvent.id, 'tt_unknown', mockUser.id, { name: 'Updated VIP' }))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteTicketType', () => {
    test('should delete ticket type if it has no registrations', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.ticketType.findFirst.mockResolvedValue({
        id: 'tt_1',
        eventId: mockEvent.id,
        _count: { registrations: 0 }
      });

      const result = await deleteTicketType(mockEvent.id, 'tt_1', mockUser.id);

      expect(prisma.ticketType.delete).toHaveBeenCalledWith({
        where: { id: 'tt_1' },
      });
      expect(result).toBe(true);
    });

    test('should throw ConflictError if ticket type has registrations', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.ticketType.findFirst.mockResolvedValue({
        id: 'tt_1',
        eventId: mockEvent.id,
        _count: { registrations: 5 } // Guard triggers here
      });

      await expect(deleteTicketType(mockEvent.id, 'tt_1', mockUser.id))
        .rejects.toThrow(ConflictError);
    });

    test('should throw NotFoundError if ticket type does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.ticketType.findFirst.mockResolvedValue(null);

      await expect(deleteTicketType(mockEvent.id, 'tt_unknown', mockUser.id))
        .rejects.toThrow(NotFoundError);
    });
  });
});
