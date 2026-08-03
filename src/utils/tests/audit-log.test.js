import { describe, it, expect, vi } from 'vitest';

vi.mock('../../database/index.js', () => ({
  default: {
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../config/logger.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import prisma from '../../database/index.js';
import { writeAuditLog } from '../audit-log.js';

describe('writeAuditLog', () => {
  it('creates an audit entry with snapshots', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'log-1' });

    await writeAuditLog({
      actorId: 'user-1',
      action: 'EVENT_CREATED',
      entity: 'Event',
      entityId: 'event-1',
      afterSnapshot: { title: 'Launch' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'EVENT_CREATED',
        entity: 'Event',
        entityId: 'event-1',
        afterSnapshot: { title: 'Launch' },
      },
    });
  });

  it('omits optional fields when not provided', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'log-2' });

    await writeAuditLog({ action: 'EVENT_DELETED', entity: 'Event', entityId: 'event-2' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { action: 'EVENT_DELETED', entity: 'Event', entityId: 'event-2' },
    });
  });

  it('does not throw when the write fails', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      writeAuditLog({ action: 'X', entity: 'Y', entityId: '1' })
    ).resolves.toBeUndefined();
  });
});
