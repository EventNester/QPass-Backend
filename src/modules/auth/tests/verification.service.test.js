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
      AUTH: { VERIFY_TOKEN_INVALID: 'Invalid or expired email verification token' },
    },
  },
}));

vi.mock('../../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => mRedis),
}));

vi.mock('../../../utils/email.js', () => ({
  sendEmailVerification: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../../database/index.js', () => ({
  default: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import prisma from '../../../database/index.js';
import { requestEmailVerification, verifyEmail } from '../verification.service.js';
import { sendEmailVerification } from '../../../utils/email.js';

describe('Email Verification Service', () => {
  const user = { id: 'user-1', email: 'ada@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('requestEmailVerification stores a token and sends the email', async () => {
    mRedis.set.mockResolvedValue('OK');

    const result = await requestEmailVerification(user);

    expect(result.success).toBe(true);
    expect(mRedis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^verify_email:[a-f0-9]{64}$/),
      user.id,
      'EX',
      900
    );
    expect(sendEmailVerification).toHaveBeenCalledWith(user.email, expect.any(String));
  });

  it('requestEmailVerification deletes the token when the email fails', async () => {
    mRedis.set.mockResolvedValue('OK');
    mRedis.del.mockResolvedValue(1);
    sendEmailVerification.mockResolvedValue({ success: false, error: 'smtp down' });

    const result = await requestEmailVerification(user);

    expect(result.success).toBe(false);
    expect(mRedis.del).toHaveBeenCalled();
  });

  it('verifyEmail sets emailVerifiedAt and consumes the token', async () => {
    mRedis.get.mockResolvedValue('user-1');
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'ada@example.com', deletedAt: null });
    prisma.user.update.mockResolvedValue({ id: 'user-1', emailVerifiedAt: new Date() });

    const updated = await verifyEmail('valid-token');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(mRedis.del).toHaveBeenCalledWith('verify_email:valid-token');
    expect(updated.id).toBe('user-1');
  });

  it('verifyEmail rejects an invalid token', async () => {
    mRedis.get.mockResolvedValue(null);

    await expect(verifyEmail('bad-token')).rejects.toThrow(UnauthorizedError);
  });
});
