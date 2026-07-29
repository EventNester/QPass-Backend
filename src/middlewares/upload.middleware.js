import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { constants, systemMessages } from "../config/index.js";

const msg = systemMessages.ERROR.UPLOAD;

// Ensure the uploads directory exists at app startup. `recursive: true` avoids
// errors if the directory is already present.
// Use env var override if set, otherwise default to config constant. This allows
// serverless/ephemeral environments to redirect uploads to /tmp or a mounted volume.
const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), constants.UPLOAD.DIR);
mkdirSync(uploadDir, { recursive: true });

// Set for O(1) extension lookups during file filtering.
const ALLOWED_EXT = new Set(constants.UPLOAD.ALLOWED_EXTENSIONS);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return cb(new Error(msg.INVALID_TYPE));
  }
  cb(null, true);
}

// Multer instance scoped to attendee imports. Enforces a single file upload
// with no accompanying form fields (parts: 1, fields: 0).
export const uploadAttendees = multer({
  storage,
  limits: {
    fileSize: constants.UPLOAD.MAX_SIZE,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter,
});

// Multer-specific errors use distinct HTTP codes so the client can differentiate
// between size limits (413) and other multer failures (400). Non-multer errors
// with our INVALID_TYPE message are mapped to 415 Unsupported Media Type.
// All other errors are forwarded to the global error handler.
export function handleUploadError(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ status: "error", message: msg.TOO_LARGE });
    }
    return res.status(400).json({ status: "error", message: msg.GENERIC });
  }

  if (err?.message === msg.INVALID_TYPE) {
    return res.status(415).json({ status: "error", message: msg.INVALID_TYPE });
  }

  next(err);
}

export function requireFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ status: "error", message: msg.MISSING_FILE });
  }
  next();
}

// Cleans up the uploaded file when an error occurs upstream (e.g. validation
// failure after multer already wrote to disk). The `.catch(() => {})` swallows
// unlink errors (e.g. file already removed) to avoid masking the original error.
export async function cleanupOnError(err, req, _res, next) {
  if (err && req.file?.path) {
    await unlink(req.file.path).catch(() => {});
  }
  next(err);
}
