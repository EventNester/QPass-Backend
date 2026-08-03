import prisma from "../../database/index.js";
import { constants } from "../../config/index.js";

export async function listAuditLogs({
  page,
  limit,
  action,
  entity,
  actorId,
  from,
  to,
}) {
  const pageNum = page ?? constants.PAGINATION.DEFAULT_PAGE;
  const limitNum = limit ?? constants.PAGINATION.DEFAULT_LIMIT;
  const take = Math.min(limitNum, constants.PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * take;

  const where = {
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(actorId ? { actorId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [auditLogs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    auditLogs,
    pagination: {
      page: pageNum,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}
