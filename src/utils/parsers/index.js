import { parseCsv } from './csv.js';
import { parseXlsx } from './xlsx.js';
import { parsePdf } from './pdf.js';
import { parseDocx } from './docx.js';
import { BadRequestError } from '../error.js';
import { systemMessages } from '../../config/index.js';

const msg = systemMessages.ERROR.UPLOAD;

const FORMAT_MAP = {
  '.csv': 'csv',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.pdf': 'pdf',
  '.docx': 'docx',
};

function detectFormat(originalname) {
  if (!originalname) return null;
  const ext = originalname.toLowerCase().slice(originalname.lastIndexOf('.'));
  return FORMAT_MAP[ext] || null;
}

export async function parseFile(buffer, originalname) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new BadRequestError('Import file is empty');
  }

  const format = detectFormat(originalname);
  if (!format) {
    throw new BadRequestError(msg.INVALID_TYPE);
  }

  switch (format) {
    case 'csv':
      return parseCsv(buffer, originalname);
    case 'xlsx':
      return parseXlsx(buffer, originalname);
    case 'pdf':
      return parsePdf(buffer, originalname);
    case 'docx':
      return parseDocx(buffer, originalname);
    default:
      throw new BadRequestError(msg.INVALID_TYPE);
  }
}

export { parseCsv } from './csv.js';
export { parseXlsx } from './xlsx.js';
export { parsePdf } from './pdf.js';
export { parseDocx } from './docx.js';
