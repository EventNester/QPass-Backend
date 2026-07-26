import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import prisma from '../../database/index.js';

describe('Auth API Integration Tests (Template)', () => {

  // Setup: runs once before all tests in this block
  beforeAll(async () => {
    // Example: Clear out test data to ensure a clean slate
    // await prisma.user.deleteMany({});
  });

  // Teardown: runs once after all tests in this block complete
  afterAll(async () => {
    // Disconnect Prisma to prevent open handles from hanging the test runner
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register', () => {
    
    it('should return 422 Validation Error if payload is missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          // Missing email and password
          name: 'Incomplete User',
        });

      // Verify the Zod validation middleware catches the bad payload
      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toBeDefined();
    });

    it('should return 501 Not Implemented for a valid payload (until feature is built)', async () => {
      const validPayload = {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'SecurePassword123!',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validPayload);

      // Note: Once the controller is implemented, update this test to expect 201 Created
      // and verify that the user was inserted into the database via prisma.
      expect(response.status).toBe(501);
      expect(response.body.message).toBe('Not implemented');
    });

  });

  describe('POST /api/v1/auth/login', () => {

    it('should return 422 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        });

      expect(response.status).toBe(422);
    });

    // TODO: Add more test cases (e.g., wrong password -> 401, success -> 200) as the feature is developed
  });

});
