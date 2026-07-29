import { parse } from "csv-parse/sync";
import { validateRows, MAX_ROWS } from "./validation.utils.js";
import { systemMessages, logger } from "../../config/index.js";

/**
 * Parses a CSV file buffer and validates the rows.
 *
 * @param {Buffer} buffer - The CSV file buffer.
 * @param {Object} [options] - Validation context passed through to validateRows.
 * @returns {Object} { validRows: Array, errors: Array }
 */
export function parseCSV(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      validRows: [],
      errors: [
        { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.INVALID_BUFFER },
      ],
    };
  }

  try {
    const records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length > MAX_ROWS) {
      return {
        validRows: [],
        errors: [
          { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.ROW_LIMIT_EXCEEDED },
        ],
      };
    }

    return validateRows(records, options);
  } catch (error) {
    logger.error({ err: error, fileType: "csv" }, "CSV file parse failed");
    return {
      validRows: [],
      errors: [
        { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.CSV_PARSE_FAILED },
      ],
    };
  }
}
