import { describe, test, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  class MockBrevoApiError extends Error {
    constructor(message, status = 0, retryable = false) {
      super(message);
      this.name = 'BrevoApiError';
      this.status = status;
      this.retryable = retryable;
    }
  }
  return {
    mSendTransactionalEmail: vi.fn(),
    mIsBrevoConfigured: vi.fn(() => true),
    MockBrevoApiError,
    mLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  };
});

vi.mock('../../../integrations/email/brevo.js', () => ({
  sendTransactionalEmail: m.mSendTransactionalEmail,
  isBrevoConfigured: m.mIsBrevoConfigured,
  BrevoApiError: m.MockBrevoApiError,
}));

vi.mock('../../../config/index.js', () => ({
  logger: m.mLogger,
}));

import { renderTemplate, sendEmail, isEmailConfigured } from '../email.service.js';

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.mSendTransactionalEmail.mockReset();
    m.mSendTransactionalEmail.mockResolvedValue({ messageId: 'msg-ok' });
    m.mIsBrevoConfigured.mockReturnValue(true);
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
    test('should reflect Brevo configuration status', () => {
      m.mIsBrevoConfigured.mockReturnValue(false);
      expect(isEmailConfigured()).toBe(false);
      m.mIsBrevoConfigured.mockReturnValue(true);
      expect(isEmailConfigured()).toBe(true);
    });
  });

  describe('sendEmail', () => {
    test('should throw when the recipient is missing', async () => {
      await expect(
        sendEmail({ subject: 'No To', html: '<p>x</p>' })
      ).rejects.toThrow('Recipient (to) and content (template, html, or text) are required');
      expect(m.mSendTransactionalEmail).not.toHaveBeenCalled();
    });

    test('should throw when no content is provided', async () => {
      await expect(
        sendEmail({ to: 'a@b.com', subject: 'No content' })
      ).rejects.toThrow('Recipient (to) and content (template, html, or text) are required');
      expect(m.mSendTransactionalEmail).not.toHaveBeenCalled();
    });

    test('should send email successfully on first attempt', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Welcome',
        template: 'registration',
        context: { name: 'Test User', email: 'test@example.com' },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-ok');
      expect(m.mSendTransactionalEmail).toHaveBeenCalledTimes(1);
      expect(m.mSendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'test@example.com', subject: 'Welcome' })
      );
    });

    test('should retry on transient (retryable) failures and succeed', async () => {
      m.mSendTransactionalEmail
        .mockRejectedValueOnce(new m.MockBrevoApiError('Rate limited', 429, true))
        .mockRejectedValueOnce(new m.MockBrevoApiError('HTTP 500', 500, true))
        .mockResolvedValueOnce({ messageId: 'msg-success-on-3' });

      const result = await sendEmail({
        to: 'retry@example.com',
        subject: 'Retry Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-success-on-3');
      expect(m.mSendTransactionalEmail).toHaveBeenCalledTimes(3);
    });

    test('should not retry non-retryable API credential errors', async () => {
      m.mSendTransactionalEmail.mockRejectedValue(
        new m.MockBrevoApiError('Invalid Brevo API credentials — check BREVO_API_KEY', 401, false)
      );

      const res = await sendEmail({
        to: 'fail@example.com',
        subject: 'Fail Test',
        html: '<p>Test</p>',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid Brevo API credentials — check BREVO_API_KEY');
      expect(m.mSendTransactionalEmail).toHaveBeenCalledTimes(1);
    });

    test('should return success: false with descriptive error for invalid recipient', async () => {
      m.mSendTransactionalEmail.mockRejectedValue(
        new m.MockBrevoApiError('Invalid recipient email address', 400, false)
      );

      const res = await sendEmail({
        to: 'not-an-email',
        subject: 'Bad Recipient',
        html: '<p>Test</p>',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid recipient email address');
      expect(m.mSendTransactionalEmail).toHaveBeenCalledTimes(1);
    });

    test('should return success: false with descriptive error for timeout after retries', async () => {
      m.mSendTransactionalEmail.mockRejectedValue(
        new m.MockBrevoApiError('Brevo API request timed out', 0, true)
      );

      const res = await sendEmail({
        to: 'timeout@example.com',
        subject: 'Timeout Test',
        html: '<p>Test</p>',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Brevo API request timed out');
      expect(m.mSendTransactionalEmail).toHaveBeenCalledTimes(3);
    });

    test('should fail safely when Brevo credentials are not configured', async () => {
      m.mSendTransactionalEmail.mockRejectedValue(
        new m.MockBrevoApiError('BREVO_API_KEY is not configured', 0, false)
      );

      const res = await sendEmail({
        to: 'noconfig@example.com',
        subject: 'No Config',
        html: '<p>Test</p>',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('BREVO_API_KEY is not configured');
      expect(m.mSendTransactionalEmail).toHaveBeenCalledTimes(1);
    });

    test('should return success: false after persistent transient failures (non-blocking)', async () => {
      m.mSendTransactionalEmail.mockRejectedValue(
        new m.MockBrevoApiError('Persistent network error', 0, true)
      );

      const res = await sendEmail({
        to: 'fail@example.com',
        subject: 'Fail Test',
        html: '<p>Test</p>',
        maxAttempts: 2,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Persistent network error');
      expect(m.mSendTransactionalEmail).toHaveBeenCalledTimes(2);
    });

    test('should retry when the provider throws a non-Brevo error (defensive)', async () => {
      m.mSendTransactionalEmail
        .mockRejectedValueOnce(new Error('Unexpected provider error'))
        .mockResolvedValueOnce({ messageId: 'msg-defensive' });

      const result = await sendEmail({
        to: 'defensive@example.com',
        subject: 'Defensive Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-defensive');
      expect(m.mSendTransactionalEmail).toHaveBeenCalledTimes(2);
    });

    test('should strip style and script blocks from generated plain-text body', async () => {
      const result = await sendEmail({
        to: 'text@example.com',
        subject: 'Text Test',
        html: '<style>.btn{color:red}</style><script>alert("x")</script><p>Hello <b>World</b></p>',
      });

      expect(result.success).toBe(true);
      const payload = m.mSendTransactionalEmail.mock.calls[0][0];
      expect(payload.text).toBe('Hello World');
      expect(payload.text).not.toContain('color:red');
      expect(payload.text).not.toContain('alert');
    });
  });
});
