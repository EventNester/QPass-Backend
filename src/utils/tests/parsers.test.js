import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { BadRequestError } from '../error.js';

vi.mock('../../config/index.js', () => ({
  systemMessages: {
    ERROR: {
      UPLOAD: {
        INVALID_TYPE: 'Invalid file type. Allowed formats: CSV, XLSX, PDF, DOCX',
      },
      IMPORT: {
        CSV_PARSE_FAILED: 'Failed to parse CSV file',
        XLSX_PARSE_FAILED: 'Failed to parse XLSX file',
        PDF_PARSE_FAILED: 'Failed to parse PDF file',
        DOCX_PARSE_FAILED: 'Failed to parse DOCX file',
        NO_WORKSHEETS: 'No worksheets found in XLSX file',
        ROW_LIMIT_EXCEEDED: 'File exceeds the maximum allowed number of rows',
      },
    },
  },
}));

const pdfMock = vi.hoisted(() => {
  const instance = {
    getTable: vi.fn(),
    getText: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  class PDFParse {
    constructor() {}
    getTable() {
      return instance.getTable();
    }
    getText() {
      return instance.getText();
    }
    destroy() {
      return instance.destroy();
    }
  }
  return { instance, PDFParse };
});

vi.mock('pdf-parse', () => ({ PDFParse: pdfMock.PDFParse }));

const mammothMock = vi.hoisted(() => ({
  convertToHtml: vi.fn(),
}));

vi.mock('mammoth', () => ({
  default: { convertToHtml: mammothMock.convertToHtml },
}));

const xlsxMock = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal();
  xlsxMock.read.mockImplementation(actual.read);
  return { ...actual, read: xlsxMock.read };
});

import { parseCsv } from '../parsers/csv.js';
import { parseXlsx } from '../parsers/xlsx.js';
import { parsePdf } from '../parsers/pdf.js';
import { parseDocx } from '../parsers/docx.js';
import { parseFile } from '../parsers/index.js';

