import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("qrcode", () => ({
  default: {
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-png")),
  },
}));

vi.mock("../../../database/index.js", () => ({
  default: {
    qrToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { qrService } from "../qr.service.js";
import prisma from "../../../database/index.js";
import QRCode from "qrcode";

describe("QrService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateToken", () => {
    it("should generate a 64-char hex token and store the hash", async () => {
      prisma.qrToken.findUnique.mockResolvedValue(null);
      prisma.qrToken.create.mockResolvedValue({});

      const expiresAt = new Date("2026-08-01T00:00:00Z");
      const token = await qrService.generateToken("reg-1", expiresAt);

      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(prisma.qrToken.create).toHaveBeenCalledWith({
        data: {
          registrationId: "reg-1",
          tokenHash: expect.any(String),
          expiresAt,
        },
      });
    });

    it("should throw if a token already exists for the registration", async () => {
      prisma.qrToken.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        qrService.generateToken("reg-1", new Date())
      ).rejects.toThrow("QR token already exists for this registration");
    });

    it("should not call create if token already exists", async () => {
      prisma.qrToken.findUnique.mockResolvedValue({ id: "existing" });

      await qrService.generateToken("reg-1", new Date()).catch(() => {});
      expect(prisma.qrToken.create).not.toHaveBeenCalled();
    });
  });

  describe("validateToken", () => {
    it("should return the token record with registration when valid", async () => {
      const mockRecord = {
        id: "qr-1",
        tokenHash: "abc",
        expiresAt: new Date("2099-01-01"),
        revokedAt: null,
        registration: { id: "reg-1", attendeeName: "Ada" },
      };
      prisma.qrToken.findUnique.mockResolvedValue(mockRecord);

      const result = await qrService.validateToken("some-token");
      expect(result).toEqual(mockRecord);
    });

    it("should throw NotFoundError for an unknown token", async () => {
      prisma.qrToken.findUnique.mockResolvedValue(null);

      await expect(qrService.validateToken("unknown")).rejects.toThrow("Invalid QR token");
    });

    it("should throw if the token has expired", async () => {
      prisma.qrToken.findUnique.mockResolvedValue({
        id: "qr-1",
        expiresAt: new Date("2020-01-01"),
        revokedAt: null,
        registration: {},
      });

      await expect(qrService.validateToken("expired")).rejects.toThrow("QR token has expired");
    });

    it("should throw if the token has been revoked", async () => {
      prisma.qrToken.findUnique.mockResolvedValue({
        id: "qr-1",
        expiresAt: new Date("2099-01-01"),
        revokedAt: new Date(),
        registration: {},
      });

      await expect(qrService.validateToken("revoked")).rejects.toThrow("QR token has been revoked");
    });
  });

  describe("createQrImage", () => {
    it("should return a PNG buffer for a valid token", async () => {
      const buf = await qrService.createQrImage("abc123");
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.toString()).toBe("mock-png");
      expect(QRCode.toBuffer).toHaveBeenCalledWith("abc123", {
        width: 300,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    });

    it("should enforce minimum width of 200px", async () => {
      await qrService.createQrImage("abc123", { width: 100 });
      expect(QRCode.toBuffer).toHaveBeenCalledWith("abc123", expect.objectContaining({ width: 200 }));
    });

    it("should accept custom width and margin", async () => {
      await qrService.createQrImage("abc123", { width: 400, margin: 4 });
      expect(QRCode.toBuffer).toHaveBeenCalledWith("abc123", {
        width: 400,
        margin: 4,
        errorCorrectionLevel: "M",
      });
    });
  });
});
