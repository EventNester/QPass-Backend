import { validateRows } from "./validation.utils.js";
import { extractRowsFromText } from "./text.parser.js";
import { systemMessages, logger } from "../../config/index.js";

// pdf-parse is a CJS-only package; we load it lazily via dynamic import
// to avoid the createRequire workaround that violates the project's ESM convention.
let pdfParse = null;

/**
 * Parses a PDF file buffer, extracts text, detects rows containing email
 * or phone patterns, and validates them.
 *
 * Uses line-by-line heuristic extraction via the shared text.parser helper.
 * Lines without a recognisable email or phone are silently skipped.
 *
 * @param {Buffer} buffer - The PDF file buffer.
 * @param {Object} [options] - Validation context passed through to validateRows.
 * @returns {Promise<Object>} { validRows: Array, errors: Array }
 */
export async function parsePDF(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      validRows: [],
      errors: [
        { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.INVALID_BUFFER },
      ],
    };
  }

  try {
    // Lazy-load pdf-parse on first call to keep module-level imports ESM-clean
    if (!pdfParse) {
      const mod = await import("pdf-parse");
      pdfParse = mod.default;
    }

    const data = await pdfParse(buffer);
    const records = extractRowsFromText(data.text);

    return validateRows(records, options);
  } catch (error) {
    logger.error({ err: error, fileType: "pdf" }, "PDF file parse failed");
    return {
      validRows: [],
      errors: [
        { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.PDF_PARSE_FAILED },
      ],
    };
  }
}
