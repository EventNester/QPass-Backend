import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedError } from '../../../utils/error.js';

vi.mock('../../../config/index.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
  systemMessages: {
    ERROR: {
      AUTH: {
        UNAUTHORIZED: 'Unauthorized access',
        CURRENT_PASSWORD_INVALID: 'Current password is incorrect',
      },
    },
  },
}));

vi.mock('../../../utils/audit-log.js', () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock('../../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => ({ set: vi.fn(), get: vi.fn() })),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (plain) => `hashed:${plain}`),
    compare: vi.fn(async (plain) => plain === 'right-current'),
  },
  hash: vi.fn(async (plain) => `hashed:${plain}`),
  compare: vi.fn(async (plain) => plain === 'right-current'),
}));

vi.mock('../../../database/index.js', () => ({
  default: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import prisma from '../../../database/index.js';
import { getProfile, updateProfile, changePassword } from '../auth.service.js';

describe('Account Service', () => {
  const user = {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: null,
    role: 'ATTENDEE',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getProfile returns the public profile without the password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    const profile = await getProfile('user-1');

    expect(profile.email).toBe('ada@example.com');
    expect(profile.passwordHash).toBeUndefined();
  });

  it('getProfile throws when the user is deleted', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, deletedAt: new Date() });

    await expect(getProfile('user-1')).rejects.toThrow(UnauthorizedError);
  });

  it('updateProfile updates name and phone', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ ...user, name: 'Ada L', phone: '08012345678' });

    const profile = await updateProfile('user-1', { name: 'Ada L', phone: '08012345678' });

    expect(prisma.user.update).toHaveBeenCalled();
    expect(profile.name).toBe('Ada L');
    expect(profile.phone).toBe('08012345678');
  });

  it('updateProfile skips unchanged fields', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);

    await updateProfile('user-1', { name: 'Ada Lovelace' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {},
    });
  });

  it('changePassword rejects a wrong current password', async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      changePassword('user-1', 'wrong-current', 'NewPassword123')
    ).rejects.toThrow(UnauthorizedError);
  });

  it('changePassword updates the hash when the current password matches', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ ...user, passwordHash: 'hashed:NewPassword123' });

    const result = await changePassword('user-1', 'right-current', 'NewPassword123');

    expect(result).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'hashed:NewPassword123' },
    });
  });
});
