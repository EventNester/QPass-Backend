import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import importRoutes from '../import.routes.js';
import prisma from '../../../database/index.js';

vi.mock('../../../database/index.js', () => {
  return {
    default: {
      event: {
        findUnique: vi.fn(),
      },
    },
  };
});

vi.mock('../../auth/auth.middleware.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { sub: 'test-user-id', role: 'ORGANIZER' };
    next();
  },
}));

vi.mock('../../../middlewares/rbac.middleware.js', () => ({
  requireRole: () => (req, res, next) => next(),
}));

// Mock the upload middleware which is used in the routes
vi.mock('../../../middlewares/upload.middleware.js', () => ({
  uploadAttendees: {
    single: () => (req, res, next) => next(),
  },
  handleUploadError: (req, res, next) => next(),
  requireFile: (req, res, next) => next(),
  cleanupOnError: (req, res, next) => next(),
}));

const app = express();
app.use(express.json());
// In the app, it's mounted at /events, but import.routes.js now expects /:eventId/import-template.
app.use('/events', importRoutes);

app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({ error: err.message });
});

describe('GET /events/:eventId/import-template', () => {
  const eventId = '123e4567-e89b-12d3-a456-426614174000';

  it('should stream a CSV template successfully', async () => {
    prisma.event.findUnique.mockResolvedValueOnce({ ownerId: 'test-user-id' });

    const res = await request(app).get(`/events/${eventId}/import-template?format=csv`);
    
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="qpass-import-template.csv"');
    expect(res.text).toContain('"Name","Email","Phone","TicketType"');
  });

  it('should stream a PDF template successfully', async () => {
    prisma.event.findUnique.mockResolvedValueOnce({ ownerId: 'test-user-id' });

    const res = await request(app).get(`/events/${eventId}/import-template?format=pdf`);
    
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="qpass-import-template.pdf"');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
