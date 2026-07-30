import { parse } from 'csv-parse/sync';
import { systemMessages } from '../../config/index.js';

const msg = systemMessages.ERROR.IMPORT;

export function parseCsv(buffer, _filename) {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });

  if (records.length === 0) {
    return { rows: [], errors: [] };
  }

  if (records.length > 1000) {
    return { rows: [], errors: [{ row: 0, field: null, error: msg.ROW_LIMIT_EXCEEDED }] };
  }

  const rows = [];
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const row = normalizeRow(record);
    if (row) {
      rows.push(row);
    } else {
      errors.push({
        row: i + 2,
        field: null,
        error: 'Could not extract valid columns from this row',
      });
    }
  }

  return { rows, errors };
}

function normalizeRow(record) {
  const keys = Object.keys(record).reduce((acc, k) => {
    acc[k.toLowerCase().replace(/[\s_-]+/g, '')] = record[k];
    return acc;
  }, {});

  const name = keys.name || keys.fullname || keys.attendeename || keys['attendee name'] || '';
  const email = keys.email || keys['email address'] || keys.mail || keys['e-mail'] || keys.attendeeemail || '';
  const phone = keys.phone || keys.phoneNumber || keys.telephone || keys.mobile || keys.phoneNumber || keys.contact || '';
  const ticketType = keys.tickettype || keys.tickettypeid || keys.ticket || keys.type || keys.ticket || keys['ticket type'] || '';

  if (!name && !email) {
    return null;
  }

  return {
    name: String(name).trim(),
    email: String(email).trim(),
    phone: phone ? String(phone).trim() : null,
    ticketType: ticketType ? String(ticketType).trim() : null,
  };
}
