import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  deleteEvent,
  publishEvent,
  cancelEvent,
} from "../event.service.js";
import prisma from "../../../database/index.js";
import { writeAuditLog } from "../../../utils/audit-log.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../../utils/error.js";
import { constants } from "../../../config/index.js";

vi.mock("../../../utils/slug.js", () => ({
  generateSlug: vi.fn(() => "test-event-abc123"),
}));

vi.mock("../../../utils/audit-log.js", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("../../../database/index.js", () => ({
  default: {
    event: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("Event Service Tests", () => {
  const mockOwnerId = "user_1";

  const mockEvent = {
    id: "event_1",
    title: "Test Event",
    description: "A test event",
    venue: "Test Venue",
    startTime: new Date("2026-08-01T10:00:00Z"),
    endTime: new Date("2026-08-01T18:00:00Z"),
    ownerId: mockOwnerId,
    status: "DRAFT",
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEventData = {
    title: "Test Event",
    description: "A test event",
    venue: "Test Venue",
    startTime: new Date("2026-08-01T10:00:00Z"),
    endTime: new Date("2026-08-01T18:00:00Z"),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("createEvent", () => {
    test("should create and return a new event", async () => {
      prisma.event.create.mockResolvedValue(mockEvent);

      const result = await createEvent(mockEventData, mockOwnerId);

      expect(result).toEqual(mockEvent);
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: {
          title: mockEventData.title,
          description: mockEventData.description,
          venue: mockEventData.venue,
          startTime: mockEventData.startTime,
          endTime: mockEventData.endTime,
          slug: expect.any(String),
          ownerId: mockOwnerId,
        },
      });
    });

    test("should return before the audit log write completes (non-blocking)", async () => {
      let releaseAudit;
      const pendingAudit = new Promise((resolve) => {
        releaseAudit = resolve;
      });
      let auditResolved = false;
      pendingAudit.then(() => {
        auditResolved = true;
      });
      writeAuditLog.mockReturnValueOnce(pendingAudit);
      prisma.event.create.mockResolvedValue(mockEvent);

      const result = await createEvent(mockEventData, mockOwnerId);

      expect(result).toEqual(mockEvent);
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "EVENT_CREATED" })
      );
      expect(auditResolved).toBe(false);

      releaseAudit({ id: "audit_1" });
      await pendingAudit;
    });
  });

  describe("getEvent", () => {
    test("should return an event by id when caller is the owner", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      const result = await getEvent("event_1", mockOwnerId, "ORGANIZER");

      expect(result).toEqual(mockEvent);
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: "event_1", deletedAt: null },
      });
    });

    test("should allow ADMIN to view any event", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      const result = await getEvent("event_1", "admin_1", "ADMIN");

      expect(result).toEqual(mockEvent);
    });

    test("should throw ForbiddenError when caller is not the owner", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      await expect(getEvent("event_1", "attacker_user", "ORGANIZER")).rejects.toThrow(
        ForbiddenError
      );
    });

    test("should throw NotFoundError if event does not exist", async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(getEvent("nonexistent", mockOwnerId, "ORGANIZER")).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for soft-deleted events", async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(getEvent("event_1", mockOwnerId, "ORGANIZER")).rejects.toThrow(NotFoundError);
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: "event_1", deletedAt: null },
      });
    });
  });

  describe("listEvents", () => {
    test("should return paginated events for an organizer", async () => {
      const events = [mockEvent, { ...mockEvent, id: "event_2", title: "Second Event" }];
      prisma.event.findMany.mockResolvedValue(events);
      prisma.event.count.mockResolvedValue(2);

      const result = await listEvents(mockOwnerId, "ORGANIZER", { page: 1, limit: 20 });

      expect(result.events).toEqual(events);
      expect(result.events).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, ownerId: mockOwnerId },
        orderBy: { startTime: "asc" },
        skip: 0,
        take: 20,
      });
    });

    test("should filter events by status", async () => {
      prisma.event.findMany.mockResolvedValue([mockEvent]);
      prisma.event.count.mockResolvedValue(1);

      await listEvents(mockOwnerId, "ORGANIZER", { page: 1, limit: 20, status: "PUBLISHED" });

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, ownerId: mockOwnerId, status: "PUBLISHED" },
        orderBy: { startTime: "asc" },
        skip: 0,
        take: 20,
      });
      expect(prisma.event.count).toHaveBeenCalledWith({
        where: { deletedAt: null, ownerId: mockOwnerId, status: "PUBLISHED" },
      });
    });

    test("should return all non-deleted events for an admin", async () => {
      const events = [mockEvent];
      prisma.event.findMany.mockResolvedValue(events);
      prisma.event.count.mockResolvedValue(1);

      const result = await listEvents("admin_1", "ADMIN", {});

      expect(result.events).toEqual(events);
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { startTime: "asc" },
        skip: 0,
        take: 20,
      });
    });

    test("should return empty results when no events exist", async () => {
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      const result = await listEvents(mockOwnerId, "ORGANIZER", {});

      expect(result.events).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe("updateEvent", () => {
    test("should update and return the event when owner matches", async () => {
      const updatedData = { title: "Updated Event" };
      prisma.event.updateMany.mockResolvedValue({ count: 1 });
      prisma.event.findFirst.mockResolvedValue({ ...mockEvent, ...updatedData });

      const result = await updateEvent("event_1", updatedData, mockOwnerId);

      expect(result.title).toBe("Updated Event");
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", ownerId: mockOwnerId, deletedAt: null },
        data: updatedData,
      });
    });

    test("should throw NotFoundError if event does not exist", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        updateEvent("nonexistent", { title: "Updated" }, mockOwnerId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError if caller is not the owner", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      await expect(
        updateEvent("event_1", { title: "Updated" }, "attacker_user")
      ).rejects.toThrow(ForbiddenError);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", ownerId: "attacker_user", deletedAt: null },
        data: { title: "Updated" },
      });
    });

    test("should allow an ADMIN to update any event", async () => {
      const updatedData = { title: "Admin Updated" };
      prisma.event.updateMany.mockResolvedValue({ count: 1 });
      prisma.event.findFirst.mockResolvedValue({ ...mockEvent, ...updatedData });

      const result = await updateEvent("event_1", updatedData, "admin_1", "ADMIN");

      expect(result.title).toBe("Admin Updated");
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", deletedAt: null },
        data: updatedData,
      });
    });

    test("should throw NotFoundError for soft-deleted events", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        updateEvent("event_1", { title: "Updated" }, mockOwnerId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteEvent", () => {
    test("should soft-delete and return the event when owner matches", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 1 });

      const result = await deleteEvent("event_1", mockOwnerId);

      expect(result).toEqual({ id: "event_1" });
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", ownerId: mockOwnerId, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    test("should throw NotFoundError if event does not exist", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(deleteEvent("nonexistent", mockOwnerId)).rejects.toThrow(
        NotFoundError
      );
    });

    test("should throw ForbiddenError if caller is not the owner", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      await expect(
        deleteEvent("event_1", "attacker_user")
      ).rejects.toThrow(ForbiddenError);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", ownerId: "attacker_user", deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    test("should allow an ADMIN to delete any event", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 1 });

      const result = await deleteEvent("event_1", "admin_1", "ADMIN");

      expect(result).toEqual({ id: "event_1" });
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    test("should throw NotFoundError for already soft-deleted events", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(deleteEvent("event_1", mockOwnerId)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe("publishEvent", () => {
    test("should publish a draft event and preserve its slug", async () => {
      const publishedEvent = {
        ...mockEvent,
        status: constants.EVENT_STATUS.PUBLISHED,
        publishedAt: new Date(),
      };

      prisma.event.findFirst
        .mockResolvedValueOnce(mockEvent)
        .mockResolvedValueOnce(publishedEvent);
      prisma.event.updateMany.mockResolvedValue({ count: 1 });

      const result = await publishEvent("event_1", mockOwnerId);

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: {
          id: "event_1",
          ownerId: mockOwnerId,
          deletedAt: null,
          status: constants.EVENT_STATUS.DRAFT,
        },
        data: {
          status: constants.EVENT_STATUS.PUBLISHED,
          publishedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(publishedEvent);
    });

    test.each([
      constants.EVENT_STATUS.PUBLISHED,
      constants.EVENT_STATUS.CANCELLED,
      constants.EVENT_STATUS.ACTIVE,
      constants.EVENT_STATUS.COMPLETED,
    ])("should reject publish when status is %s", async (status) => {
      prisma.event.findFirst.mockResolvedValueOnce({ ...mockEvent, status });

      await expect(publishEvent("event_1", mockOwnerId)).rejects.toThrow(
        /Event is not in draft status \(current: /
      );
    });

    test("should throw NotFoundError when event does not exist", async () => {
      prisma.event.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(publishEvent("nonexistent", mockOwnerId)).rejects.toThrow(
        NotFoundError
      );
    });

    test("should throw ForbiddenError when caller is not the owner", async () => {
      prisma.event.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockEvent);

      await expect(
        publishEvent("event_1", "attacker_user")
      ).rejects.toThrow(ForbiddenError);
    });

    test("should allow an ADMIN to publish any draft event", async () => {
      const publishedEvent = {
        ...mockEvent,
        status: constants.EVENT_STATUS.PUBLISHED,
        publishedAt: new Date(),
      };

      prisma.event.findFirst
        .mockResolvedValueOnce(mockEvent)
        .mockResolvedValueOnce(publishedEvent);
      prisma.event.updateMany.mockResolvedValue({ count: 1 });

      const result = await publishEvent("event_1", "admin_1", "ADMIN");

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: {
          id: "event_1",
          deletedAt: null,
          status: constants.EVENT_STATUS.DRAFT,
        },
        data: {
          status: constants.EVENT_STATUS.PUBLISHED,
          publishedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(publishedEvent);
    });
  });

  describe("cancelEvent", () => {
    test("should cancel a published event", async () => {
      const publishedEvent = {
        ...mockEvent,
        status: constants.EVENT_STATUS.PUBLISHED,
      };
      const cancelledEvent = {
        ...mockEvent,
        status: constants.EVENT_STATUS.CANCELLED,
      };

      prisma.event.findFirst
        .mockResolvedValueOnce(publishedEvent)
        .mockResolvedValueOnce(cancelledEvent);
      prisma.event.updateMany.mockResolvedValue({ count: 1 });

      const result = await cancelEvent("event_1", mockOwnerId);

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: {
          id: "event_1",
          ownerId: mockOwnerId,
          deletedAt: null,
          status: {
            in: [
              constants.EVENT_STATUS.PUBLISHED,
              constants.EVENT_STATUS.ACTIVE,
              constants.EVENT_STATUS.COMPLETED,
            ],
          },
        },
        data: {
          status: constants.EVENT_STATUS.CANCELLED,
        },
      });
      expect(result).toEqual(cancelledEvent);
    });

    test("should reject cancelling an already cancelled event", async () => {
      prisma.event.findFirst.mockResolvedValueOnce({
        ...mockEvent,
        status: constants.EVENT_STATUS.CANCELLED,
      });

      await expect(cancelEvent("event_1", mockOwnerId)).rejects.toThrow(
        ValidationError
      );
    });

    test("should reject cancelling a draft event", async () => {
      prisma.event.findFirst.mockResolvedValueOnce(mockEvent);

      await expect(cancelEvent("event_1", mockOwnerId)).rejects.toThrow(
        ValidationError
      );
    });

    test("should throw NotFoundError when event does not exist", async () => {
      prisma.event.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(cancelEvent("nonexistent", mockOwnerId)).rejects.toThrow(
        NotFoundError
      );
    });

    test("should throw ForbiddenError when caller is not the owner", async () => {
      prisma.event.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockEvent);

      await expect(
        cancelEvent("event_1", "attacker_user")
      ).rejects.toThrow(ForbiddenError);
    });

    test("should allow an ADMIN to cancel any event", async () => {
      const publishedEvent = {
        ...mockEvent,
        status: constants.EVENT_STATUS.PUBLISHED,
      };
      const cancelledEvent = {
        ...mockEvent,
        status: constants.EVENT_STATUS.CANCELLED,
      };

      prisma.event.findFirst
        .mockResolvedValueOnce(publishedEvent)
        .mockResolvedValueOnce(cancelledEvent);
      prisma.event.updateMany.mockResolvedValue({ count: 1 });

      const result = await cancelEvent("event_1", "admin_1", "ADMIN");

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: {
          id: "event_1",
          deletedAt: null,
          status: {
            in: [
              constants.EVENT_STATUS.PUBLISHED,
              constants.EVENT_STATUS.ACTIVE,
              constants.EVENT_STATUS.COMPLETED,
            ],
          },
        },
        data: {
          status: constants.EVENT_STATUS.CANCELLED,
        },
      });
      expect(result).toEqual(cancelledEvent);
    });
  });
});
