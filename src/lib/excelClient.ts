import type ExcelJS from 'exceljs';

export const IMPORT_TEMPLATE_HEADERS = [
  'Customer Name',
  'Primary Mobile',
  'Whatsapp',
  'Lead Source',
  'Property Type',
  'Property Subtype',
  'Transaction Type',
  'Budget From (Numeric Only)',
  'Budget To (Numeric Only)',
  'BHK (If Residential, Leave Blank If Commercial)',
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

function escapeCsvCell(val: string | number | null | undefined): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function generateImportTemplateBlob(): Promise<Blob> {
  const residentialSampleRow = [
    'Rohan Kulkarni',
    '9825012345',
    '9825012345',
    'Website',
    'Residential',
    'Apartment',
    'Sale',
    12000000,
    16000000,
    '3 BHK',
  ];
  const commercialSampleRow = [
    'Meera Enterprise',
    '9898012345',
    '',
    'Referral',
    'Commercial',
    'Office',
    'Rent',
    80000,
    120000,
    '',
  ];

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lead Import Template');
  ws.addRow(IMPORT_TEMPLATE_HEADERS);
  ws.addRow(residentialSampleRow);
  ws.addRow(commercialSampleRow);
  ws.getRow(1).font = { bold: true };
  ws.columns = [
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 15 },
    { width: 18 },
    { width: 17 },
    { width: 26 },
    { width: 24 },
    { width: 42 },
  ];
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function parseSpreadsheetBase64Client(
  fileBase64: string,
  filename: string
): Promise<Array<Record<string, string>>> {
  const lower = filename.toLowerCase().trim();
  if (!lower.endsWith('.xlsx')) {
    throw new Error('Only Excel (.xlsx) files are supported for bulk lead import.');
  }

  const bytes = base64ToUint8Array(fileBase64);
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
