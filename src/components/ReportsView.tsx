import { Download } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiDownload, apiFetch } from '../lib/api.ts';
import type { DatePreset, UserProfile } from '../types.ts';

interface ReportsViewProps {
  user: UserProfile;
  users: UserProfile[];
  initialReport?: string;
}

const REPORT_CATALOG: Array<{ key: string; label: string; adminOnly?: boolean }> = [
  { key: 'lead-stage-source', label: 'Lead Stage × Lead Source' },
  { key: 'lead-source', label: 'Lead Source Report' },
  { key: 'lead-stage', label: 'Lead Stage Report' },
  { key: 'employee-performance', label: 'Employee Performance Report' },
  { key: 'lead-creation', label: 'Lead Creation Report' },
  { key: 'follow-up', label: 'Follow-up Report' },
  { key: 'site-visit', label: 'Site Visit Report' },
  { key: 'booking', label: 'Booking Report' },
  { key: 'dead-lead', label: 'Dead Lead Report' },
  { key: 'duplicate-lead', label: 'Duplicate Lead Report' },
  { key: 'import-history', label: 'Import History Report', adminOnly: true },
  { key: 'inactive-leads', label: 'Inactive Leads Report (15+ Days)' },
];

export const ReportsView: React.FC<ReportsViewProps> = ({ user, users, initialReport }) => {
  const visibleReports = REPORT_CATALOG.filter((r) => !r.adminOnly || user.role === 'super_admin');
  const [selectedReport, setSelectedReport] = useState(initialReport || visibleReports[0].key);
  const [datePreset, setDatePreset] = useState<DatePreset>('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [employeeId, setEmployeeId] = useState('all');

  const [payload, setPayload] = useState<{ title: string; columns: string[]; rows: Array<Array<string | number | null>> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialReport) setSelectedReport(initialReport);
  }, [initialReport]);

  const buildQs = () => {
    const qs = new URLSearchParams({ datePreset });
    if (datePreset === 'custom' && customStart) qs.set('customStart', customStart);
    if (datePreset === 'custom' && customEnd) qs.set('customEnd', customEnd);
    if (user.role === 'super_admin' && employeeId !== 'all') qs.set('employeeId', employeeId);
    return qs;
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetch<{ title: string; columns: string[]; rows: Array<Array<string | number | null>> }>(
          `/api/reports/${selectedReport}?${buildQs().toString()}`
        );
        setPayload(res);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedReport, datePreset, customStart, customEnd, employeeId]);

  const handleExport = (format: 'xlsx' | 'csv') => {
    const qs = buildQs();
    qs.set('type', selectedReport);
    qs.set('format', format);
    apiDownload(`/api/export/report?${qs.toString()}`, `ssm_${selectedReport}.${format}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">Operational Reports</h1>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
            {user.role === 'super_admin'
              ? 'Company-wide analytics, raw employee performance metrics, inactivity, and audit reports'
              : 'Assigned leads and activity reports'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white"
          >
            <Download className="h-3.5 w-3.5" /> Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white"
          >
            <Download className="h-3.5 w-3.5" /> CSV (.csv)
          </button>
        </div>
      </div>

      {/* Report Selector Tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-2 dark:border-[#1E3349] dark:bg-[#121E2C]">
        {visibleReports.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setSelectedReport(r.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              selectedReport === r.key
                ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                : 'text-[#525252] hover:bg-[#FBF6EE]/70 dark:text-[#A3A3A3] dark:hover:bg-[#1A2C40]'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white p-3.5 dark:border-[#1E3349] dark:bg-[#121E2C]">
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
        >
          <option value="all_time">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="this_week">This Week</option>
          <option value="last_week">Last Week</option>
          <option value="last_7_days">Last 7 Days</option>
          <option value="last_30_days">Last 30 Days</option>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="custom">Custom Range</option>
        </select>

        {datePreset === 'custom' && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </>
        )}

        {user.role === 'super_admin' && selectedReport !== 'import-history' && (
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
          >
            <option value="all">All Employees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        )}

        {selectedReport === 'employee-performance' && (
          <span className="text-[11px] text-[#737373] dark:text-[#A3A3A3] ml-auto">
            Displays raw counts and INR values only (Assigned and Created tracked separately).
          </span>
        )}
      </div>

      {/* Report Data Table */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E3349] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">{payload?.title || 'Report'}</h2>
          <span className="font-mono-tabular text-xs text-[#737373]">{payload?.rows.length || 0} row(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
              <tr>
                {payload?.columns.map((col) => (
                  <th key={col} className="px-4 py-2.5 font-semibold text-[#525252] dark:text-[#A3A3A3] whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
              {loading ? (
                <tr>
                  <td colSpan={payload?.columns.length || 4} className="px-4 py-8 text-center text-[#737373]">
                    Generating report...
                  </td>
                </tr>
              ) : !payload || payload.rows.length === 0 ? (
                <tr>
                  <td colSpan={payload?.columns.length || 4} className="px-4 py-8 text-center text-[#737373]">
                    No records match the selected filters.
                  </td>
                </tr>
              ) : (
                payload.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[#FBF6EE]/30 dark:hover:bg-[#1A2C40]">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-4 py-2.5 whitespace-nowrap ${
                          typeof cell === 'number'
                            ? 'font-mono-tabular text-[#16273A] dark:text-white font-medium'
                            : 'text-[#262626] dark:text-[#E5E5E5]'
                        }`}
                      >
                        {typeof cell === 'number' && payload.columns[cIdx]?.includes('(INR)')
                          ? `₹${cell.toLocaleString('en-IN')}`
                          : cell === null || cell === undefined || cell === ''
                          ? '—'
                          : String(cell)}
                      </td>
                    ))}
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
