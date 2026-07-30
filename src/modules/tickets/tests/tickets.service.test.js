import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError } from "../../../utils/error.js";

vi.mock("../../../database/index.js", () => ({
  default: {
    event: {
      findUnique: vi.fn(),
    },
    ticketType: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  },
}));

import prisma from "../../../database/index.js";

describe("TicketType Service (unit)", () => {
  const mockUserId = "user_1";
  const mockEventId = "event_1";
  const mockTicketTypeId = "tt_1";

  const mockEvent = {
    id: mockEventId,
    ownerId: mockUserId,
    deletedAt: null,
  };

  const mockTicketType = {
    id: mockTicketTypeId,
    eventId: mockEventId,
    name: "VIP",
    description: "VIP access",
    price: 5000,
    capacity: 100,
    quantitySold: 0,
    active: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findUnique.mockResolvedValue(mockEvent);
  });

  function loadModule() {
    return import("../tickets.service.js");
  }

  describe("createTicketType", () => {
    it("should create a ticket type with auto-incremented sortOrder", async () => {
      prisma.ticketType.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      prisma.ticketType.create.mockResolvedValue(mockTicketType);

      const { createTicketType } = await loadModule();
      const result = await createTicketType(mockEventId, mockUserId, {
        name: "VIP",
        price: 5000,
      });

      expect(result).toEqual(mockTicketType);
      expect(prisma.ticketType.create).toHaveBeenCalledWith({
        data: {
          eventId: mockEventId,
          name: "VIP",
          price: 5000,
          sortOrder: 3,
        },
      });
    });

    it("should start sortOrder at 0 when no existing ticket types", async () => {
      prisma.ticketType.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prisma.ticketType.create.mockResolvedValue(mockTicketType);

      const { createTicketType } = await loadModule();
      await createTicketType(mockEventId, mockUserId, { name: "VIP", price: 5000 });

      expect(prisma.ticketType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 0 }),
        })
      );
    });

    it("should retry on P2002 (unique constraint) up to 3 times", async () => {
      prisma.ticketType.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      prisma.$transaction
        .mockRejectedValueOnce({ code: "P2002" })
        .mockRejectedValueOnce({ code: "P2002" })
        .mockResolvedValueOnce(mockTicketType);

      const { createTicketType } = await loadModule();
      const result = await createTicketType(mockEventId, mockUserId, { name: "VIP", price: 5000 });

      expect(result).toEqual(mockTicketType);
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it("should throw on non-P2002 error without retry", async () => {
      prisma.ticketType.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      prisma.$transaction.mockRejectedValue(new Error("DB down"));

      const { createTicketType } = await loadModule();
      await expect(
        createTicketType(mockEventId, mockUserId, { name: "VIP", price: 5000 })
      ).rejects.toThrow("DB down");
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("should throw ForbiddenError if user is not the event owner", async () => {
      prisma.event.findUnique.mockResolvedValue({ ...mockEvent, ownerId: "other_user" });

      const { createTicketType } = await loadModule();
      await expect(
        createTicketType(mockEventId, mockUserId, { name: "VIP", price: 5000 })
      ).rejects.toThrow(ForbiddenError);
    });

    it("should throw NotFoundError if event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      const { createTicketType } = await loadModule();
      await expect(
        createTicketType(mockEventId, mockUserId, { name: "VIP", price: 5000 })
      ).rejects.toThrow("Event not found");
    });
  });

  describe("getTicketTypes", () => {
    it("should return ticket types ordered by sortOrder", async () => {
      const types = [
        { ...mockTicketType, id: "tt_1", sortOrder: 0 },
        { ...mockTicketType, id: "tt_2", name: "General", sortOrder: 1 },
      ];
      prisma.ticketType.findMany.mockResolvedValue(types);

      const { getTicketTypes } = await loadModule();
      const result = await getTicketTypes(mockEventId, mockUserId);

      expect(result).toEqual(types);
      expect(prisma.ticketType.findMany).toHaveBeenCalledWith({
        where: { eventId: mockEventId },
        orderBy: { sortOrder: "asc" },
      });
    });

    it("should throw ForbiddenError if user is not the event owner", async () => {
      prisma.event.findUnique.mockResolvedValue({ ...mockEvent, ownerId: "other_user" });

      const { getTicketTypes } = await loadModule();
      await expect(getTicketTypes(mockEventId, mockUserId)).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateTicketType", () => {
    it("should update and return the ticket type", async () => {
      prisma.ticketType.findFirst.mockResolvedValue(mockTicketType);
      const updated = { ...mockTicketType, name: "VVIP" };
      prisma.ticketType.update.mockResolvedValue(updated);

      const { updateTicketType } = await loadModule();
      const result = await updateTicketType(mockEventId, mockTicketTypeId, mockUserId, {
        name: "VVIP",
      });

      expect(result).toEqual(updated);
      expect(prisma.ticketType.update).toHaveBeenCalledWith({
        where: { id: mockTicketTypeId },
        data: { name: "VVIP" },
      });
    });

    it("should throw NotFoundError if ticket type does not exist", async () => {
      prisma.ticketType.findFirst.mockResolvedValue(null);

      const { updateTicketType } = await loadModule();
      await expect(
        updateTicketType(mockEventId, mockTicketTypeId, mockUserId, { name: "VVIP" })
      ).rejects.toThrow("Resource not found");
    });

    it("should throw ForbiddenError if user is not the event owner", async () => {
      prisma.event.findUnique.mockResolvedValue({ ...mockEvent, ownerId: "other_user" });

      const { updateTicketType } = await loadModule();
      await expect(
        updateTicketType(mockEventId, mockTicketTypeId, mockUserId, { name: "VVIP" })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteTicketType", () => {
    it("should delete a ticket type", async () => {
      prisma.ticketType.findFirst.mockResolvedValue(mockTicketType);
      prisma.$transaction.mockImplementation(async (fn) => fn(prisma));

      const { deleteTicketType } = await loadModule();
      const result = await deleteTicketType(mockEventId, mockTicketTypeId, mockUserId);

      expect(result).toBe(true);
      expect(prisma.ticketType.delete).toHaveBeenCalledWith({
        where: { id: mockTicketTypeId },
      });
    });

    it("should throw NotFoundError if ticket type does not exist", async () => {
      prisma.ticketType.findFirst.mockResolvedValue(null);

      const { deleteTicketType } = await loadModule();
      await expect(
        deleteTicketType(mockEventId, mockTicketTypeId, mockUserId)
      ).rejects.toThrow("Resource not found");
    });

    it("should throw ConflictError if ticket type has registrations", async () => {
      prisma.ticketType.findFirst.mockResolvedValue(mockTicketType);
      prisma.ticketType.delete.mockRejectedValue({ code: "P2003" });

      const { deleteTicketType } = await loadModule();
      await expect(
        deleteTicketType(mockEventId, mockTicketTypeId, mockUserId)
      ).rejects.toThrow("Cannot delete ticket type with existing registrations");
    });

    it("should throw ForbiddenError if user is not the event owner", async () => {
      prisma.event.findUnique.mockResolvedValue({ ...mockEvent, ownerId: "other_user" });

      const { deleteTicketType } = await loadModule();
      await expect(
        deleteTicketType(mockEventId, mockTicketTypeId, mockUserId)
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
