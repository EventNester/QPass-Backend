import { describe, test, expect, vi, beforeEach } from 'vitest';
import { sendNotification, retryNotification, getNotificationById } from '../notification.service.js';
import prisma from '../../../database/index.js';
import * as emailService from '../email.service.js';

vi.mock('../../../database/index.js', () => {
  const mPrisma = {
    notification: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { default: mPrisma };
});

describe('Notification Service', () => {
  const mockNotification = {
    id: 'notif-id-100',
    recipient: 'user@example.com',
    channel: 'EMAIL',
    template: 'registration',
    status: 'PENDING',
    userId: 'user-1',
    eventId: null,
    registrationId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendNotification', () => {
    test('should create PENDING notification and update to SENT on success', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification);
      prisma.notification.update.mockResolvedValue({
        ...mockNotification,
        status: 'SENT',
        providerMessageId: 'msg-123',
      });

      const sendEmailSpy = vi
        .spyOn(emailService, 'sendEmail')
        .mockResolvedValue({ success: true, messageId: 'msg-123', previewUrl: 'http://ethereal/1' });

      const result = await sendNotification({
        recipient: 'user@example.com',
        subject: 'Welcome',
        template: 'registration',
        context: { name: 'User' },
        userId: 'user-1',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient: 'user@example.com',
          status: 'PENDING',
          template: 'registration',
          subject: 'Welcome',
          context: { name: 'User' },
        }),
      });

      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Welcome',
          template: 'registration',
        })
      );

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotification.id },
        data: expect.objectContaining({
          status: 'SENT',
          providerMessageId: 'msg-123',
        }),
      });

      expect(result.success).toBe(true);
      expect(result.notification.status).toBe('SENT');
      expect(result.previewUrl).toBe('http://ethereal/1');
    });

    test('should update notification to FAILED if sendEmail fails', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification);
      prisma.notification.update.mockResolvedValue({
        ...mockNotification,
        status: 'FAILED',
        failureReason: 'SMTP connection timed out',
      });

      vi.spyOn(emailService, 'sendEmail').mockRejectedValue(new Error('SMTP connection timed out'));

      const result = await sendNotification({
        recipient: 'user@example.com',
        subject: 'Welcome',
        template: 'registration',
        context: { name: 'User' },
      });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotification.id },
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'SMTP connection timed out',
        }),
      });

      expect(result.success).toBe(false);
      expect(result.notification.status).toBe('FAILED');
      expect(result.error).toBe('SMTP connection timed out');
    });
  });

  describe('retryNotification', () => {
    test('should reset status to PENDING and update to SENT on success', async () => {
      const failedNotif = {
        ...mockNotification,
        status: 'FAILED',
        failureReason: 'Old error',
        subject: 'Welcome Back',
        context: { name: 'Persisted User' },
      };
      prisma.notification.findUnique.mockResolvedValue(failedNotif);
      prisma.notification.update
        .mockResolvedValueOnce({ ...failedNotif, status: 'PENDING', failureReason: null })
        .mockResolvedValueOnce({ ...failedNotif, status: 'SENT', providerMessageId: 'msg-456' });

      const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'msg-456',
        previewUrl: 'http://ethereal/retry',
      });

      const result = await retryNotification(mockNotification.id, { name: 'User' });

      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Welcome Back',
          template: 'registration',
          context: { name: 'Persisted User' },
        })
      );
      expect(result.success).toBe(true);
      expect(result.notification.status).toBe('SENT');
      expect(prisma.notification.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('getNotificationById', () => {
    test('should retrieve a notification by ID', async () => {
      prisma.notification.findUnique.mockResolvedValue(mockNotification);
      const notif = await getNotificationById('notif-id-100');
      expect(notif.id).toBe('notif-id-100');
      expect(prisma.notification.findUnique).toHaveBeenCalledWith({
        where: { id: 'notif-id-100' },
      });
    });
  });
});
