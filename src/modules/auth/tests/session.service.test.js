import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashToken } from '../../../utils/crypto.js';

const mRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  exists: vi.fn(),
};

vi.mock('../../../config/index.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  systemMessages: {},
}));

vi.mock('../../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => mRedis),
}));

import {
  recordSession,
  hasActiveSession,
  deleteSession,
  listSessions,
  revokeSession,
} from '../session.service.js';

describe('Session Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordSession stores a hashed session id with a TTL', async () => {
    mRedis.set.mockResolvedValue('OK');

    const sessionId = await recordSession('user-1', 'refresh-token-abc');

    expect(sessionId).toBe(hashToken('refresh-token-abc'));
    expect(mRedis.set).toHaveBeenCalledWith(
      `session:user-1:${sessionId}`,
      expect.any(String),
      'EX',
      expect.any(Number)
    );
  });

  it('recordSession returns null when Redis fails', async () => {
    mRedis.set.mockRejectedValue(new Error('redis down'));

    const sessionId = await recordSession('user-1', 'refresh-token-abc');

    expect(sessionId).toBeNull();
  });

  it('hasActiveSession returns true when the session exists', async () => {
    mRedis.exists.mockResolvedValue(1);

    const active = await hasActiveSession('user-1', 'refresh-token-abc');

    expect(active).toBe(true);
  });

  it('hasActiveSession returns false when the session is missing', async () => {
    mRedis.exists.mockResolvedValue(0);

    const active = await hasActiveSession('user-1', 'refresh-token-abc');

    expect(active).toBe(false);
  });

  it('hasActiveSession returns false on Redis error', async () => {
    mRedis.exists.mockRejectedValue(new Error('redis down'));

    const active = await hasActiveSession('user-1', 'refresh-token-abc');

    expect(active).toBe(false);
  });

  it('deleteSession removes the session key', async () => {
    await deleteSession('user-1', 'refresh-token-abc');

    expect(mRedis.del).toHaveBeenCalledWith(`session:user-1:${hashToken('refresh-token-abc')}`);
  });

  it('listSessions returns parsed sessions newest first', async () => {
    mRedis.keys.mockResolvedValue(['session:user-1:aaa', 'session:user-1:bbb']);
    mRedis.get.mockImplementation(async (key) => {
      if (key.endsWith('aaa')) {
        return JSON.stringify({ userAgent: 'a', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z' });
      }
      return JSON.stringify({ userAgent: 'b', createdAt: '2026-01-02T00:00:00.000Z', expiresAt: '2026-01-09T00:00:00.000Z' });
    });

    const sessions = await listSessions('user-1');

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('bbb');
    expect(sessions[1].id).toBe('aaa');
  });

  it('listSessions tolerates unparseable metadata', async () => {
    mRedis.keys.mockResolvedValue(['session:user-1:ccc']);
    mRedis.get.mockResolvedValue('not-json');

    const sessions = await listSessions('user-1');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('ccc');
    expect(sessions[0].userAgent).toBeNull();
  });

  it('revokeSession removes the session key', async () => {
    await revokeSession('user-1', 'session-hash-123');

    expect(mRedis.del).toHaveBeenCalledWith('session:user-1:session-hash-123');
  });
});
