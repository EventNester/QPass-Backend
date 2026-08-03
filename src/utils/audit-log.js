import prisma from "../database/index.js";
import logger from "../config/logger.js";

/**
 * Write an audit log entry. Best-effort: never throws and never blocks the
 * caller, so audit failures cannot break the primary operation.
 *
 * @param {Object} entry - Audit entry
 * @param {string|null} [entry.actorId] - User that performed the action
 * @param {string} entry.action - Action name, e.g. `EVENT_CREATED`
 * @param {string} entry.entity - Affected entity, e.g. `Event`
 * @param {string} entry.entityId - ID of the affected record
 * @param {Object} [entry.beforeSnapshot] - State before the change
 * @param {Object} [entry.afterSnapshot] - State after the change
 */
export async function writeAuditLog({
  actorId = null,
  action,
  entity,
  entityId,
  beforeSnapshot = null,
  afterSnapshot = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        ...(actorId ? { actorId } : {}),
        action,
        entity,
        entityId,
        ...(beforeSnapshot ? { beforeSnapshot } : {}),
        ...(afterSnapshot ? { afterSnapshot } : {}),
      },
    });
  } catch (err) {
    logger.warn(
      { err: err.message, action, entity, entityId },
      "Failed to write audit log"
    );
  }
}
