import mammoth from "mammoth";
import { validateRows } from "./validation.utils.js";
import { extractRowsFromText } from "./text.parser.js";
import { systemMessages, logger } from "../../config/index.js";

/**
 * Parses a DOCX file buffer, extracts tables from HTML, and validates the rows.
 *
 * Primary strategy: mammoth converts the DOCX to HTML, then regex extracts
 * table rows. mammoth produces simple flat HTML without nested tables,
 * so regex extraction is sufficient for the expected DOCX table structures.
 *
 * Fallback: if no tables are found, raw text is extracted and processed
 * line-by-line using the shared text.parser helper (same heuristic as PDF).
 *
 * @param {Buffer} buffer - The DOCX file buffer.
 * @param {Object} [options] - Validation context passed through to validateRows.
 * @returns {Promise<Object>} { validRows: Array, errors: Array }
 */
export async function parseDOCX(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      validRows: [],
      errors: [
        { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.INVALID_BUFFER },
      ],
    };
  }

  try {
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;

    const records = extractTableRowsFromHtml(html);

    // Fallback: if no tables found, extract raw text line-by-line like the PDF parser
    if (records.length === 0) {
      logger.info("No tables found in DOCX; falling back to raw text extraction");
      const rawTextResult = await mammoth.extractRawText({ buffer });
      const textRecords = extractRowsFromText(rawTextResult.value);
      return validateRows(textRecords, options);
    }

    return validateRows(records, options);
  } catch (error) {
    logger.error({ err: error, fileType: "docx" }, "DOCX file parse failed");
    return {
      validRows: [],
      errors: [
        { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.DOCX_PARSE_FAILED },
      ],
    };
  }
}

/**
 * Extracts row objects from an HTML string containing a <table>.
 * Assumes the first <tr> is the header row.
 *
 * @param {string} html - HTML output from mammoth.convertToHtml().
 * @returns {Array<Object>} Array of row objects keyed by header values.
 */
function extractTableRowsFromHtml(html) {
  const records = [];

  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  let headers = [];
  let isFirstRow = true;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1];

    // Extract cells (<th> or <td>)
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    const rowValues = [];

    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      // Strip nested HTML tags and decode common HTML entities
      const cellText = tdMatch[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/gi, '"')
        .trim();
      rowValues.push(cellText);
    }

    if (rowValues.length === 0) continue;

    if (isFirstRow) {
      headers = rowValues;
      isFirstRow = false;
    } else {
      const record = {};
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i] || `column${i}`;
        record[header] = rowValues[i] || "";
      }
      records.push(record);
    }
  }

  return records;
}
