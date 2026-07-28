import { describe, test, expect, vi, beforeEach } from "vitest";
import { scanQr, getCheckins, undoCheckin } from "../checkins.service.js";
import prisma from "../../../database/index.js";
import { ConflictError, NotFoundError } from "../../../utils/error.js";
import { constants, systemMessages } from "../../../config/index.js";

const errMsg = systemMessages.ERROR;
const successMsg = systemMessages.SUCCESS;

vi.mock("../../../database/index.js", () => ({
  default: {
    qrToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    checkIn: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const mRedisClient = {
  set: vi.fn(),
  del: vi.fn(),
};
vi.mock("../../../config/redis.js", () => ({
  getRedisClient: vi.fn(() => mRedisClient),
}));

vi.mock("../../../utils/crypto.js", () => ({
  hashToken: vi.fn((token) => `hashed_${token}`),
}));

describe("Checkin Service Tests", () => {
  const mockEventId = "event_1";
  const mockStaffId = "staff_1";
  const mockRegistrationId = "reg_1";
  const mockCheckInId = "checkin_1";

  const mockQrToken = {
    id: "qr_1",
    tokenHash: "hashed_token123",
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    revokedAt: null,
    scanCount: 0,
    registrationId: mockRegistrationId,
    registration: {
      id: mockRegistrationId,
      eventId: mockEventId,
      attendeeName: "John Doe",
      attendeeEmail: "john@example.com",
    },
  };

  const mockCheckin = {
    id: mockCheckInId,
    eventId: mockEventId,
    registrationId: mockRegistrationId,
    staffId: mockStaffId,
    result: constants.CHECKIN_RESULT.VALID,
    scannedAt: new Date(),
    deviceInfo: null,
    registration: {
      attendeeName: "John Doe",
      attendeeEmail: "john@example.com",
    },
    staff: {
      name: "Staff User",
      email: "staff@example.com",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scanQr", () => {
    test("should acquire Redis lock and release in finally", async () => {
      mRedisClient.set.mockResolvedValue("OK");
      prisma.qrToken.findUnique.mockResolvedValue(mockQrToken);
      prisma.checkIn.findUnique.mockResolvedValue(null);
      prisma.checkIn.create.mockResolvedValue(mockCheckin);
      prisma.qrToken.update.mockResolvedValue({ ...mockQrToken, scanCount: 1 });

      const result = await scanQr(mockEventId, { token: "token123" }, mockStaffId);

      expect(mRedisClient.set).toHaveBeenCalledWith(
        `scan:${mockEventId}:hashed_token123`,
        "1",
        "EX",
        10,
        "NX"
      );
      expect(mRedisClient.del).toHaveBeenCalledWith(`scan:${mockEventId}:hashed_token123`);
      expect(result.result).toBe(constants.CHECKIN_RESULT.VALID);
    });

    test("should throw ConflictError if scan already in progress", async () => {
      mRedisClient.set.mockResolvedValue(null);

      await expect(scanQr(mockEventId, { token: "token123" }, mockStaffId))
        .rejects.toThrow(ConflictError);
      await expect(scanQr(mockEventId, { token: "token123" }, mockStaffId))
        .rejects.toThrow(errMsg.CHECKIN.SCAN_IN_PROGRESS);
      expect(mRedisClient.del).not.toHaveBeenCalled();
    });

    test("should return INVALID if QR token not found", async () => {
      mRedisClient.set.mockResolvedValue("OK");
      prisma.qrToken.findUnique.mockResolvedValue(null);

      const result = await scanQr(mockEventId, { token: "bad_token" }, mockStaffId);

      expect(result.result).toBe(constants.CHECKIN_RESULT.INVALID);
      expect(result.message).toBe(errMsg.CHECKIN.INVALID_QR);
    });

    test("should return INVALID if QR token expired", async () => {
      mRedisClient.set.mockResolvedValue("OK");
      prisma.qrToken.findUnique.mockResolvedValue({
        ...mockQrToken,
        expiresAt: new Date("2020-01-01T00:00:00Z"),
      });

      const result = await scanQr(mockEventId, { token: "expired_token" }, mockStaffId);

      expect(result.result).toBe(constants.CHECKIN_RESULT.INVALID);
      expect(result.message).toBe(errMsg.CHECKIN.QR_EXPIRED);
    });

    test("should return INVALID if eventId does not match", async () => {
      mRedisClient.set.mockResolvedValue("OK");
      prisma.qrToken.findUnique.mockResolvedValue({
        ...mockQrToken,
        registration: { ...mockQrToken.registration, eventId: "other_event" },
      });

      const result = await scanQr(mockEventId, { token: "token123" }, mockStaffId);

      expect(result.result).toBe(constants.CHECKIN_RESULT.INVALID);
      expect(result.message).toBe(errMsg.CHECKIN.EVENT_MISMATCH);
    });

    test("should return DUPLICATE if already checked in", async () => {
      mRedisClient.set.mockResolvedValue("OK");
      prisma.qrToken.findUnique.mockResolvedValue(mockQrToken);
      prisma.checkIn.findUnique.mockResolvedValue(mockCheckin);

      const result = await scanQr(mockEventId, { token: "token123" }, mockStaffId);

      expect(result.result).toBe(constants.CHECKIN_RESULT.DUPLICATE);
      expect(result.message).toBe(errMsg.CHECKIN.DUPLICATE);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: mockStaffId,
          action: "DUPLICATE_SCAN",
          entity: "CheckIn",
          entityId: mockCheckInId,
          afterSnapshot: { tokenHash: "hashed_token123", attemptTime: expect.any(String) },
        },
      });
    });

    test("should create check-in successfully", async () => {
      mRedisClient.set.mockResolvedValue("OK");
      prisma.qrToken.findUnique.mockResolvedValue(mockQrToken);
      prisma.checkIn.findUnique.mockResolvedValue(null);
      prisma.checkIn.create.mockResolvedValue(mockCheckin);

      const result = await scanQr(mockEventId, { token: "token123", deviceInfo: "mobile" }, mockStaffId);

      expect(prisma.checkIn.create).toHaveBeenCalledWith({
        data: {
          eventId: mockEventId,
          registrationId: mockRegistrationId,
          staffId: mockStaffId,
          result: constants.CHECKIN_RESULT.VALID,
          deviceInfo: "mobile",
        },
        include: { registration: true },
      });
      expect(prisma.qrToken.update).toHaveBeenCalledWith({
        where: { id: mockQrToken.id },
        data: { scanCount: { increment: 1 }, revokedAt: expect.any(Date) },
      });
      expect(result.result).toBe(constants.CHECKIN_RESULT.VALID);
      expect(result.message).toBe(successMsg.CHECKIN.SUCCESS);
      expect(result.attendeeName).toBe("John Doe");
      expect(result.checkinId).toBe(mockCheckInId);
    });

    test("should release lock even if an error occurs", async () => {
      mRedisClient.set.mockResolvedValue("OK");
      prisma.qrToken.findUnique.mockRejectedValue(new Error("DB error"));

      await expect(scanQr(mockEventId, { token: "token123" }, mockStaffId))
        .rejects.toThrow("DB error");
      expect(mRedisClient.del).toHaveBeenCalled();
    });
  });

  describe("getCheckins", () => {
    test("should return checkins for an event", async () => {
      const checkins = [mockCheckin, { ...mockCheckin, id: "checkin_2" }];
      prisma.checkIn.findMany.mockResolvedValue(checkins);

      const result = await getCheckins(mockEventId);

      expect(result).toEqual(checkins);
      expect(prisma.checkIn.findMany).toHaveBeenCalledWith({
        where: { eventId: mockEventId },
        include: {
          registration: { select: { attendeeName: true, attendeeEmail: true } },
          staff: { select: { name: true, email: true } },
        },
        orderBy: { scannedAt: "desc" },
      });
    });

    test("should return empty array if no checkins", async () => {
      prisma.checkIn.findMany.mockResolvedValue([]);

      const result = await getCheckins(mockEventId);

      expect(result).toEqual([]);
    });
  });

  describe("undoCheckin", () => {
    test("should throw NotFoundError if checkin not found", async () => {
      prisma.checkIn.findUnique.mockResolvedValue(null);

      await expect(undoCheckin(mockEventId, "nonexistent", mockStaffId))
        .rejects.toThrow(NotFoundError);
      await expect(undoCheckin(mockEventId, "nonexistent", mockStaffId))
        .rejects.toThrow(errMsg.CHECKIN.NOT_FOUND);
    });

    test("should throw NotFoundError if checkin eventId does not match", async () => {
      prisma.checkIn.findUnique.mockResolvedValue({ ...mockCheckin, eventId: "other_event" });

      await expect(undoCheckin(mockEventId, mockCheckInId, mockStaffId))
        .rejects.toThrow(NotFoundError);
    });

    test("should undo checkin successfully with audit log and deletion in transaction", async () => {
      prisma.checkIn.findUnique.mockResolvedValue(mockCheckin);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await undoCheckin(mockEventId, mockCheckInId, mockStaffId);

      expect(prisma.$transaction).toHaveBeenCalledWith([
        prisma.auditLog.create({
          data: {
            actorId: mockStaffId,
            action: "UNDO_CHECKIN",
            entity: "CheckIn",
            entityId: mockCheckInId,
            beforeSnapshot: {
              eventId: mockCheckin.eventId,
              registrationId: mockCheckin.registrationId,
              result: mockCheckin.result,
              scannedAt: mockCheckin.scannedAt.toISOString(),
            },
          },
        }),
        prisma.checkIn.delete({ where: { id: mockCheckInId } }),
      ]);
      expect(result).toEqual({ success: true });
    });
  });
});
