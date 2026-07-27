import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { constants, systemMessages } from "../config/index.js";

const msg = systemMessages.ERROR.UPLOAD;

const uploadDir = join(process.cwd(), constants.UPLOAD.DIR);
mkdirSync(uploadDir, { recursive: true });

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

export function handleUploadError(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ status: "error", message: msg.TOO_LARGE });
    }
    return res.status(400).json({ status: "error", message: err.message });
  }

  if (err?.message === msg.INVALID_TYPE) {
    return res.status(415).json({ status: "error", message: msg.INVALID_TYPE });
  }

  next(err);
}

export async function cleanupOnError(err, req, _res, next) {
  if (err && req.file?.path) {
    await unlink(req.file.path).catch(() => {});
  }
  next(err);
}
