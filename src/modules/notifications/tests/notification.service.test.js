import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  sendNotification,
  retryNotification,
  getNotificationById,
  getNotificationsByRecipient,
  getNotificationsByUser,
  getNotificationsByEvent,
} from '../notification.service.js';
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

    test('should mark FAILED when sendEmail resolves with success false', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification);
      prisma.notification.update.mockResolvedValue({
        ...mockNotification,
        status: 'FAILED',
        failureReason: 'Bounced',
      });

      vi.spyOn(emailService, 'sendEmail').mockResolvedValue({ success: false, error: 'Bounced' });

      const result = await sendNotification({
        recipient: 'user@example.com',
        subject: 'Welcome',
        template: 'registration',
      });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotification.id },
        data: expect.objectContaining({ status: 'FAILED', failureReason: 'Bounced' }),
      });
      expect(result).toEqual({
        success: false,
        notification: expect.objectContaining({ status: 'FAILED' }),
        error: 'Bounced',
      });
    });

    test('should default template to custom and store null context when empty', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification);
      prisma.notification.update.mockResolvedValue({ ...mockNotification, status: 'SENT' });
      vi.spyOn(emailService, 'sendEmail').mockResolvedValue({ success: true });

      await sendNotification({ recipient: 'user@example.com' });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'EMAIL',
          template: 'custom',
          subject: null,
          context: null,
        }),
      });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotification.id },
        data: expect.objectContaining({
          status: 'SENT',
          providerMessageId: null,
          sentAt: expect.any(Date),
          failureReason: null,
        }),
      });
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

    test('should throw when the notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(retryNotification('missing')).rejects.toThrow('Notification not found');
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    test('should use fallback subject and passed context when persisted values are missing', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        ...mockNotification,
        subject: null,
        context: null,
      });
      prisma.notification.update.mockResolvedValue(mockNotification);

      const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
        success: true,
      });

      await retryNotification(mockNotification.id, { name: 'Override' });

      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: '[Retry] Notification for registration',
          template: 'registration',
          context: { name: 'Override' },
        })
      );
    });

    test('should mark FAILED when the retry email resolves with success false', async () => {
      prisma.notification.findUnique.mockResolvedValue(mockNotification);
      prisma.notification.update
        .mockResolvedValueOnce({ ...mockNotification, status: 'PENDING' })
        .mockResolvedValueOnce({ ...mockNotification, status: 'FAILED', failureReason: 'Rejected' });

      vi.spyOn(emailService, 'sendEmail').mockResolvedValue({ success: false, error: 'Rejected' });

      const result = await retryNotification(mockNotification.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rejected');
      expect(prisma.notification.update).toHaveBeenNthCalledWith(2, {
        where: { id: mockNotification.id },
        data: expect.objectContaining({ status: 'FAILED', failureReason: 'Rejected' }),
      });
    });

    test('should mark FAILED when the retry email throws', async () => {
      prisma.notification.findUnique.mockResolvedValue(mockNotification);
      prisma.notification.update
        .mockResolvedValueOnce({ ...mockNotification, status: 'PENDING' })
        .mockResolvedValueOnce({ ...mockNotification, status: 'FAILED', failureReason: 'SMTP down' });

      vi.spyOn(emailService, 'sendEmail').mockRejectedValue(new Error('SMTP down'));

      const result = await retryNotification(mockNotification.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMTP down');
      expect(prisma.notification.update).toHaveBeenNthCalledWith(2, {
        where: { id: mockNotification.id },
        data: expect.objectContaining({ status: 'FAILED', failureReason: 'SMTP down' }),
      });
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

  describe('notification getters', () => {
    test('should list notifications by recipient ordered by createdAt desc', async () => {
      prisma.notification.findMany.mockResolvedValue([mockNotification]);
      const result = await getNotificationsByRecipient('user@example.com');
      expect(result).toEqual([mockNotification]);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { recipient: 'user@example.com' },
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should list notifications by user', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      const result = await getNotificationsByUser('user-1');
      expect(result).toEqual([]);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should list notifications by event', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      const result = await getNotificationsByEvent('event-1');
      expect(result).toEqual([]);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
