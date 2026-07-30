import { parseCsv } from './csv.js';
import { parseXlsx } from './xlsx.js';
import { parsePdf } from './pdf.js';
import { parseDocx } from './docx.js';
import { BadRequestError } from '../error.js';
import { systemMessages } from '../../config/index.js';

const msg = systemMessages.ERROR.UPLOAD;
const importMsg = systemMessages.ERROR.IMPORT;

const FORMAT_MAP = {
  '.csv': 'csv',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.pdf': 'pdf',
  '.docx': 'docx',
};

const MIME_MAP = {
  'text/csv': 'csv',
  'text/tab-separated-values': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
};

const MAX_IMPORT_ROWS = 1000;

function detectFormat(originalname) {
  if (!originalname) return null;
  const ext = originalname.toLowerCase().slice(originalname.lastIndexOf('.'));
  return FORMAT_MAP[ext] || null;
}

function detectMimeFormat(mimeType) {
  if (!mimeType) return null;
  return MIME_MAP[mimeType.toLowerCase()] || null;
}

export async function parseFile(buffer, originalname, fileType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new BadRequestError('Import file is empty');
  }

  const format = detectFormat(originalname);
  if (!format) {
    throw new BadRequestError(msg.INVALID_TYPE);
  }

  if (fileType) {
    const mimeFormat = detectMimeFormat(fileType);
    if (mimeFormat && mimeFormat !== format) {
      throw new BadRequestError(msg.INVALID_TYPE);
    }
  }

  let result;
  switch (format) {
    case 'csv':
      result = parseCsv(buffer, originalname);
      break;
    case 'xlsx':
      result = await parseXlsx(buffer, originalname);
      break;
    case 'pdf':
      result = await parsePdf(buffer, originalname);
      break;
    case 'docx':
      result = await parseDocx(buffer, originalname);
      break;
    default:
      throw new BadRequestError(msg.INVALID_TYPE);
  }

  if (result.rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ row: 0, field: null, error: importMsg.ROW_LIMIT_EXCEEDED }] };
  }

  return result;
}

export { parseCsv } from './csv.js';
export { parseXlsx } from './xlsx.js';
export { parsePdf } from './pdf.js';
export { parseDocx } from './docx.js';
