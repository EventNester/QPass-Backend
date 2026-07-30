import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createTicketTypeController,
  getTicketTypesController,
  updateTicketTypeController,
  deleteTicketTypeController
} from '../tickets.controller.js';
import * as ticketsService from '../tickets.service.js';
import * as responseUtils from '../../../utils/response.js';

vi.mock('../tickets.service.js', () => ({
  createTicketType: vi.fn(),
  getTicketTypes: vi.fn(),
  updateTicketType: vi.fn(),
  deleteTicketType: vi.fn(),
}));

vi.mock('../../../utils/response.js', () => ({
  success: vi.fn(),
  created: vi.fn(),
}));

describe('Tickets Controller Tests', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      params: { eventId: 'event_1', id: 'tt_1' },
      user: { sub: 'user_1' },
      body: { name: 'VIP', price: 1000, capacity: 50 }
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  describe('createTicketTypeController', () => {
    test('should call createTicketType service and return created response', async () => {
      const mockTicket = { id: 'tt_1', name: 'VIP' };
      ticketsService.createTicketType.mockResolvedValue(mockTicket);

      await createTicketTypeController(req, res, next);

      expect(ticketsService.createTicketType).toHaveBeenCalledWith('event_1', 'user_1', req.body);
      expect(responseUtils.created).toHaveBeenCalledWith(res, mockTicket, "Ticket type created successfully");
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next(error) on service throw', async () => {
      const error = new Error('Service Error');
      ticketsService.createTicketType.mockRejectedValue(error);

      await createTicketTypeController(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(responseUtils.created).not.toHaveBeenCalled();
    });
  });

  describe('getTicketTypesController', () => {
    test('should call getTicketTypes service and return success response', async () => {
      const mockTickets = [{ id: 'tt_1', name: 'VIP' }];
      ticketsService.getTicketTypes.mockResolvedValue(mockTickets);

      await getTicketTypesController(req, res, next);

      expect(ticketsService.getTicketTypes).toHaveBeenCalledWith('event_1', 'user_1');
      expect(responseUtils.success).toHaveBeenCalledWith(res, mockTickets);
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next(error) on service throw', async () => {
      const error = new Error('Service Error');
      ticketsService.getTicketTypes.mockRejectedValue(error);

      await getTicketTypesController(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(responseUtils.success).not.toHaveBeenCalled();
    });
  });

  describe('updateTicketTypeController', () => {
    test('should call updateTicketType service and return success response', async () => {
      const mockTicket = { id: 'tt_1', name: 'VIP' };
      ticketsService.updateTicketType.mockResolvedValue(mockTicket);

      await updateTicketTypeController(req, res, next);

      expect(ticketsService.updateTicketType).toHaveBeenCalledWith('event_1', 'tt_1', 'user_1', req.body);
      expect(responseUtils.success).toHaveBeenCalledWith(res, mockTicket, "Ticket type updated successfully");
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next(error) on service throw', async () => {
      const error = new Error('Service Error');
      ticketsService.updateTicketType.mockRejectedValue(error);

      await updateTicketTypeController(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(responseUtils.success).not.toHaveBeenCalled();
    });
  });

  describe('deleteTicketTypeController', () => {
    test('should call deleteTicketType service and return success response', async () => {
      ticketsService.deleteTicketType.mockResolvedValue(true);

      await deleteTicketTypeController(req, res, next);

      expect(ticketsService.deleteTicketType).toHaveBeenCalledWith('event_1', 'tt_1', 'user_1');
      expect(responseUtils.success).toHaveBeenCalledWith(res, null, "Ticket type deleted successfully");
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next(error) on service throw', async () => {
      const error = new Error('Service Error');
      ticketsService.deleteTicketType.mockRejectedValue(error);

      await deleteTicketTypeController(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(responseUtils.success).not.toHaveBeenCalled();
    });
  });
});
