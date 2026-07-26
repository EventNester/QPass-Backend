import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  deleteEvent,
} from "../event.service.js";
import prisma from "../../../database/index.js";
import { NotFoundError, ForbiddenError } from "../../../utils/error.js";

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
    vi.clearAllMocks();
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
          ownerId: mockOwnerId,
        },
      });
    });
  });

  describe("getEvent", () => {
    test("should return an event by id", async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);

      const result = await getEvent("event_1");

      expect(result).toEqual(mockEvent);
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: "event_1", deletedAt: null },
      });
    });

    test("should throw NotFoundError if event does not exist", async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(getEvent("nonexistent")).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for soft-deleted events", async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(getEvent("event_1")).rejects.toThrow(NotFoundError);
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: "event_1", deletedAt: null },
      });
    });
  });

  describe("listEvents", () => {
    test("should return paginated non-deleted events", async () => {
      const events = [mockEvent, { ...mockEvent, id: "event_2", title: "Second Event" }];
      prisma.event.findMany.mockResolvedValue(events);
      prisma.event.count.mockResolvedValue(2);

      const result = await listEvents();

      expect(result.events).toEqual(events);
      expect(result.events).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
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

      const result = await listEvents();

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

    test("should throw NotFoundError for already soft-deleted events", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(deleteEvent("event_1", mockOwnerId)).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
