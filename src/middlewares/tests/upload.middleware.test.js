import { describe, it, expect, vi, beforeEach } from "vitest";
import multer from "multer";

// vi.hoisted ensures the mock is created before any imported modules execute,
// which is required when mocking node built-ins used at import time.
const { mockUnlink } = vi.hoisted(() => ({
  mockUnlink: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("node:fs/promises", () => ({ unlink: mockUnlink }));

vi.mock("../../config/index.js", () => ({
  constants: {
    UPLOAD: {
      MAX_SIZE: 5 * 1024 * 1024,
      ALLOWED_EXTENSIONS: [".csv", ".xlsx", ".pdf", ".docx"],
      DIR: "uploads",
    },
  },
  systemMessages: {
    ERROR: {
      UPLOAD: {
        MISSING_FILE: "No file uploaded",
        INVALID_TYPE: "Invalid file type. Allowed formats: CSV, XLSX, PDF, DOCX",
        TOO_LARGE: "File exceeds the 5MB size limit",
        GENERIC: "File upload failed",
      },
    },
  },
}));

import { handleUploadError, cleanupOnError, requireFile } from "../upload.middleware.js";

describe("upload.middleware", () => {
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  describe("handleUploadError", () => {
    it("should return 413 for file too large", () => {
      const err = new multer.MulterError("LIMIT_FILE_SIZE");
      handleUploadError(err, {}, res, next);
      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith({
        status: "error",
        message: "File exceeds the 5MB size limit",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 400 for unexpected file field", () => {
      const err = new multer.MulterError("LIMIT_UNEXPECTED_FILE");
      handleUploadError(err, {}, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: "error",
        message: "File upload failed",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 415 for invalid file type", () => {
      const err = new Error("Invalid file type. Allowed formats: CSV, XLSX, PDF, DOCX");
      handleUploadError(err, {}, res, next);
      expect(res.status).toHaveBeenCalledWith(415);
      expect(res.json).toHaveBeenCalledWith({
        status: "error",
        message: "Invalid file type. Allowed formats: CSV, XLSX, PDF, DOCX",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next for non-upload errors", () => {
      const err = new Error("something else");
      handleUploadError(err, {}, res, next);
      expect(next).toHaveBeenCalledWith(err);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("cleanupOnError", () => {
    it("should call unlink with the file path on error", async () => {
      const err = new multer.MulterError("LIMIT_FILE_SIZE");
      const req = { file: { path: "/tmp/test.csv" } };
      await cleanupOnError(err, req, res, next);
      expect(mockUnlink).toHaveBeenCalledWith("/tmp/test.csv");
      expect(next).toHaveBeenCalledWith(err);
    });

    it("should not call unlink when no file on req", async () => {
      const err = new Error("fail");
      await cleanupOnError(err, {}, res, next);
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(err);
    });

    it("should call next even if unlink fails", async () => {
      mockUnlink.mockRejectedValueOnce(new Error("ENOENT"));
      const err = new Error("fail");
      const req = { file: { path: "/tmp/missing.csv" } };
      await cleanupOnError(err, req, res, next);
      expect(mockUnlink).toHaveBeenCalledWith("/tmp/missing.csv");
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe("requireFile", () => {
    it("should return 400 when no file on request", () => {
      requireFile({}, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: "error",
        message: "No file uploaded",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next when file is present", () => {
      const req = { file: { path: "/tmp/test.csv" } };
      requireFile(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
