import { type NextFunction, type Request, type Response, Router } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { buildSpreadsheetBuffer, generateImportTemplateBuffer, parseSpreadsheetBase64 } from './excel.ts';

interface FirebaseAppletConfig {
  projectId?: string;
}

function loadProjectId(): string | null {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as FirebaseAppletConfig;
    if (!raw.projectId || raw.projectId === 'remixed-project-id') return null;
    return raw.projectId;
  } catch {
    return null;
  }
}

function getFirebaseAdminAuth() {
  const projectId = loadProjectId();
  if (!projectId) {
    throw new Error('Firebase project is not configured.');
  }
  const app = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

async function requireFirebaseToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    if (!decoded.email || decoded.email_verified !== true) {
      res.status(403).json({ error: 'Verified email required.' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired Firebase session token.' });
  }
}

export const excelRouter = Router();

excelRouter.get('/template', requireFirebaseToken, async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const buf = await generateImportTemplateBuffer(format);
  res.setHeader(
    'Content-Type',
    format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="SSM_Lead_Import_Template.${format}"`);
  res.send(buf);
});

excelRouter.post('/parse', requireFirebaseToken, async (req, res) => {
  const { fileBase64, filename } = req.body || {};
  if (!fileBase64 || !filename) {
    res.status(400).json({ error: 'Spreadsheet file and filename are required.' });
    return;
  }
  try {
    const rows = await parseSpreadsheetBase64(String(fileBase64), String(filename));
    if (rows.length === 0) {
      res.status(400).json({ error: 'No data rows found in the uploaded file.' });
      return;
    }
    res.json({ rows });
  } catch (err) {
    res.status(400).json({ error: `Unable to parse spreadsheet: ${(err as Error).message}` });
  }
});

excelRouter.post('/export', requireFirebaseToken, async (req, res) => {
  const { sheetName, headers, rows, format } = req.body || {};
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    res.status(400).json({ error: 'Headers and rows are required for export.' });
    return;
  }
  const fmt = format === 'csv' ? 'csv' : 'xlsx';
  const buf = await buildSpreadsheetBuffer(
    String(sheetName || 'SSM CRM Export'),
    headers.map((h: unknown) => String(h ?? '')),
    rows as Array<Array<string | number | null | undefined>>,
    fmt
  );
  res.setHeader(
    'Content-Type',
    fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="ssm_export.${fmt}"`);
  res.send(buf);
});
