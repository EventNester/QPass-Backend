import { describe, test, expect, vi, beforeEach } from "vitest";
import { getOverviewStats } from "../analytics.service.js";
import prisma from "../../../database/index.js";
import { ForbiddenError } from "../../../utils/error.js";
import { constants, systemMessages } from "../../../config/index.js";

const errMsg = systemMessages.ERROR;

vi.mock("../../../database/index.js", () => ({
  default: {
    event: { count: vi.fn() },
    registration: { count: vi.fn() },
    user: { count: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

describe("Analytics Service Tests", () => {
  const mockAdminId = "admin_1";
  const mockOrganizerId = "organizer_1";

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.count.mockResolvedValue(0);
    prisma.registration.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
  });

  test("returns system-wide totals for an ADMIN without a scope", async () => {
    prisma.event.count.mockResolvedValueOnce(12).mockResolvedValueOnce(9);
    prisma.registration.count.mockResolvedValue(412);
    prisma.$queryRaw.mockResolvedValue([{ count: 340 }]);
    prisma.user.count.mockResolvedValue(150);

    const result = await getOverviewStats(mockAdminId, constants.ROLES.ADMIN, {});

    expect(result).toEqual({
      totalEvents: 12,
      publishedEvents: 9,
      totalAttendees: 340,
      totalRegistrations: 412,
      registeredUsers: 150,
    });
    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { deletedAt: null },
    });
  });

  test("restricts a non-ADMIN to their own events by default", async () => {
    prisma.event.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: 7 }])
      .mockResolvedValueOnce([{ count: 5 }]);

    const result = await getOverviewStats(mockOrganizerId, constants.ROLES.ORGANIZER, {});

    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { deletedAt: null, ownerId: mockOrganizerId },
    });
    expect(prisma.registration.count).toHaveBeenCalledWith({
      where: { event: { deletedAt: null, ownerId: mockOrganizerId }, status: { not: "CANCELLED" } },
    });
    expect(result.totalAttendees).toBe(7);
    expect(result.registeredUsers).toBe(5);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  test("throws ForbiddenError when a non-ADMIN requests the system scope", async () => {
    await expect(
      getOverviewStats(mockOrganizerId, constants.ROLES.ORGANIZER, { scope: "system" })
    ).rejects.toThrow(ForbiddenError);
    await expect(
      getOverviewStats(mockOrganizerId, constants.ROLES.ORGANIZER, { scope: "system" })
    ).rejects.toThrow(errMsg.AUTH.FORBIDDEN);
  });

  test("allows an ADMIN to force the organizer-scoped view", async () => {
    prisma.event.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: 7 }])
      .mockResolvedValueOnce([{ count: 5 }]);

    const result = await getOverviewStats(mockAdminId, constants.ROLES.ADMIN, { scope: "own" });

    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { deletedAt: null, ownerId: mockAdminId },
    });
    expect(result.registeredUsers).toBe(5);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  test("scopes registeredUsers to the organizer's events for a non-ADMIN", async () => {
    prisma.event.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: 340 }])
      .mockResolvedValueOnce([{ count: 42 }]);

    const result = await getOverviewStats(mockOrganizerId, constants.ROLES.ORGANIZER, {});

    expect(result.totalAttendees).toBe(340);
    expect(result.registeredUsers).toBe(42);
    expect(prisma.user.count).not.toHaveBeenCalled();

    // The registeredUsers raw query must stay scoped to the caller's own events.
    const registeredUsersSql = prisma.$queryRaw.mock.calls[1][0].join("?");
    expect(registeredUsersSql).toContain("e.owner_id");
    expect(prisma.$queryRaw.mock.calls[1][1]).toBe(mockOrganizerId);
  });

  test("counts distinct attendee emails via the raw query result", async () => {
    prisma.event.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prisma.$queryRaw.mockResolvedValue([{ count: 4 }]);

    const result = await getOverviewStats(mockOrganizerId, constants.ROLES.ORGANIZER, {});

    expect(result.totalAttendees).toBe(4);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  test("defaults totalAttendees to zero when the raw query returns no rows", async () => {
    prisma.event.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await getOverviewStats(mockOrganizerId, constants.ROLES.ORGANIZER, {});

    expect(result.totalAttendees).toBe(0);
  });
});
