import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import prisma from '../../database/index.js';
import {
  sendNotification,
  getNotificationsByRecipient,
  getNotificationById,
} from '../../modules/notifications/notification.service.js';

// Mock the new config object so the tests think SMTP credentials are ready
vi.mock('../../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    EMAIL_HOST_USER: 'qpassevents@gmail.com',
    EMAIL_HOST_PASSWORD: 'mock-app-password',
    EMAIL_HOST: '://gmail.com',
    EMAIL_PORT: 465,
    NODE_ENV: 'production'
  })),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Mock Nodemailer default exports to intercept downstream outbound emails cleanly
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(() => Promise.resolve({ messageId: 'smtp-integration-msg' })),
    })),
  },
}));

describe('Notification Service Integration Tests', () => {
  const testRecipient = 'integration-user@example.com';

  beforeAll(async () => {
    await prisma.notification.deleteMany({
      where: { recipient: testRecipient },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { recipient: testRecipient },
    });
  });

  it('should send registration notification and track SENT status in database', async () => {
    const result = await sendNotification({
      recipient: testRecipient,
      subject: 'Welcome to QPass',
      template: 'registration',
      context: {
        name: 'Ada Lovelace',
        email: testRecipient,
        loginUrl: 'http://localhost:3000/login',
      },
    });

    expect(result.success).toBe(true);
    expect(result.notification).toBeDefined();
    expect(result.notification.status).toBe('SENT');
    expect(result.notification.sentAt).not.toBeNull();
    expect(result.notification.template).toBe('registration');

    const inDb = await getNotificationById(result.notification.id);
    expect(inDb.status).toBe('SENT');
  });

  it('should send qr-issued notification and store record in DB', async () => {
    const result = await sendNotification({
      recipient: testRecipient,
      subject: 'Your QR Pass',
      template: 'qr',
      context: {
        name: 'Ada Lovelace',
        eventName: 'QPass Summit',
        ticketType: 'VIP',
        qrData: 'TOKEN-ABC-123',
      },
    });

    expect(result.success).toBe(true);
    expect(result.notification.template).toBe('qr');
    expect(result.notification.status).toBe('SENT');
  });

  it('should send payment-verified notification and store record in DB', async () => {
    const result = await sendNotification({
      recipient: testRecipient,
      subject: 'Payment Confirmed',
      template: 'payment',
      context: {
        name: 'Ada Lovelace',
        eventName: 'QPass Summit',
        amount: '100.00',
        currency: 'USD',
        reference: 'REF-999',
      },
    });

    expect(result.success).toBe(true);
    expect(result.notification.template).toBe('payment');
    expect(result.notification.status).toBe('SENT');
  });

  it('should send staff-invite notification and store record in DB', async () => {
    const result = await sendNotification({
      recipient: testRecipient,
      subject: 'Staff Invitation',
      template: 'staff',
      context: {
        name: 'Ada Lovelace',
        eventName: 'QPass Summit',
        role: 'CHECKIN_STAFF',
        inviteUrl: 'http://localhost:3000/invite/1',
      },
    });

    expect(result.success).toBe(true);
    expect(result.notification.template).toBe('staff');
    expect(result.notification.status).toBe('SENT');
  });

  it('should send password-reset notification and store record in DB', async () => {
    const result = await sendNotification({
      recipient: testRecipient,
      subject: 'Password Reset',
      template: 'password-reset',
      context: {
        name: 'Ada Lovelace',
        resetUrl: 'http://localhost:3000/reset?token=abc',
        expiresIn: '15 minutes',
      },
    });

    expect(result.success).toBe(true);
    expect(result.notification.template).toBe('password-reset');
    expect(result.notification.status).toBe('SENT');
  });

  it('should retrieve all sent notifications for recipient from database', async () => {
    const records = await getNotificationsByRecipient(testRecipient);
    expect(records).toEqual(
      expect.arrayContaining(
        ['registration', 'qr', 'payment', 'staff', 'password-reset'].map((template) =>
          expect.objectContaining({
            recipient: testRecipient,
            template,
            status: 'SENT',
            sentAt: expect.any(Date),
          })
        )
      )
    );
  });
});
