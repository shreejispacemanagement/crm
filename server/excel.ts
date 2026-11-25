import ExcelJS from 'exceljs';

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

export async function generateImportTemplateBuffer(format: 'xlsx' | 'csv'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lead Import Template');
  ws.addRow(IMPORT_TEMPLATE_HEADERS);
  ws.addRow([
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
  ]);
  ws.getRow(1).font = { bold: true };
  if (format === 'csv') {
    const out = await wb.csv.writeBuffer();
    return Buffer.from(out);
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function parseSpreadsheetBase64(
  fileBase64: string,
  filename: string
): Promise<Array<Record<string, string>>> {
  const cleanB64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
  const buf = Buffer.from(cleanB64, 'base64');
  const wb = new ExcelJS.Workbook();
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv')) {
    const text = buf.toString('utf8');
    // Parse CSV lines safely with ExcelJS or manual RFC4180 parser
    const rows = parseCsvText(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== '')).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = (r[i] ?? '').trim();
      });
      return obj;
    });
  }

  await wb.xlsx.load(buf as unknown as ArrayBuffer);
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

export async function buildSpreadsheetBuffer(
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  format: 'xlsx' | 'csv'
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow(r.map((v) => (v === null || v === undefined ? '' : v)));
  }
  if (format === 'csv') {
    const out = await wb.csv.writeBuffer();
    return Buffer.from(out);
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
