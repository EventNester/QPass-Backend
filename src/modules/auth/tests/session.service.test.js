import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashToken } from '../../../utils/crypto.js';

const mRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  getdel: vi.fn(),
  scan: vi.fn(),
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
  consumeSession,
  deleteSession,
  listSessions,
  revokeSession,
  revokeAllSessions,
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

  it('consumeSession removes the session key atomically and returns true', async () => {
    mRedis.getdel.mockResolvedValue('{"userAgent":null}');

    const consumed = await consumeSession('user-1', 'refresh-token-abc');

    expect(consumed).toBe(true);
    expect(mRedis.getdel).toHaveBeenCalledWith(
      `session:user-1:${hashToken('refresh-token-abc')}`
    );
  });

  it('consumeSession returns false when the session is already gone', async () => {
    mRedis.getdel.mockResolvedValue(null);

    const consumed = await consumeSession('user-1', 'refresh-token-abc');

    expect(consumed).toBe(false);
  });

  it('consumeSession returns false on Redis error', async () => {
    mRedis.getdel.mockRejectedValue(new Error('redis down'));

    const consumed = await consumeSession('user-1', 'refresh-token-abc');

    expect(consumed).toBe(false);
  });

  it('deleteSession removes the session key', async () => {
    await deleteSession('user-1', 'refresh-token-abc');

    expect(mRedis.del).toHaveBeenCalledWith(`session:user-1:${hashToken('refresh-token-abc')}`);
  });

  it('listSessions returns parsed sessions newest first', async () => {
    mRedis.scan.mockResolvedValue(['0', ['session:user-1:aaa', 'session:user-1:bbb']]);
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
    mRedis.scan.mockResolvedValue(['0', ['session:user-1:ccc']]);
    mRedis.get.mockResolvedValue('not-json');

    const sessions = await listSessions('user-1');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('ccc');
    expect(sessions[0].userAgent).toBeNull();
  });

  it('listSessions iterates SCAN until the cursor returns to zero', async () => {
    mRedis.scan
      .mockResolvedValueOnce(['17', ['session:user-1:aaa']])
      .mockResolvedValueOnce(['0', ['session:user-1:bbb']]);
    mRedis.get.mockResolvedValue(JSON.stringify({}));

    const sessions = await listSessions('user-1');

    expect(sessions).toHaveLength(2);
    expect(mRedis.scan).toHaveBeenCalledTimes(2);
  });

  it('listSessions returns an empty list on Redis error', async () => {
    mRedis.scan.mockRejectedValue(new Error('redis down'));

    const sessions = await listSessions('user-1');

    expect(sessions).toEqual([]);
  });

  it('revokeSession removes the session key', async () => {
    await revokeSession('user-1', 'session-hash-123');

    expect(mRedis.del).toHaveBeenCalledWith('session:user-1:session-hash-123');
  });

  it('revokeAllSessions deletes every session but the excluded one', async () => {
    mRedis.scan.mockResolvedValue(['0', ['session:user-1:keep', 'session:user-1:drop']]);

    await revokeAllSessions('user-1', 'keep');

    expect(mRedis.del).toHaveBeenCalledWith('session:user-1:drop');
    expect(mRedis.del).not.toHaveBeenCalledWith('session:user-1:keep');
  });
});
