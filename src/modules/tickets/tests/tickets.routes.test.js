import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';

vi.mock('../../auth/auth.middleware.js', () => ({
  requireAuth: (req, res, next) => {
    if (req.headers?.authorization) {
      req.user = { sub: 'user_1' };
      return next();
    }
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  },
}));

vi.mock('../../../middlewares/rate-limit.middleware.js', () => ({
  globalLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
}));

vi.mock('../tickets.service.js', () => ({
  createTicketType: vi.fn(),
  getTicketTypes: vi.fn(),
  updateTicketType: vi.fn(),
  deleteTicketType: vi.fn(),
}));

import * as ticketService from '../tickets.service.js';

const mockTicketType = {
  id: 'tt_1',
  eventId: 'event_1',
  name: 'VIP',
  description: 'VIP access',
  price: 5000,
  capacity: 100,
  quantitySold: 0,
  active: true,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('TicketType Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/events/:eventId/ticket-types', () => {
    it('should return 422 for missing name', async () => {
      const res = await request(app)
        .post('/api/v1/events/event_1/ticket-types')
        .set('Authorization', 'Bearer token')
        .send({ price: 5000 });

      expect(res.status).toBe(422);
      expect(res.body.errors).toBeDefined();
    });

    it('should return 422 for negative price', async () => {
      const res = await request(app)
        .post('/api/v1/events/event_1/ticket-types')
        .set('Authorization', 'Bearer token')
        .send({ name: 'VIP', price: -1 });

      expect(res.status).toBe(422);
    });

    it('should return 422 for empty name', async () => {
      const res = await request(app)
        .post('/api/v1/events/event_1/ticket-types')
        .set('Authorization', 'Bearer token')
        .send({ name: '', price: 5000 });

      expect(res.status).toBe(422);
    });

    it('should return 201 on successful creation', async () => {
      ticketService.createTicketType.mockResolvedValue(mockTicketType);

      const res = await request(app)
        .post('/api/v1/events/event_1/ticket-types')
        .set('Authorization', 'Bearer token')
        .send({ name: 'VIP', price: 5000 });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe('tt_1');
    });
  });

  describe('GET /api/v1/events/:eventId/ticket-types', () => {
    it('should return 200 with ticket types', async () => {
      ticketService.getTicketTypes.mockResolvedValue([mockTicketType]);

      const res = await request(app)
        .get('/api/v1/events/event_1/ticket-types')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('VIP');
    });
  });

  describe('PATCH /api/v1/events/:eventId/ticket-types/:id', () => {
    it('should return 422 if no fields provided', async () => {
      const res = await request(app)
        .patch('/api/v1/events/event_1/ticket-types/tt_1')
        .set('Authorization', 'Bearer token')
        .send({});

      expect(res.status).toBe(422);
    });

    it('should return 200 on successful update', async () => {
      ticketService.updateTicketType.mockResolvedValue({ ...mockTicketType, name: 'VVIP' });

      const res = await request(app)
        .patch('/api/v1/events/event_1/ticket-types/tt_1')
        .set('Authorization', 'Bearer token')
        .send({ name: 'VVIP' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('VVIP');
    });
  });

  describe('DELETE /api/v1/events/:eventId/ticket-types/:id', () => {
    it('should return 200 on successful deletion', async () => {
      ticketService.deleteTicketType.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/v1/events/event_1/ticket-types/tt_1')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
    });
  });

  describe('Authorization', () => {
    it('should return 401 when no token is sent', async () => {
      const res = await request(app)
        .post('/api/v1/events/event_1/ticket-types')
        .send({ name: 'VIP', price: 5000 });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });
  });
});
