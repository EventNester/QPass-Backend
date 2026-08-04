import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedError } from '../../../utils/error.js';

const mRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('../../../config/index.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
  systemMessages: {
    ERROR: {
      AUTH: { OTP_INVALID: 'Invalid or expired verification code' },
    },
  },
}));

vi.mock('../../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => mRedis),
}));

vi.mock('../../../utils/email.js', () => ({
  sendOtpEmail: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../../database/index.js', () => ({
  default: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import prisma from '../../../database/index.js';
import { sendOtp, verifyOtp } from '../otp.service.js';
import { sendOtpEmail } from '../../../utils/email.js';

describe('Email Verification OTP Service', () => {
  const email = 'ada@example.com';
  const user = { id: 'user-1', email, deletedAt: null };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('sendOtp generates a 6-digit code, stores it in Redis and emails it', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    mRedis.set.mockResolvedValue('OK');

    const result = await sendOtp({ email });

    expect(result.success).toBe(true);
    expect(result.code).toMatch(/^\d{6}$/);
    expect(mRedis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^otp:email_verify:ada@example\.com$/),
      result.code,
      'EX',
      600
    );
    expect(sendOtpEmail).toHaveBeenCalledWith(email, result.code);
  });

  it('sendOtp normalizes the email and never leaks account existence', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await sendOtp({ email: 'ADA@Example.com' });

    expect(result.success).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ada@example.com' },
    });
    expect(result.code).toBeUndefined();
    expect(mRedis.set).not.toHaveBeenCalled();
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it('sendOtp does not send a code for an already verified account', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, emailVerifiedAt: new Date() });

    const result = await sendOtp({ email });

    expect(result.success).toBe(true);
    expect(result.sent).toBe(false);
    expect(mRedis.set).not.toHaveBeenCalled();
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it('sendOtp deletes the stored code when the email fails to send', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    mRedis.set.mockResolvedValue('OK');
    mRedis.del.mockResolvedValue(1);
    sendOtpEmail.mockResolvedValue({ success: false, error: 'smtp down' });

    const result = await sendOtp({ email });

    expect(result.success).toBe(false);
    expect(mRedis.del).toHaveBeenCalled();
  });

  it('verifyOtp marks the email verified and consumes the code', async () => {
    mRedis.get.mockResolvedValue('123456');
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ id: 'user-1', emailVerifiedAt: new Date() });

    const updated = await verifyOtp({ email, code: '123456' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(mRedis.del).toHaveBeenCalledWith('otp:email_verify:ada@example.com');
    expect(updated.id).toBe('user-1');
  });

  it('verifyOtp rejects a wrong code', async () => {
    mRedis.get.mockResolvedValue('000000');

    await expect(verifyOtp({ email, code: '111111' })).rejects.toThrow(UnauthorizedError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('verifyOtp rejects an expired or missing code', async () => {
    mRedis.get.mockResolvedValue(null);

    await expect(verifyOtp({ email, code: '123456' })).rejects.toThrow(UnauthorizedError);
  });
});
