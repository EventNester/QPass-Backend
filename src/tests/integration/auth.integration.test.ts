import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';

describe('Auth API Integration Tests', () => {

  beforeAll(async () => {
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register', () => {

    it('should return 400 if payload is missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Incomplete User',
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBeDefined();
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'not-an-email',
          password: 'SecurePassword123',
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should return 201 and create user for a valid payload', async () => {
      const validPayload = {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'SecurePassword123',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe('ada@example.com');
      expect(response.body.data.user.role).toBe('ATTENDEE');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

  });

  describe('POST /api/v1/auth/login', () => {

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should return 401 for wrong password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ada@example.com',
          password: 'WrongPassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });

    it('should return 200 with tokens for valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ada@example.com',
          password: 'SecurePassword123',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

  });

});