function buildXlsxBuffer(headerRow, rows) {
  const aoa = [headerRow, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendees');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCsv', () => {
    it('parses multiple rows and normalizes header aliases', () => {
      const buffer = Buffer.from(
        'Name,Email,Phone,Ticket Type\nAda Lovelace,ada@example.com,123,VIP\nGrace Hopper,grace@example.com,456,General',
        'utf8'
      );
      const { rows, errors } = parseCsv(buffer);
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        sourceRow: 2,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '123',
        ticketType: 'VIP',
      });
      expect(rows[1]).toEqual({
        sourceRow: 3,
        name: 'Grace Hopper',
        email: 'grace@example.com',
        phone: '456',
        ticketType: 'General',
      });
    });

    it('handles quoted fields containing commas and newlines', () => {
      const csv = 'name,email\n"Okafor, Chinedu",ok@example.com\n"John\nDoe",john@example.com';
      const { rows } = parseCsv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Okafor, Chinedu');
      expect(rows[1].name).toBe('John\nDoe');
    });

    it('preserves special characters (é, ñ, ü)', () => {
      const csv = 'name,email\nJosé Martínez ñuñoa, jose@example.com\nÜbel Möller, ubel@example.com';
      const { rows } = parseCsv(csv);
      expect(rows[0].name).toBe('José Martínez ñuñoa');
      expect(rows[1].name).toBe('Übel Möller');
    });

    it('strips the UTF-8 BOM', () => {
      const csv = '\uFEFFname,email\nAda,ada@example.com';
      const { rows, errors } = parseCsv(csv);
      expect(errors).toEqual([]);
      expect(rows[0].email).toBe('ada@example.com');
    });

    it('uses header aliases for attendee email and full name', () => {
      const csv = 'Full Name,Attendee Email\nJane Doe,jane@example.com';
      const { rows, errors } = parseCsv(csv);
      expect(errors).toEqual([]);
      expect(rows[0]).toEqual({
        sourceRow: 2,
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        ticketType: null,
      });
    });

    it('flags rows that are missing both name and email', () => {
      const csv = 'name,email\nAda,ada@example.com\n,';
      const { rows, errors } = parseCsv(csv);
      expect(rows).toHaveLength(1);
      expect(errors).toEqual([
        { row: 3, field: null, error: 'Could not extract valid columns from this row' },
      ]);
    });

    it('returns empty rows and errors for empty content', () => {
      const { rows, errors } = parseCsv('');
      expect(rows).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('returns CSV_PARSE_FAILED on unreadable CSV', () => {
      const { rows, errors } = parseCsv(Buffer.from('"unclosed quote'));
      expect(rows).toEqual([]);
      expect(errors).toEqual([{ row: 0, field: null, error: 'Failed to parse CSV file' }]);
    });
  });

  describe('parseXlsx', () => {
    it('parses the first worksheet into normalized rows', () => {
      const buffer = buildXlsxBuffer(
        ['Name', 'Email', 'Phone', 'Ticket Type'],
        [
          ['Ada Lovelace', 'ada@example.com', '123', 'VIP'],
          ['Grace Hopper', 'grace@example.com', '456', 'General'],
        ]
      );
      const { rows, errors } = parseXlsx(buffer);
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        sourceRow: 3,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '123',
        ticketType: 'VIP',
      });
    });

    it('uses header aliases', () => {
      const buffer = buildXlsxBuffer(
        ['Full Name', 'Attendee Email'],
        [['Jane Doe', 'jane@example.com']]
      );
      const { rows } = parseXlsx(buffer);
      expect(rows[0].name).toBe('Jane Doe');
      expect(rows[0].email).toBe('jane@example.com');
    });

    it('flags rows missing name and email as errors', () => {
      const buffer = buildXlsxBuffer(
        ['Name', 'Email'],
        [
          ['Ada', 'ada@example.com'],
          ['', ''],
        ]
      );
      const { rows, errors } = parseXlsx(buffer);
      expect(rows).toHaveLength(1);
      expect(errors).toEqual([
        { row: 3, field: null, error: 'Row is empty or missing required columns' },
      ]);
    });

    it('returns header-detection error when neither name nor email columns exist', () => {
      const buffer = buildXlsxBuffer(['A', 'B'], [[1, 2]]);
      const { rows, errors } = parseXlsx(buffer);
      expect(rows).toEqual([]);
      expect(errors).toEqual([
        { row: 0, field: null, error: 'Could not detect name or email columns in header' },
      ]);
    });

    it('returns XLSX_PARSE_FAILED for an unreadable buffer', () => {
      xlsxMock.read.mockImplementationOnce(() => {
        throw new Error('invalid zip');
      });
      const { rows, errors } = parseXlsx(Buffer.from('not an xlsx file'));
      expect(rows).toEqual([]);
      expect(errors).toEqual([{ row: 0, field: null, error: 'Failed to parse XLSX file' }]);
    });

    it('returns NO_WORKSHEETS when the workbook has no sheets', () => {
      xlsxMock.read.mockImplementationOnce(() => ({ SheetNames: [], Sheets: {} }));
      const { rows, errors } = parseXlsx(Buffer.from('x'));
      expect(rows).toEqual([]);
      expect(errors).toEqual([{ row: 0, field: null, error: 'No worksheets found in XLSX file' }]);
    });
  });

  describe('parsePdf', () => {
    it('extracts rows from PDF tables', async () => {
      pdfMock.instance.getTable.mockResolvedValue({
        pages: [
          {
            tables: [
              {
                items: [
                  ['Name', 'Email', 'Phone'],
                  ['Ada Lovelace', 'ada@example.com', '123'],
                  ['Grace Hopper', 'grace@example.com', '456'],
                ],
              },
            ],
          },
        ],
      });

      const { rows, errors } = await parsePdf(Buffer.from('pdf'));
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        sourceRow: 3,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '123',
        ticketType: null,
      });
      expect(pdfMock.instance.destroy).toHaveBeenCalled();
    });

    it('falls back to text parsing when no tables are detected', async () => {
      pdfMock.instance.getTable.mockResolvedValue({ pages: [] });
      pdfMock.instance.getText.mockResolvedValue({
        text: 'Name Email\nAda Lovelace ada@example.com\nGrace Hopper grace@example.com',
      });

      const { rows, errors } = await parsePdf(Buffer.from('pdf'));
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(2);
      expect(rows[0].email).toBe('ada@example.com');
      expect(rows[0].name).toBe('Ada Lovelace');
    });

    it('reports rows without an email address from text', async () => {
      pdfMock.instance.getTable.mockResolvedValue({ pages: [] });
      pdfMock.instance.getText.mockResolvedValue({ text: 'Ada Lovelace ada@example.com\nno email here' });

      const { rows, errors } = await parsePdf(Buffer.from('pdf'));
      expect(rows).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBe('No email address found in line');
    });

    it('returns PDF_PARSE_FAILED when text is empty', async () => {
      pdfMock.instance.getTable.mockResolvedValue({ pages: [] });
      pdfMock.instance.getText.mockResolvedValue({ text: '   ' });

      const { rows, errors } = await parsePdf(Buffer.from('pdf'));
      expect(rows).toEqual([]);
      expect(errors).toEqual([{ row: 0, field: null, error: 'Failed to parse PDF file' }]);
    });

    it('returns PDF_PARSE_FAILED when parsing throws', async () => {
      pdfMock.instance.getTable.mockRejectedValue(new Error('boom'));

      const { rows, errors } = await parsePdf(Buffer.from('pdf'));
      expect(rows).toEqual([]);
      expect(errors).toEqual([{ row: 0, field: null, error: 'Failed to parse PDF file' }]);
      expect(pdfMock.instance.destroy).toHaveBeenCalled();
    });
  });

  describe('parseDocx', () => {
    it('extracts rows from an HTML table produced by mammoth', async () => {
      mammothMock.convertToHtml.mockResolvedValue({
        value:
          '<table><tr><th>Name</th><th>Email</th><th>Phone</th></tr>' +
          '<tr><td>Ada Lovelace</td><td>ada@example.com</td><td>123</td></tr>' +
          '<tr><td>Grace Hopper</td><td>grace@example.com</td><td>456</td></tr></table>',
      });

      const { rows, errors } = await parseDocx(Buffer.from('docx'));
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        sourceRow: 1,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '123',
        ticketType: null,
      });
    });

    it('decodes HTML entities in cells', async () => {
      mammothMock.convertToHtml.mockResolvedValue({
        value:
          '<table><tr><th>Name</th><th>Email</th></tr>' +
          '<tr><td>O&#39;Brien &amp; Sons</td><td>ob@example.com</td></tr></table>',
      });

      const { rows } = await parseDocx(Buffer.from('docx'));
      expect(rows[0].name).toBe("O'Brien & Sons");
    });

    it('falls back to paragraph parsing when there are no tables', async () => {
      mammothMock.convertToHtml.mockResolvedValue({
        value: '<p>Ada Lovelace ada@example.com</p><p>Grace Hopper grace@example.com</p>',
      });

      const { rows } = await parseDocx(Buffer.from('docx'));
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Ada Lovelace');
      expect(rows[0].email).toBe('ada@example.com');
    });

    it('returns DOCX_PARSE_FAILED when mammoth throws', async () => {
      mammothMock.convertToHtml.mockRejectedValue(new Error('bad docx'));

      const { rows, errors } = await parseDocx(Buffer.from('docx'));
      expect(rows).toEqual([]);
      expect(errors).toEqual([{ row: 0, field: null, error: 'Failed to parse DOCX file' }]);
    });
  });

  describe('parseFile (format detection & dispatch)', () => {
    it('throws BadRequestError when the buffer is empty', async () => {
      await expect(parseFile(Buffer.alloc(0), 'attendees.csv')).rejects.toThrow(BadRequestError);
      await expect(parseFile('not-a-buffer', 'attendees.csv')).rejects.toThrow('Import file is empty');
    });

    it('throws BadRequestError for an unsupported extension', async () => {
      await expect(
        parseFile(Buffer.from('x'), 'attendees.exe')
      ).rejects.toThrow('Invalid file type. Allowed formats: CSV, XLSX, PDF, DOCX');
    });

    it('throws BadRequestError when MIME type contradicts the extension', async () => {
      await expect(
        parseFile(Buffer.from('x'), 'attendees.csv', 'application/pdf')
      ).rejects.toThrow('Invalid file type. Allowed formats: CSV, XLSX, PDF, DOCX');
    });

    it('dispatches CSV files to parseCsv', async () => {
      const result = await parseFile(
        Buffer.from('name,email\nAda,ada@example.com'),
        'attendees.csv',
        'text/csv'
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].email).toBe('ada@example.com');
    });

    it('dispatches XLSX files to parseXlsx', async () => {
      const buffer = buildXlsxBuffer(['Name', 'Email'], [['Ada', 'ada@example.com']]);
      const result = await parseFile(buffer, 'attendees.xlsx');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].email).toBe('ada@example.com');
    });

    it('dispatches PDF files to parsePdf', async () => {
      pdfMock.instance.getTable.mockResolvedValue({ pages: [] });
      pdfMock.instance.getText.mockResolvedValue({ text: 'Ada ada@example.com' });
      const result = await parseFile(Buffer.from('pdf'), 'attendees.pdf', 'application/pdf');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].email).toBe('ada@example.com');
    });

    it('dispatches DOCX files to parseDocx', async () => {
      mammothMock.convertToHtml.mockResolvedValue({
        value: '<p>Ada ada@example.com</p>',
      });
      const result = await parseFile(Buffer.from('docx'), 'attendees.docx');
      expect(result.rows).toHaveLength(1);
    });

    it('enforces the max import row limit', async () => {
      const rows = Array.from({ length: 1001 }, (_, i) => ({
        sourceRow: i + 2,
        name: `User ${i}`,
        email: `user${i}@example.com`,
      }));
      pdfMock.instance.getTable.mockResolvedValue({ pages: [] });
      pdfMock.instance.getText.mockResolvedValue({ text: 'x' });
      pdfMock.instance.getTable.mockResolvedValueOnce({
        pages: [{ tables: [{ items: [['Name', 'Email'], ...rows.map((r) => [r.name, r.email])] }] }],
      });
      const result = await parseFile(Buffer.from('pdf'), 'big.pdf');
      expect(result.rows).toEqual([]);
      expect(result.errors).toEqual([
        { row: 0, field: null, error: 'File exceeds the maximum allowed number of rows' },
      ]);
    });
  });
});
