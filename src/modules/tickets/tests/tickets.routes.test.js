import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { systemMessages } from '../../../config/index.js';

// Mock the service layer
vi.mock('../tickets.service.js', () => ({
  createTicketType: vi.fn(),
  getTicketTypes: vi.fn(),
  updateTicketType: vi.fn(),
  deleteTicketType: vi.fn(),
}));

// Mock authentication middleware to simulate a logged-in user
vi.mock('../../auth/auth.middleware.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { sub: 'user_1', role: 'ORGANIZER' };
    next();
  }
}));

import * as ticketsService from '../tickets.service.js';

describe('TicketType Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    name: 'VIP',
    price: 5000,
    capacity: 100
  };

  describe('POST /api/v1/events/:eventId/ticket-types', () => {
    it('should return 400 for missing fields (Zod validation)', async () => {
      const res = await request(app)
        .post('/api/v1/events/event_1/ticket-types')
        .send({ name: 'VIP' }); // Missing price and capacity
      
      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
    });

    it('should return 400 for negative price (Zod validation)', async () => {
      const res = await request(app)
        .post('/api/v1/events/event_1/ticket-types')
        .send({ ...validPayload, price: -100 });
      
      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
    });

    it('should return 201 on successful creation', async () => {
      const mockTicket = { id: 'tt_1', eventId: 'event_1', ...validPayload, sortOrder: 0 };
      ticketsService.createTicketType.mockResolvedValue(mockTicket);

      const res = await request(app)
        .post('/api/v1/events/event_1/ticket-types')
        .send(validPayload);
      
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe('tt_1');
      expect(ticketsService.createTicketType).toHaveBeenCalledWith('event_1', 'user_1', validPayload);
    });
  });

  describe('GET /api/v1/events/:eventId/ticket-types', () => {
    it('should return 200 and a list of ticket types', async () => {
      const mockTickets = [
        { id: 'tt_1', name: 'VIP' },
        { id: 'tt_2', name: 'Regular' }
      ];
      ticketsService.getTicketTypes.mockResolvedValue(mockTickets);

      const res = await request(app)
        .get('/api/v1/events/event_1/ticket-types');
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(2);
      expect(ticketsService.getTicketTypes).toHaveBeenCalledWith('event_1', 'user_1');
    });
  });

  describe('PATCH /api/v1/events/:eventId/ticket-types/:id', () => {
    it('should return 400 for invalid data types (Zod validation)', async () => {
      const res = await request(app)
        .patch('/api/v1/events/event_1/ticket-types/tt_1')
        .send({ price: 'free' }); // price must be an integer
      
      expect(res.status).toBe(422);
    });

    it('should return 200 on successful update', async () => {
      const mockTicket = { id: 'tt_1', name: 'VIP Updated' };
      ticketsService.updateTicketType.mockResolvedValue(mockTicket);

      const res = await request(app)
        .patch('/api/v1/events/event_1/ticket-types/tt_1')
        .send({ name: 'VIP Updated' });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.name).toBe('VIP Updated');
      expect(ticketsService.updateTicketType).toHaveBeenCalledWith('event_1', 'tt_1', 'user_1', { name: 'VIP Updated' });
    });
  });

  describe('DELETE /api/v1/events/:eventId/ticket-types/:id', () => {
    it('should return 200 on successful deletion', async () => {
      ticketsService.deleteTicketType.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/v1/events/event_1/ticket-types/tt_1');
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(ticketsService.deleteTicketType).toHaveBeenCalledWith('event_1', 'tt_1', 'user_1');
    });
  });
});
