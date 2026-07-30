import mammoth from 'mammoth';
import { systemMessages } from '../../config/index.js';

const msg = systemMessages.ERROR.IMPORT;

export async function parseDocx(buffer, _filename) {
  let result;
  try {
    result = await mammoth.convertToHtml({ buffer });
  } catch {
    return { rows: [], errors: [{ row: 0, field: null, error: msg.DOCX_PARSE_FAILED }] };
  }

  const html = result.value;

  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const allRows = [];
  const allErrors = [];
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const tableRows = extractHtmlTableRows(tableHtml);
    allRows.push(...tableRows.rows);
    allErrors.push(...tableRows.errors);
  }

  if (allRows.length > 0 || allErrors.length > 0) {
    return { rows: allRows, errors: allErrors };
  }

  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs = [];
  let pMatch;
  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = pMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text) paragraphs.push(text);
  }

  return parseDocxParagraphs(paragraphs);
}

function extractHtmlTableRows(tableHtml) {
  const rows = [];
  const errors = [];
  const headerMap = {};

  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const trMatches = [];
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    trMatches.push(trMatch[1]);
  }

  if (trMatches.length === 0) {
    return { rows, errors: [{ row: 0, field: null, error: 'No rows found in DOCX table' }] };
  }

  const headerCells = extractCells(trMatches[0]);
  for (let i = 0; i < headerCells.length; i++) {
    const h = headerCells[i].toLowerCase().replace(/[\s_-]+/g, '').trim();
    if (/^name|fullname|attendeename$/.test(h)) headerMap.name = i;
    else if (/^email|mail|e?mail|attendeeemail$/.test(h)) headerMap.email = i;
    else if (/^phone|phoneNumber|telephone|mobile|contact$/.test(h)) headerMap.phone = i;
    else if (/^tickettype|tickettypeid|ticket|type$/.test(h)) headerMap.ticketType = i;
  }

  if (!headerMap.name && !headerMap.email) {
    return { rows, errors: [{ row: 0, field: null, error: 'Could not detect name or email columns in DOCX table' }] };
  }

  for (let i = 1; i < trMatches.length; i++) {
    const cells = extractCells(trMatches[i]);
    const name = headerMap.name !== undefined ? cells[headerMap.name] || '' : '';
    const email = headerMap.email !== undefined ? cells[headerMap.email] || '' : '';
    const phone = headerMap.phone !== undefined ? cells[headerMap.phone] || '' : null;
    const ticketType = headerMap.ticketType !== undefined ? cells[headerMap.ticketType] || '' : null;

    if (!name && !email) {
      errors.push({ row: i + 1, field: null, error: 'Row is empty' });
      continue;
    }

    rows.push({ sourceRow: i + 1, name, email, phone: phone || null, ticketType: ticketType || null });
  }

  return { rows, errors };
}

function extractCells(trHtml) {
  const cells = [];
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let cellMatch;
  while ((cellMatch = cellRegex.exec(trHtml)) !== null) {
    const raw = cellMatch[1].replace(/<[^>]+>/g, '').trim();
    cells.push(decodeHtmlEntities(raw));
  }
  return cells;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
    .replace(/&nbsp;/g, ' ');
}

function parseDocxParagraphs(paragraphs) {
  const rows = [];
  const errors = [];
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  for (let i = 0; i < paragraphs.length; i++) {
    const line = paragraphs[i];
    const emailMatch = line.match(emailRegex);
    const email = emailMatch ? emailMatch[0].toLowerCase() : '';

    if (!email) {
      errors.push({ row: i + 1, field: 'email', error: 'No email address found in paragraph' });
      continue;
    }

    const name = line.replace(emailRegex, '').replace(/[,;|]/g, '').trim();

    rows.push({ sourceRow: i + 1, name, email, phone: null, ticketType: null });
  }

  return { rows, errors };
}
