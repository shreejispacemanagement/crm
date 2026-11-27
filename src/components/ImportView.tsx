import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiDownload, apiFetch, formatDateTime, formatINR } from '../lib/api.ts';
import type { ImportBatchRecord, ImportPreviewRow, UserProfile } from '../types.ts';

export const ImportView: React.FC<{ users: UserProfile[]; onImported: () => void }> = ({ users, onImported }) => {
  const [batchRef, setBatchRef] = useState<string>('');
  const [retryBatchRef, setRetryBatchRef] = useState<string>('');
  const [filename, setFilename] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [duplicateDecisions, setDuplicateDecisions] = useState<Record<string, 'skip' | 'separate'>>({});
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [commitResult, setCommitResult] = useState<{
    batchRef: string;
    total: number;
    successCount: number;
    skippedCount: number;
    failedCount: number;
    errors: Array<Record<string, unknown>>;
  } | null>(null);
  const [history, setHistory] = useState<ImportBatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeEmployees = users.filter((u) => u.status === 'active');

  const loadHistory = async () => {
    try {
      const res = await apiFetch<{ batches: ImportBatchRecord[] }>('/api/import/history');
      setHistory(res.batches);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCommitResult(null);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Only Excel (.xlsx) files are supported for bulk lead import.');
      e.target.value = '';
      return;
    }
    setLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });

      const res = await apiFetch<{ batchRef: string; filename: string; rows: ImportPreviewRow[] }>('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          fileBase64: base64,
          filename: file.name,
          retryBatchRef: retryBatchRef.trim() || undefined,
        }),
      });
      setBatchRef(res.batchRef);
      setFilename(res.filename);
      setPreviewRows(res.rows);
      setSelectedAssigneeId('');

      // Default duplicate decision: 'skip' until Super Admin picks
      const defaults: Record<string, 'skip' | 'separate'> = {};
      for (const r of res.rows) {
        if (r.duplicates.length > 0) defaults[String(r.rowNumber)] = 'skip';
      }
      setDuplicateDecisions(defaults);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleCommit = async () => {
    if (!selectedAssigneeId) {
      setError('Please select an employee to assign this bulk import.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{
        batchRef: string;
        total: number;
        successCount: number;
        skippedCount: number;
        failedCount: number;
        errors: Array<Record<string, unknown>>;
      }>('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          batchRef,
          filename,
          assignedToUserId: selectedAssigneeId,
          rawRows: previewRows.map((r) => r.raw),
          duplicateDecisions,
        }),
      });
      setCommitResult(res);
      setPreviewRows([]);
      setSelectedAssigneeId('');
      loadHistory();
      onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const downloadErrorReport = async (errors: Array<Record<string, unknown>>) => {
    await apiDownload('/api/import/error-report', 'SSM_Import_Errors.xlsx', {
      method: 'POST',
      body: JSON.stringify({ errors, format: 'xlsx' }),
    });
  };

  const validCount = previewRows.filter((r) => r.isValid).length;
  const invalidCount = previewRows.filter((r) => !r.isValid).length;
  const dupCount = previewRows.filter((r) => r.isValid && r.duplicates.length > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">Excel Lead Import</h1>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
            Super Admin only · Excel (.xlsx) bulk import, batch-level employee assignment, and error report re-upload
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => apiDownload('/api/import/template?format=xlsx', 'SSM_Lead_Import_Template.xlsx')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white"
          >
            <Download className="h-3.5 w-3.5 text-[#C99B56]" /> Download Excel Template (.xlsx)
          </button>
        </div>
      </div>

      {/* Upload Box */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1.5">
              Upload Filled Excel Lead Template (.xlsx)
            </label>
            <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#C99B56]/60 bg-[#F8FAFC] px-4 py-6 text-xs font-medium text-[#16273A] cursor-pointer hover:bg-[#FBF6EE]/60 dark:bg-[#0C141E] dark:text-white">
              <Upload className="h-4 w-4 text-[#C99B56]" />
              <span>{loading ? 'Processing Excel file...' : 'Click to choose .xlsx file'}</span>
              <input type="file" accept=".xlsx" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1.5">
              Original Batch Reference (Optional, for error retry)
            </label>
            <input
              type="text"
              value={retryBatchRef}
              onChange={(e) => setRetryBatchRef(e.target.value)}
              placeholder="e.g., IMP-20261125-A1B2C3"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Preview, Batch Assignment & Duplicate Decision Table */}
      {previewRows.length > 0 && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-4 dark:border-[#1E3349] dark:bg-[#121E2C]">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">
                Preview: {filename} · Batch <span className="font-mono-tabular text-[#C99B56]">{batchRef}</span>
              </h2>
              <p className="text-xs text-[#737373] mt-0.5">
                Total: <strong className="font-mono-tabular">{previewRows.length}</strong> · Valid:{' '}
                <strong className="font-mono-tabular text-emerald-700 dark:text-emerald-400">{validCount}</strong> · Invalid:{' '}
                <strong className="font-mono-tabular text-red-600">{invalidCount}</strong> · Duplicates:{' '}
                <strong className="font-mono-tabular text-amber-600">{dupCount}</strong>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="min-w-[230px]">
                <label className="block text-xs font-semibold text-[#16273A] dark:text-white mb-1">
                  Assign Whole Import To *
                </label>
                <select
                  value={selectedAssigneeId}
                  onChange={(e) => setSelectedAssigneeId(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#16273A] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  <option value="">Select Employee for This Import...</option>
                  {activeEmployees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.designation})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={loading || validCount === 0 || !selectedAssigneeId}
                onClick={handleCommit}
                className="rounded-lg bg-[#16273A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#20364F] disabled:opacity-40 dark:bg-[#C99B56] dark:text-[#16273A] whitespace-nowrap"
              >
                {loading ? 'Importing...' : `Import Valid Rows (${validCount})`}
              </button>
            </div>
          </div>

          {validCount > 0 && !selectedAssigneeId && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 px-3.5 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Select an employee in <strong>Assign Whole Import To</strong> above before importing valid rows.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Customer &amp; Contact</th>
                  <th className="px-3 py-2 font-semibold">Requirement &amp; Budget</th>
                  <th className="px-3 py-2 font-semibold">Validation / Duplicate Details</th>
                  <th className="px-3 py-2 font-semibold">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                {previewRows.map((row) => {
                  const n = row.normalized;
                  const bFrom = typeof n.budget_from === 'number' ? formatINR(n.budget_from) : null;
                  const bTo = typeof n.budget_to === 'number' ? formatINR(n.budget_to) : null;
                  const budgetLabel = bFrom && bTo ? `${bFrom} – ${bTo}` : bFrom || bTo || null;
                  return (
                    <tr key={row.rowNumber}>
                      <td className="px-3 py-2.5 font-mono-tabular text-[#737373]">{row.rowNumber}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-[#16273A] dark:text-white">{row.raw['Customer Name'] || '—'}</div>
                        <div className="font-mono-tabular text-[11px] text-[#737373]">
                          Primary: {row.raw['Primary Mobile'] || '—'}
                          {row.raw['Whatsapp'] ? ` · WA: ${row.raw['Whatsapp']}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[#525252] dark:text-[#A3A3A3]">
                        <div>
                          {[
                            row.raw['Lead Source'],
                            row.raw['Property Type'],
                            row.raw['Property Subtype'],
                            row.raw['Transaction Type'],
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                        <div className="text-[11px] text-[#737373] font-mono-tabular">
                          {[
                            budgetLabel,
                            row.raw['BHK (If Residential, Leave Blank If Commercial)']
                              ? `BHK: ${row.raw['BHK (If Residential, Leave Blank If Commercial)']}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'No budget / BHK'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {!row.isValid ? (
                          <div className="text-red-600 dark:text-red-400 space-y-0.5">
                            {row.errors.map((er, i) => (
                              <div key={i}>{er}</div>
                            ))}
                          </div>
                        ) : row.duplicates.length > 0 ? (
                          <div className="space-y-1">
                            <div className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" /> Matches {row.duplicates.length} existing lead(s):
                            </div>
                            {row.duplicates.map((d) => (
                              <div key={d.id} className="text-[11px] text-[#525252] dark:text-[#A3A3A3]">
                                <span className="font-mono-tabular text-[#C99B56]">{d.lead_code}</span> · {d.customer_name} ·{' '}
                                {d.requirement_summary} · {d.stage} · {d.assigned_to_name}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {!row.isValid ? (
                          <span className="text-red-600 font-medium">Skipped (Invalid)</span>
                        ) : row.duplicates.length > 0 ? (
                          <select
                            value={duplicateDecisions[String(row.rowNumber)] || 'skip'}
                            onChange={(e) =>
                              setDuplicateDecisions((prev) => ({
                                ...prev,
                                [String(row.rowNumber)]: e.target.value as 'skip' | 'separate',
                              }))
                            }
                            className="rounded border border-amber-500/50 bg-white px-2 py-1 text-xs dark:bg-[#0C141E] dark:text-white"
                          >
                            <option value="skip">Skip Duplicate</option>
                            <option value="separate">Import as Separate Lead</option>
                          </select>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">Import</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Commit Result + Error Report Download */}
      {commitResult && (
        <div className="rounded-xl border border-[#C99B56]/40 bg-[#FBF6EE]/40 p-5 dark:bg-[#2A2318]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#16273A] dark:text-white">
                Import Batch <span className="font-mono-tabular text-[#C99B56]">{commitResult.batchRef}</span> Completed
              </h3>
              <p className="text-xs text-[#525252] dark:text-[#D4D4D4] mt-1 font-mono-tabular">
                Total: {commitResult.total} · Imported: {commitResult.successCount} · Skipped Duplicates: {commitResult.skippedCount} · Failed: {commitResult.failedCount}
              </p>
            </div>
            {commitResult.errors.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadErrorReport(commitResult.errors)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#16273A] px-3 py-1.5 text-xs font-semibold text-white dark:bg-[#C99B56] dark:text-[#16273A]"
                >
                  <Download className="h-3.5 w-3.5" /> Error Report (.xlsx)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import History */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E3349] flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-[#C99B56]" />
          <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">Import History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Batch Ref</th>
                <th className="px-4 py-2.5 font-semibold">Filename</th>
                <th className="px-4 py-2.5 font-semibold">Uploader</th>
                <th className="px-4 py-2.5 font-semibold">Date/Time</th>
                <th className="px-4 py-2.5 font-semibold text-right">Total</th>
                <th className="px-4 py-2.5 font-semibold text-right">Success</th>
                <th className="px-4 py-2.5 font-semibold text-right">Skipped</th>
                <th className="px-4 py-2.5 font-semibold text-right">Failed</th>
                <th className="px-4 py-2.5 font-semibold">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[#737373]">
                    No import batches uploaded yet.
                  </td>
                </tr>
              ) : (
                history.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-mono-tabular font-semibold text-[#C99B56]">{b.batch_ref}</td>
                    <td className="px-4 py-2.5 text-[#16273A] dark:text-white">{b.filename}</td>
                    <td className="px-4 py-2.5 text-[#525252] dark:text-[#A3A3A3]">{b.uploaded_by_name}</td>
                    <td className="px-4 py-2.5 font-mono-tabular text-[#737373]">{formatDateTime(b.created_at)}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular">{b.total_count}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular text-emerald-700 dark:text-emerald-400">
                      {b.success_count}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular text-amber-700">{b.skipped_count}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular text-red-600">{b.failed_count}</td>
                    <td className="px-4 py-2.5">
                      {b.errors.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => downloadErrorReport(b.errors)}
                          className="text-xs font-medium text-[#C99B56] hover:underline"
                        >
                          Download (.xlsx)
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
