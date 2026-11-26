import type ExcelJS from 'exceljs';

export const IMPORT_TEMPLATE_HEADERS = [
  'Customer Name',
  'Mobile',
  'Alternate Mobile',
  'WhatsApp',
  'Email',
  'Company',
  'Lead Source',
  'Property Type',
  'Property Subtype',
  'Transaction Type',
  'Localities',
  'Budget From',
  'Budget To',
  'BHK',
  'Min Area',
  'Max Area',
  'Area Unit',
  'Assigned Employee',
  'Remarks',
];

function base64ToUint8Array(fileBase64: string): Uint8Array {
  const cleanB64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
  const binary = atob(cleanB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function cellToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('text' in val && typeof val.text === 'string') return val.text;
    if ('result' in val && val.result !== undefined && val.result !== null) return String(val.result);
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((rt) => rt.text).join('');
    }
  }
  return String(val);
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  const normalized = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function generateImportTemplateBlob(format: 'xlsx' | 'csv'): Promise<Blob> {
  const sampleRow = [
    'Rohan Kulkarni',
    '9825012345',
    '',
    '9825012345',
    'rohan.k@example.in',
    'Kulkarni Associates',
    'Website',
    'Residential',
    'Apartment',
    'Sale',
    'Satellite, Bodakdev',
    '12000000',
    '16000000',
    '3 BHK',
    '1650',
    '2100',
    'Sq. Ft.',
    'aarav.patel@shreejispace.in',
    'Looking for East-facing unit',
  ];

  if (format === 'csv') {
    const csv = [IMPORT_TEMPLATE_HEADERS.map(escapeCsvCell).join(','), sampleRow.map(escapeCsvCell).join(',')].join('\r\n');
    return new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  }

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lead Import Template');
  ws.addRow(IMPORT_TEMPLATE_HEADERS);
  ws.addRow(sampleRow);
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function parseSpreadsheetBase64Client(
  fileBase64: string,
  filename: string
): Promise<Array<Record<string, string>>> {
  const bytes = base64ToUint8Array(fileBase64);
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(bytes);
    const rows = parseCsvText(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows
      .slice(1)
      .filter((r) => r.some((cell) => cell.trim() !== ''))
      .map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h) obj[h] = (r[i] ?? '').trim();
        });
        return obj;
      });
  }

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  await wb.xlsx.load(ab as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellToString(cell.value).trim();
  });

  const records: Array<Record<string, string>> = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    let hasData = false;
    for (let col = 1; col < headers.length; col++) {
      const key = headers[col];
      if (!key) continue;
      const val = cellToString(row.getCell(col).value).trim();
      if (val) hasData = true;
      obj[key] = val;
    }
    if (hasData) records.push(obj);
  });
  return records;
}

export async function buildSpreadsheetBlob(
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  format: 'xlsx' | 'csv'
): Promise<Blob> {
  if (format === 'csv') {
    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.map(escapeCsvCell).join(',')),
    ];
    return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  }

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow(r.map((v) => (v === null || v === undefined ? '' : v)));
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
