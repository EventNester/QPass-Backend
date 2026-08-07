import { describe, test, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  // Create a structured mock error matching standard Node network/SMTP exceptions
  class MockSmtpError extends Error {
    constructor(message, code = undefined, responseCode = undefined) {
      super(message);
      this.name = 'SmtpError';
      this.code = code;
      this.responseCode = responseCode;
    }
  }
  return {
    mExecuteSmtpSend: vi.fn(),
    mGetConfig: vi.fn(() => ({
      EMAIL_HOST_USER: 'qpassevents@gmail.com',
      EMAIL_HOST_PASSWORD: 'mock-app-password',
    })),
    MockSmtpError,
    mLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  };
});

// Mock the new SMTP destination core engine
vi.mock('../../../utils/email.js', () => ({
  sendEmail: m.mExecuteSmtpSend,
}));

// Mock the config module to easily flip credentials on or off
vi.mock('../../../config/index.js', () => ({
  getConfig: m.mGetConfig,
  logger: m.mLogger,
}));

import { renderTemplate, sendEmail, isEmailConfigured } from '../email.service.js';

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.mExecuteSmtpSend.mockReset();
    m.mExecuteSmtpSend.mockResolvedValue(true); // Matches our utils/email.js return signature
    m.mGetConfig.mockReturnValue({
      EMAIL_HOST_USER: 'qpassevents@gmail.com',
      EMAIL_HOST_PASSWORD: 'mock-app-password',
    });
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

    test('should throw on template rendering errors (non-existent template)', async () => {
      await expect(renderTemplate('non-existent-template', { subject: 'Fallback Test' })).rejects.toThrow();
    });
  });

  describe('isEmailConfigured', () => {
    test('should reflect SMTP user profile configuration status', () => {
      m.mGetConfig.mockReturnValue({ EMAIL_HOST_USER: null, EMAIL_HOST_PASSWORD: null });
      expect(isEmailConfigured()).toBe(false);

      m.mGetConfig.mockReturnValue({ EMAIL_HOST_USER: 'ok@gmail.com', EMAIL_HOST_PASSWORD: 'yes' });
      expect(isEmailConfigured()).toBe(true);
    });
  });

  describe('sendEmail (MVP simulated no-op)', () => {
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

    test('should report a simulated success without sending anything', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Welcome',
        template: 'registration',
        context: { name: 'Test User', email: 'test@example.com' },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^simulated-/);
      expect(result.previewUrl).toBeNull();
      expect(m.mExecuteSmtpSend).not.toHaveBeenCalled();
    });

    test('should succeed even when SMTP credentials are not configured', async () => {
      m.mGetConfig.mockReturnValue({ EMAIL_HOST_USER: null, EMAIL_HOST_PASSWORD: null });

      const res = await sendEmail({
        to: 'noconfig@example.com',
        subject: 'No Config',
        html: '<p>Test</p>',
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toMatch(/^simulated-/);
    });
  });
});
