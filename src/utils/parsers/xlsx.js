import * as XLSX from 'xlsx';
import { systemMessages } from '../../config/index.js';

const msg = systemMessages.ERROR.IMPORT;

export function parseXlsx(buffer, _filename) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    return { rows: [], errors: [{ row: 0, field: null, error: msg.XLSX_PARSE_FAILED }] };
  }

  if (workbook.SheetNames.length === 0) {
    return { rows: [], errors: [{ row: 0, field: null, error: msg.NO_WORKSHEETS }] };
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 'A' });

  if (rawData.length === 0) {
    return { rows: [], errors: [] };
  }

  const headerRow = rawData[0];
  const columns = Object.keys(headerRow).reduce((acc, col) => {
    const val = String(headerRow[col]).toLowerCase().replace(/[\s_-]+/g, '').trim();
    acc[col] = val;
    return acc;
  }, {});

  const colMap = {};
const HEADER_ALIASES = {
  name: ['name', 'fullname', 'attendeename'],
  email: ['email', 'emailaddress', 'mail', 'attendeeemail'],
  phone: ['phone', 'phonenumber', 'telephone', 'mobile', 'contact'],
  ticketType: ['tickettype', 'tickettypeid', 'ticket', 'type'],
};

  for (const [col, normalized] of Object.entries(columns)) {
    const field = Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(normalized));
    if (field && !colMap[field]) colMap[field] = col;
  }

  if (!colMap.name && !colMap.email) {
    return { rows: [], errors: [{ row: 0, field: null, error: 'Could not detect name or email columns in header' }] };
  }

  const rows = [];
  const errors = [];

  for (let i = 1; i < rawData.length; i++) {
    const record = rawData[i];
    const name = colMap.name ? String(record[colMap.name] || '').trim() : '';
    const email = colMap.email ? String(record[colMap.email] || '').trim() : '';
    const phone = colMap.phone ? String(record[colMap.phone] || '').trim() : null;
    const ticketType = colMap.ticketType ? String(record[colMap.ticketType] || '').trim() : null;

    if (!name && !email) {
      errors.push({
        row: i + 1,
        field: null,
        error: 'Row is empty or missing required columns',
      });
      continue;
    }

    rows.push({ sourceRow: i + 2, name, email, phone: phone || null, ticketType: ticketType || null });
  }

  return { rows, errors };

}
