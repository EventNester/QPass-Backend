import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  renderTemplate,
  sendEmail,
  getEtherealAccount,
  getTransporter,
  verifySmtpConnection,
  resetTransporterCache,
} from '../email.service.js';
import nodemailer from 'nodemailer';

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransporterCache();
  });

  afterEach(() => {
    resetTransporterCache();
  });

  describe('renderTemplate', () => {
    test('should render registration template with variables', async () => {
      const html = await renderTemplate('registration', {
        name: 'John Doe',
        email: 'john@example.com',
        loginUrl: 'https://qpass.com/login',
      });
      expect(html).toContain('John Doe');
      expect(html).toContain('john@example.com');
      expect(html).toContain('https://qpass.com/login');
    });

    test('should render qr-issued template with variables', async () => {
      const html = await renderTemplate('qr-issued', {
        name: 'Jane Smith',
        eventName: 'Tech Summit 2026',
        ticketType: 'VIP',
        qrData: 'QR-TOKEN-123',
      });
      expect(html).toContain('Jane Smith');
      expect(html).toContain('Tech Summit 2026');
      expect(html).toContain('VIP');
      expect(html).toContain('QR-TOKEN-123');
    });

    test('should render payment-verified template with variables', async () => {
      const html = await renderTemplate('payment-verified', {
        name: 'Alice Brown',
        eventName: 'Music Fest',
        amount: '150.00',
        currency: 'USD',
        reference: 'PAY-REF-001',
      });
      expect(html).toContain('Alice Brown');
      expect(html).toContain('150.00');
      expect(html).toContain('PAY-REF-001');
    });

    test('should render staff-invite template with variables', async () => {
      const html = await renderTemplate('staff-invite', {
        name: 'Bob Staff',
        eventName: 'DevCon',
        role: 'CHECKIN_STAFF',
        inviteUrl: 'https://qpass.com/invite/123',
      });
      expect(html).toContain('Bob Staff');
      expect(html).toContain('CHECKIN_STAFF');
      expect(html).toContain('https://qpass.com/invite/123');
    });

    test('should render password-reset template with variables', async () => {
      const html = await renderTemplate('password-reset', {
        name: 'Charlie',
        resetUrl: 'https://qpass.com/reset?token=xyz',
        expiresIn: '15 minutes',
      });
      expect(html).toContain('Charlie');
      expect(html).toContain('https://qpass.com/reset?token=xyz');
      expect(html).toContain('15 minutes');
    });

    test('should render a template passed as an explicit .ejs filename', async () => {
      const html = await renderTemplate('registration.ejs', {
        name: 'Direct File',
        email: 'direct@example.com',
        loginUrl: 'https://qpass.com/login',
      });
      expect(html).toContain('Direct File');
      expect(html).toContain('direct@example.com');
    });
  });

  describe('sendEmail with retry logic', () => {
    test('should throw when the recipient is missing', async () => {
      await expect(
        sendEmail({ subject: 'No To', html: '<p>x</p>' })
      ).rejects.toThrow('Recipient (to) and content (template, html, or text) are required');
    });

    test('should throw when no content is provided', async () => {
      await expect(
        sendEmail({ to: 'a@b.com', subject: 'No content' })
      ).rejects.toThrow('Recipient (to) and content (template, html, or text) are required');
    });

    test('should send email successfully on first attempt', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Welcome',
        template: 'registration',
        context: { name: 'Test User', email: 'test@example.com' },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    test('should retry on failure up to 3 attempts and succeed on attempt 3', async () => {
      const fakeTransporter = {
        sendMail: vi
          .fn()
          .mockRejectedValueOnce(new Error('Network error 1'))
          .mockRejectedValueOnce(new Error('Network error 2'))
          .mockResolvedValueOnce({ messageId: 'msg-success-on-3' }),
      };

      vi.spyOn(nodemailer, 'createTransport').mockReturnValue(fakeTransporter);
      resetTransporterCache();

      const result = await sendEmail({
        to: 'retry@example.com',
        subject: 'Retry Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-success-on-3');
      expect(fakeTransporter.sendMail).toHaveBeenCalledTimes(3);
    });

    test('should return success: false after 3 failed attempts (non-blocking)', async () => {
      const fakeTransporter = {
        sendMail: vi.fn().mockRejectedValue(new Error('Persistent error')),
      };

      vi.spyOn(nodemailer, 'createTransport').mockReturnValue(fakeTransporter);
      resetTransporterCache();

      const res = await sendEmail({
        to: 'fail@example.com',
        subject: 'Fail Test',
        html: '<p>Test</p>',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Persistent error');
      expect(fakeTransporter.sendMail).toHaveBeenCalledTimes(3);
    });

    test('should throw on template rendering errors (non-existent template)', async () => {
      await expect(
        renderTemplate('non-existent-template', {
          subject: 'Fallback Test',
        })
      ).rejects.toThrow();
    });

    test('should strip style and script blocks from generated plain-text body', async () => {
      const sendMailSpy = vi.fn().mockResolvedValue({ messageId: 'msg-text' });
      vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail: sendMailSpy });
      resetTransporterCache();

      const result = await sendEmail({
        to: 'text@example.com',
        subject: 'Text Test',
        html: '<style>.btn{color:red}</style><script>alert("x")</script><p>Hello <b>World</b></p>',
      });

      expect(result.success).toBe(true);
      const text = sendMailSpy.mock.calls[0][0].text;
      expect(text).toBe('Hello World');
      expect(text).not.toContain('color:red');
      expect(text).not.toContain('alert');
    });
  });

  describe('Ethereal support', () => {
    test('should create and return cached Ethereal test account', async () => {
      const account = { user: 'testuser@ethereal.email', pass: 'secretpass' };
      const createTestAccountSpy = vi
        .spyOn(nodemailer, 'createTestAccount')
        .mockResolvedValue(account);

      const res = await getEtherealAccount();
      expect(createTestAccountSpy).toHaveBeenCalled();
      expect(res.user).toBe('testuser@ethereal.email');
    });

    test('should create Ethereal test account and transport when forceEthereal is true', async () => {
      const account = { user: 'testuser@ethereal.email', pass: 'secretpass' };
      const createTestAccountSpy = vi
        .spyOn(nodemailer, 'createTestAccount')
        .mockResolvedValue(account);

      const etherealTransporter = await getTransporter(true);

      expect(createTestAccountSpy).toHaveBeenCalled();
      expect(etherealTransporter).toBeDefined();
    });
  });

  describe('getTransporter caching', () => {
    test('should reuse the cached json transporter for non-ethereal requests', async () => {
      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport');

      const first = await getTransporter();
      const second = await getTransporter();

      expect(first).toBe(second);
      expect(createTransportSpy).toHaveBeenCalledTimes(1);
    });

    test('should reuse the cached Ethereal transporter across forceEthereal calls', async () => {
      vi.spyOn(nodemailer, 'createTestAccount').mockResolvedValue({
        user: 'u@ethereal.email',
        pass: 'secret',
      });
      const createTransportSpy = vi
        .spyOn(nodemailer, 'createTransport')
        .mockReturnValue({ ethereal: true });

      const first = await getTransporter(true);
      const second = await getTransporter(true);

      expect(second).toBe(first);
      expect(createTransportSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifySmtpConnection', () => {
    test('should return success when the transporter verifies', async () => {
      vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        verify: vi.fn().mockResolvedValue(true),
      });

      const result = await verifySmtpConnection();
      expect(result).toEqual({ success: true });
    });

    test('should return failure when transporter verify rejects', async () => {
      vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        verify: vi.fn().mockRejectedValue(new Error('auth failed')),
      });

      const result = await verifySmtpConnection();
      expect(result).toEqual({ success: false, error: 'auth failed' });
    });

    test('should return success when the transporter has no verify method', async () => {
      vi.spyOn(nodemailer, 'createTransport').mockReturnValue({});

      const result = await verifySmtpConnection();
      expect(result).toEqual({ success: true });
    });
  });
});

