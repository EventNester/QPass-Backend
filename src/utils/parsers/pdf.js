import { PDFParse } from 'pdf-parse';
import { systemMessages } from '../../config/index.js';

const msg = systemMessages.ERROR.IMPORT;

export async function parsePdf(buffer, _filename) {
  const instance = new PDFParse(buffer);

  try {
    await instance.load();
  } catch {
    return { rows: [], errors: [{ row: 0, field: null, error: msg.PDF_PARSE_FAILED }] };
  }

  const tables = instance.getTable();
  if (tables && tables.length > 0) {
    const table = tables[0];
    const result = extractTableRows(table);
    if (result.rows.length > 0) {
      return result;
    }
  }

  const text = instance.getText();
  if (!text || !text.trim()) {
    return { rows: [], errors: [{ row: 0, field: null, error: msg.PDF_PARSE_FAILED }] };
  }

  return parseTextRows(text);
}

function extractTableRows(table) {
  const rows = [];
  const errors = [];
  const headerMap = {};

  const tableData = table.items || table.rows || table.cells || [];
  if (tableData.length === 0) {
    return { rows, errors };
  }

  const headerRow = tableData[0];
  if (headerRow) {
    const headers = Array.isArray(headerRow) ? headerRow : Object.values(headerRow);
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i]).toLowerCase().replace(/[\s_-]+/g, '').trim();
      if (/^name|fullname|attendeename$/.test(h)) headerMap.name = i;
      else if (/^email|mail|e?mail|attendeeemail$/.test(h)) headerMap.email = i;
      else if (/^phone|phoneNumber|telephone|mobile|contact$/.test(h)) headerMap.phone = i;
      else if (/^tickettype|tickettypeid|ticket|type$/.test(h)) headerMap.ticketType = i;
    }
  }

  if (!headerMap.name && !headerMap.email) {
    return { rows: [], errors: [{ row: 0, field: null, error: 'Could not detect name or email columns in PDF table' }] };
  }

  for (let i = 1; i < tableData.length; i++) {
    const row = Array.isArray(tableData[i]) ? tableData[i] : Object.values(tableData[i]);
    const name = headerMap.name !== undefined ? String(row[headerMap.name] || '').trim() : '';
    const email = headerMap.email !== undefined ? String(row[headerMap.email] || '').trim() : '';
    const phone = headerMap.phone !== undefined ? String(row[headerMap.phone] || '').trim() : null;
    const ticketType = headerMap.ticketType !== undefined ? String(row[headerMap.ticketType] || '').trim() : null;

    if (!name && !email) {
      errors.push({ row: i + 2, field: null, error: 'Row is empty' });
      continue;
    }

    rows.push({ name, email, phone: phone || null, ticketType: ticketType || null });
  }

  return { rows, errors };
}

function parseTextRows(text) {
  const rows = [];
  const errors = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (/name.*email|email.*name|name.*phone|attendee.*email/.test(line)) {
      headerIndex = i;
      break;
    }
  }

  const startIdx = headerIndex === -1 ? 0 : headerIndex + 1;

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const emailMatch = line.match(emailRegex);
    const email = emailMatch ? emailMatch[0].toLowerCase() : '';

    if (!email) {
      errors.push({ row: i + 1, field: 'email', error: 'No email address found in line' });
      continue;
    }

    const name = line.replace(emailRegex, '').replace(/[,;|]/g, '').trim();

    rows.push({ name, email, phone: null, ticketType: null });
  }

  return { rows, errors };
}
