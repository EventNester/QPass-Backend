import mammoth from "mammoth";
import { validateRows, MAX_ROWS } from "./validation.utils.js";
import { extractRowsFromText } from "./text.parser.js";
import { systemMessages, logger } from "../../config/index.js";

/**
 * Parses a DOCX file buffer, extracts tables from HTML, and validates the rows.
 *
 * Primary strategy: mammoth converts the DOCX to HTML, then table rows are
 * extracted via tag-based parsing. Fallback: if no tables are found, raw text
 * is extracted and processed line-by-line using the shared text.parser helper.
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

    if (records.length > MAX_ROWS) {
      return {
        validRows: [],
        errors: [
          { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.ROW_LIMIT_EXCEEDED },
        ],
      };
    }

    // Fallback: if no tables found, extract raw text line-by-line like the PDF parser
    if (records.length === 0) {
      logger.info("No tables found in DOCX; falling back to raw text extraction");
      const rawTextResult = await mammoth.extractRawText({ buffer });
      const textRecords = extractRowsFromText(rawTextResult.value);

      if (textRecords.length > MAX_ROWS) {
        return {
          validRows: [],
          errors: [
            { row: 0, field: "file", error: systemMessages.ERROR.IMPORT.ROW_LIMIT_EXCEEDED },
          ],
        };
      }

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
 * Decodes HTML entities (named, decimal, and hex) in a string.
 *
 * @param {string} text - Text containing HTML entities.
 * @returns {string} Decoded text.
 */
function decodeHtmlEntities(text) {
  const NAMED_ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&nbsp;": "\u00A0",
    "&iexcl;": "\u00A1",
    "&cent;": "\u00A2",
    "&pound;": "\u00A3",
    "&curren;": "\u00A4",
    "&yen;": "\u00A5",
    "&brvbar;": "\u00A6",
    "&sect;": "\u00A7",
    "&uml;": "\u00A8",
    "&copy;": "\u00A9",
    "&ordf;": "\u00AA",
    "&laquo;": "\u00AB",
    "&not;": "\u00AC",
    "&shy;": "\u00AD",
    "&reg;": "\u00AE",
    "&macr;": "\u00AF",
    "&deg;": "\u00B0",
    "&plusmn;": "\u00B1",
    "&sup2;": "\u00B2",
    "&sup3;": "\u00B3",
    "&acute;": "\u00B4",
    "&micro;": "\u00B5",
    "&para;": "\u00B6",
    "&middot;": "\u00B7",
    "&cedil;": "\u00B8",
    "&sup1;": "\u00B9",
    "&ordm;": "\u00BA",
    "&raquo;": "\u00BB",
    "&frac14;": "\u00BC",
    "&frac12;": "\u00BD",
    "&frac34;": "\u00BE",
    "&iquest;": "\u00BF",
    "&times;": "\u00D7",
    "&divide;": "\u00F7",
    "&ndash;": "\u2013",
    "&mdash;": "\u2014",
    "&lsquo;": "\u2018",
    "&rsquo;": "\u2019",
    "&sbquo;": "\u201A",
    "&ldquo;": "\u201C",
    "&rdquo;": "\u201D",
    "&bdquo;": "\u201E",
    "&dagger;": "\u2020",
    "&Dagger;": "\u2021",
    "&bull;": "\u2022",
    "&hellip;": "\u2026",
    "&prime;": "\u2032",
    "&Prime;": "\u2033",
    "&euro;": "\u20AC",
    "&trade;": "\u2122",
    "&asymp;": "\u2248",
    "&ne;": "\u2260",
    "&le;": "\u2264",
    "&ge;": "\u2265",
    "&larr;": "\u2190",
    "&uarr;": "\u2191",
    "&rarr;": "\u2192",
    "&darr;": "\u2193",
  };

  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-f]+;/gi, (match) => NAMED_ENTITIES[match.toLowerCase()] || match);
}

/**
 * Extracts row objects from an HTML string containing tables.
 * Assumes the first <tr> in each table is the header row.
 *
 * Uses a counter-based tag scanner rather than regex alone to correctly
 * handle nested tags within cells (e.g. <b>, <i>, <br>).
 *
 * @param {string} html - HTML output from mammoth.convertToHtml().
 * @returns {Array<Object>} Array of row objects keyed by header values.
 */
function extractTableRowsFromHtml(html) {
  const records = [];

  // Step 1: locate each top-level <table> block using a depth counter
  const tableBlocks = [];
  let i = 0;
  while (i < html.length) {
    const tableStart = html.indexOf("<table", i);
    if (tableStart === -1) break;

    let depth = 0;
    let pos = tableStart;
    while (pos < html.length) {
      const nextOpen = html.indexOf("<table", pos + 1);
      const nextClose = html.indexOf("</table>", pos + 1);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 6;
      } else {
        if (depth === 0) {
          tableBlocks.push(html.slice(tableStart, nextClose + 8));
          i = nextClose + 8;
          break;
        }
        depth--;
        pos = nextClose + 8;
      }
    }

    if (depth !== 0) break;
  }

  // Step 2: extract rows from each table block
  for (const tableHtml of tableBlocks) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;

    let headers = [];
    let isFirstRow = true;

    while ((trMatch = trRegex.exec(tableHtml)) !== null) {
      const rowHtml = trMatch[1];
      const rowValues = [];

      // Extract each cell by matching <td...> and <th...> pairs
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        let cellContent = cellMatch[1];
        cellContent = decodeHtmlEntities(cellContent);
        cellContent = cellContent.replace(/<[^>]*>/g, "");
        rowValues.push(cellContent.trim());
      }

      if (rowValues.length === 0) continue;

      if (isFirstRow) {
        headers = rowValues;
        isFirstRow = false;
      } else {
        const record = {};
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j] || `column${j}`;
          record[header] = rowValues[j] || "";
        }
        records.push(record);
      }
    }
  }

  return records;
}
