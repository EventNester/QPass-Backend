import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import multer from "multer";
import http from "node:http";
import express from "express";

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

import { handleUploadError, cleanupOnError, requireFile, uploadAttendees } from "../upload.middleware.js";

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

  describe("uploadAttendees (end-to-end)", () => {
    let server;

    const BOUNDARY = "----QPassTestBoundary7MA4YWxk";

    const buildMultipart = ({ fileContent, extraField }) => {
      let body = "";
      if (extraField) {
        body += `--${BOUNDARY}\r\n`;
        body += 'Content-Disposition: form-data; name="note"\r\n\r\n';
        body += `${extraField}\r\n`;
      }
      body += `--${BOUNDARY}\r\n`;
      body += 'Content-Disposition: form-data; name="file"; filename="attendees.csv"\r\n';
      body += "Content-Type: text/csv\r\n\r\n";
      body += `${fileContent}\r\n`;
      body += `--${BOUNDARY}--\r\n`;
      return body;
    };

    const postMultipart = (body) =>
      new Promise((resolve, reject) => {
        const payload = Buffer.from(body, "utf8");
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port: server.address().port,
            path: "/upload",
            method: "POST",
            headers: {
              "Content-Type": `multipart/form-data; boundary=${BOUNDARY}`,
              "Content-Length": payload.length,
            },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => resolve({ status: res.statusCode, body: data }));
          }
        );
        req.on("error", reject);
        req.end(payload);
      });

    beforeAll(async () => {
      const app = express();
      app.post(
        "/upload",
        uploadAttendees.single("file"),
        (req, res) =>
          res
            .status(200)
            .json({ name: req.file.originalname, hasPath: Boolean(req.file.path) }),
        handleUploadError
      );
      app.use((err, _req, res, _next) => {
        res.status(500).json({ name: err.name, code: err.code });
      });
      server = await new Promise((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
      });
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it("accepts a single file part (regression: parts limit off-by-one)", async () => {
      const body = buildMultipart({ fileContent: "Name,Email\nAda,ada@example.com" });
      const { status, body: resBody } = await postMultipart(body);
      expect(status).toBe(200);
      expect(resBody).toContain('"name":"attendees.csv"');
      expect(resBody).toContain('"hasPath":true');
    });

    it("rejects a form field accompanying the file", async () => {
      const body = buildMultipart({
        fileContent: "Name,Email\nAda,ada@example.com",
        extraField: "unexpected",
      });
      const { status } = await postMultipart(body);
      expect(status).toBe(400);
    });
  });
});
