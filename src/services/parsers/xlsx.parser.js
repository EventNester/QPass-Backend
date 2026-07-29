import * as XLSX from "xlsx";
import { validateRows } from "./validation.utils.js";
import { systemMessages, logger } from "../../config/index.js";

/**
 * Parses an XLSX file buffer and validates the rows.
 * Only the first worksheet is processed; a warning is logged if multiple
 * sheets are present so the caller is aware that data from other sheets
 * was ignored.
 *
 * @param {Buffer} buffer - The XLSX file buffer.
 * @param {Object} [options] - Validation context passed through to validateRows.
 * @returns {Object} { validRows: Array, errors: Array }
 */
export function parseXLSX(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      validRows: [],
      errors: [
        { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.INVALID_BUFFER },
      ],
    };
  }

  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    if (!workbook.SheetNames.length) {
      return {
        validRows: [],
        errors: [
          { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.NO_WORKSHEETS },
        ],
      };
    }

    if (workbook.SheetNames.length > 1) {
      logger.warn(
        { sheetCount: workbook.SheetNames.length, sheetsIgnored: workbook.SheetNames.slice(1) },
        "XLSX file has multiple sheets; only the first sheet will be processed"
      );
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const records = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
    return validateRows(records, options);
  } catch (error) {
    logger.error({ err: error, fileType: "xlsx" }, "XLSX file parse failed");
    return {
      validRows: [],
      errors: [
        { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.XLSX_PARSE_FAILED },
      ],
    };
  }
}
