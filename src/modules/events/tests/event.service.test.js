import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  deleteEvent,
} from "../event.service.js";
import prisma from "../../../database/index.js";
import { NotFoundError } from "../../../utils/error.js";

vi.mock("../../../database/index.js", () => ({
  default: {
    event: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
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
    test("should return all non-deleted events", async () => {
      const events = [mockEvent, { ...mockEvent, id: "event_2", title: "Second Event" }];
      prisma.event.findMany.mockResolvedValue(events);

      const result = await listEvents();

      expect(result).toEqual(events);
      expect(result).toHaveLength(2);
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { startTime: "asc" },
      });
    });

    test("should return an empty array when no events exist", async () => {
      prisma.event.findMany.mockResolvedValue([]);

      const result = await listEvents();

      expect(result).toEqual([]);
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

      await expect(
        updateEvent("nonexistent", { title: "Updated" }, mockOwnerId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError if caller is not the owner", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        updateEvent("event_1", { title: "Updated" }, "attacker_user")
      ).rejects.toThrow(NotFoundError);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", ownerId: "attacker_user", deletedAt: null },
        data: { title: "Updated" },
      });
    });

    test("should throw NotFoundError for soft-deleted events", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        updateEvent("event_1", { title: "Updated" }, mockOwnerId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteEvent", () => {
    test("should soft-delete and return the event when owner matches", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 1 });
      prisma.event.findFirst.mockResolvedValue({
        ...mockEvent,
        deletedAt: new Date(),
      });

      const result = await deleteEvent("event_1", mockOwnerId);

      expect(result).toBeDefined();
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", ownerId: mockOwnerId, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    test("should throw NotFoundError if event does not exist", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(deleteEvent("nonexistent", mockOwnerId)).rejects.toThrow(
        NotFoundError
      );
    });

    test("should throw NotFoundError if caller is not the owner", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        deleteEvent("event_1", "attacker_user")
      ).rejects.toThrow(NotFoundError);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event_1", ownerId: "attacker_user", deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    test("should throw NotFoundError for already soft-deleted events", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(deleteEvent("event_1", mockOwnerId)).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
