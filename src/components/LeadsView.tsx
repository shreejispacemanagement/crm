import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Download,
  Filter,
  Kanban,
  Plus,
  RotateCcw,
  Search,
  Table as TableIcon,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { apiDownload, apiFetch, formatBudgetRange, formatDateOnly } from '../lib/api.ts';
import {
  ALL_TABLE_COLUMNS,
  type CompanySettings,
  DEFAULT_TABLE_COLUMNS,
  type LeadRecord,
  type LeadViewMode,
  type MasterItem,
  type UserProfile,
} from '../types.ts';
import { LeadContactActions } from './LeadContactActions.tsx';
import { BookingModal, DeadModal } from './StageModals.tsx';

interface LeadsViewProps {
  user: UserProfile;
  users: UserProfile[];
  masters: MasterItem[];
  settings: CompanySettings;
  onUserUpdated: (u: UserProfile) => void;
  onSettingsUpdated: (s: CompanySettings) => void;
  onOpenLead: (leadId: string) => void;
  onCreateLead: () => void;
  refreshSignal: number;
}

export const LeadsView: React.FC<LeadsViewProps> = ({
  user,
  users,
  masters,
  settings,
  onUserUpdated,
  onSettingsUpdated,
  onOpenLead,
  onCreateLead,
  refreshSignal,
}) => {
  const [viewMode, setViewMode] = useState<LeadViewMode>(user.lead_view_preference || 'table');
  const [pageSize, setPageSize] = useState<number>(user.page_size_preference || 25);
  const [page, setPage] = useState(1);

  const initialCols =
    user.table_columns_preference && user.table_columns_preference.length > 0
      ? user.table_columns_preference
      : settings.default_table_columns.length > 0
      ? settings.default_table_columns
      : DEFAULT_TABLE_COLUMNS;
  const [columns, setColumns] = useState<string[]>(initialCols);
  const [showColumnPanel, setShowColumnPanel] = useState(false);

  // Search & Filters (PRD 10.4)
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [stageFilter, setStageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState('all');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('all');
  const [localityFilter, setLocalityFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'updated'>('newest');

  // Kanban toggle for closed leads (PRD 10.3)
  const [showClosedKanban, setShowClosedKanban] = useState(false);
  const [draggedLead, setDraggedLead] = useState<LeadRecord | null>(null);

  // Modals for drag-drop to Booking Done or Dead
  const [pendingBooking, setPendingBooking] = useState<{ lead: LeadRecord; stageName: string } | null>(null);
  const [pendingDead, setPendingDead] = useState<{ lead: LeadRecord; stageName: string } | null>(null);

  // Export menu
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const stages = useMemo(
    () => masters.filter((m) => m.category === 'lead_stage' && m.is_active === 1).sort((a, b) => a.sort_order - b.sort_order),
    [masters]
  );
  const sources = masters.filter((m) => m.category === 'lead_source');
  const propertyTypes = masters.filter((m) => m.category === 'property_type');
  const transactionTypes = masters.filter((m) => m.category === 'transaction_type');
  const localities = masters.filter((m) => m.category === 'locality');
  const deadReasons = masters.filter((m) => m.category === 'dead_reason');

  const buildQueryString = (includeAll: boolean) => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    if (stageFilter !== 'all') qs.set('stage', stageFilter);
    if (sourceFilter !== 'all') qs.set('leadSource', sourceFilter);
    if (assignedToFilter !== 'all') qs.set('assignedTo', assignedToFilter);
    if (propertyTypeFilter !== 'all') qs.set('propertyType', propertyTypeFilter);
    if (transactionTypeFilter !== 'all') qs.set('transactionType', transactionTypeFilter);
    if (localityFilter !== 'all') qs.set('locality', localityFilter);
    if (datePreset !== 'all_time') qs.set('datePreset', datePreset);
    if (datePreset === 'custom' && customStart) qs.set('customStart', customStart);
    if (datePreset === 'custom' && customEnd) qs.set('customEnd', customEnd);
    if (inactiveOnly) qs.set('inactiveOnly', 'true');
    qs.set('sort', sort);
    if (includeAll) {
      qs.set('all', 'true');
    } else {
      qs.set('page', String(page));
      qs.set('pageSize', String(pageSize));
    }
    return qs.toString();
  };

  const fetchLeads = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch<{ leads: LeadRecord[]; total: number }>(
        `/api/leads?${buildQueryString(viewMode === 'kanban')}`
      );
      setLeads(res.leads);
      setTotal(res.total);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [
    viewMode,
    page,
    pageSize,
    search,
    stageFilter,
    sourceFilter,
    assignedToFilter,
    propertyTypeFilter,
    transactionTypeFilter,
    localityFilter,
    datePreset,
    customStart,
    customEnd,
    inactiveOnly,
    sort,
    refreshSignal,
  ]);

  const handleSwitchView = async (next: LeadViewMode) => {
    setViewMode(next);
    setPage(1);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ lead_view_preference: next }),
      });
      onUserUpdated(res.user);
    } catch {
      // non-blocking
    }
  };

  const handleChangePageSize = async (nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ page_size_preference: nextSize }),
      });
      onUserUpdated(res.user);
    } catch {
      // non-blocking
    }
  };

  const toggleColumn = (key: string) => {
    setColumns((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  };

  const moveColumn = (key: string, dir: -1 | 1) => {
    const idx = columns.indexOf(key);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= columns.length) return;
    const copy = [...columns];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setColumns(copy);
  };

  const savePersonalColumns = async () => {
    const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ table_columns_preference: columns }),
    });
    onUserUpdated(res.user);
    setShowColumnPanel(false);
  };

  const restoreDefaultColumns = async () => {
    const def = settings.default_table_columns.length > 0 ? settings.default_table_columns : DEFAULT_TABLE_COLUMNS;
    setColumns(def);
    const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ table_columns_preference: null }),
    });
    onUserUpdated(res.user);
    setShowColumnPanel(false);
  };

  const saveCompanyDefaultColumns = async () => {
    const updated = await apiFetch<CompanySettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ default_table_columns: columns }),
    });
    onSettingsUpdated(updated);
    setShowColumnPanel(false);
  };

  const handleDropStage = async (lead: LeadRecord, targetStage: MasterItem) => {
    setActionError(null);
    if (lead.stage === targetStage.name) return;
    const currentStageMeta = masters.find((m) => m.category === 'lead_stage' && m.name === lead.stage);
    if (currentStageMeta?.is_terminal) {
      setActionError('Closed leads (Booking Done / Dead) cannot be dragged. Super Admin can reopen them from Lead Details.');
      return;
    }
    if (targetStage.terminal_outcome === 'won' || targetStage.system_key === 'booking_done') {
      setPendingBooking({ lead, stageName: targetStage.name });
      return;
    }
    if (targetStage.terminal_outcome === 'lost' || targetStage.system_key === 'dead') {
      setPendingDead({ lead, stageName: targetStage.name });
      return;
    }

    try {
      await apiFetch(`/api/leads/${lead.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: targetStage.name }),
      });
      fetchLeads();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleExport = async (format: 'xlsx' | 'csv', mode: 'basic' | 'detailed') => {
    setShowExportMenu(false);
    try {
      const qs = buildQueryString(true);
      await apiDownload(`/api/export/leads?${qs}&format=${format}&mode=${mode}`, `ssm_leads_${mode}.${format}`);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const kanbanStages = showClosedKanban ? stages : stages.filter((s) => s.is_terminal === 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const renderCell = (lead: LeadRecord, colKey: string) => {
    switch (colKey) {
      case 'lead_code':
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono-tabular font-semibold text-[#C99B56]">{lead.lead_code}</span>
            {lead.is_inactive === 1 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                Inactive
              </span>
            )}
          </div>
        );
      case 'customer_name':
        return (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-[#16273A] dark:text-white">{lead.customer_name}</div>
              {lead.company_name && <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3]">{lead.company_name}</div>}
            </div>
            <LeadContactActions
              lead={lead}
              variant="table"
              onLogged={() => fetchLeads(true)}
              onError={(msg) => setActionError(msg)}
            />
          </div>
        );
      case 'mobile':
        return <span className="font-mono-tabular text-[#262626] dark:text-[#E5E5E5]">{lead.mobile}</span>;
      case 'requirement':
        return (
          <span className="text-[#262626] dark:text-[#E5E5E5]">
            {[lead.bhk_config, lead.property_subtype, lead.transaction_type].filter(Boolean).join(' · ')}
          </span>
        );
      case 'localities':
        return <span className="text-[#525252] dark:text-[#A3A3A3]">{lead.localities.join(', ')}</span>;
      case 'budget':
        return (
          <span className="font-mono-tabular text-[#16273A] dark:text-white">
            {formatBudgetRange(lead.budget_from, lead.budget_to)}
          </span>
        );
      case 'stage':
        return (
          <span
            className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${
              lead.stage === 'Booking Done'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : lead.stage === 'Dead'
                ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                : 'bg-[#FBF6EE] text-[#16273A] dark:bg-[#2A2318] dark:text-[#FBF6EE]'
            }`}
          >
            {lead.stage}
          </span>
        );
      case 'lead_source':
        return <span className="text-[#525252] dark:text-[#A3A3A3]">{lead.lead_source}</span>;
      case 'assigned_to':
        return <span className="text-[#262626] dark:text-[#E5E5E5]">{lead.assigned_to_name}</span>;
      case 'last_interaction':
        return (
          <span className="font-mono-tabular text-[#525252] dark:text-[#A3A3A3]">
            {formatDateOnly(lead.last_qualifying_interaction_at)}
          </span>
        );
      case 'created_at':
        return <span className="font-mono-tabular text-[#525252] dark:text-[#A3A3A3]">{formatDateOnly(lead.created_at)}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">Leads Pipeline</h1>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
            <span className="font-mono-tabular font-semibold text-[#16273A] dark:text-white">{total}</span> matching lead
            {total === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Toggle */}
          <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white p-0.5 dark:border-[#1E3349] dark:bg-[#121E2C]">
            <button
              type="button"
              onClick={() => handleSwitchView('table')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                viewMode === 'table'
                  ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                  : 'text-[#525252] dark:text-[#A3A3A3]'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" /> Table
            </button>
            <button
              type="button"
              onClick={() => handleSwitchView('kanban')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                  : 'text-[#525252] dark:text-[#A3A3A3]'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>

          {viewMode === 'table' && (
            <button
              type="button"
              onClick={() => setShowColumnPanel(!showColumnPanel)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE]/60 dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white whitespace-nowrap"
            >
              <Columns3 className="h-3.5 w-3.5" /> Columns
            </button>
          )}

          {/* Export dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE]/60 dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-lg border border-[#E2E8F0] bg-white p-1.5 shadow-lg z-30 dark:border-[#1E3349] dark:bg-[#121E2C]">
                <button
                  type="button"
                  onClick={() => handleExport('xlsx', 'basic')}
                  className="w-full text-left rounded-md px-3 py-1.5 text-xs hover:bg-[#FBF6EE]/70 dark:text-white dark:hover:bg-[#1A2C40]"
                >
                  Basic Export (Excel .xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv', 'basic')}
                  className="w-full text-left rounded-md px-3 py-1.5 text-xs hover:bg-[#FBF6EE]/70 dark:text-white dark:hover:bg-[#1A2C40]"
                >
                  Basic Export (CSV .csv)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('xlsx', 'detailed')}
                  className="w-full text-left rounded-md px-3 py-1.5 text-xs hover:bg-[#FBF6EE]/70 dark:text-white dark:hover:bg-[#1A2C40]"
                >
                  Detailed Export (Excel .xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv', 'detailed')}
                  className="w-full text-left rounded-md px-3 py-1.5 text-xs hover:bg-[#FBF6EE]/70 dark:text-white dark:hover:bg-[#1A2C40]"
                >
                  Detailed Export (CSV .csv)
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onCreateLead}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#16273A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#20364F] dark:bg-[#C99B56] dark:text-[#16273A] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" /> New Lead
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-500/30 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-semibold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Search + Sort + Filter Toggle Bar */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 dark:border-[#1E3349] dark:bg-[#121E2C] space-y-3">
        <div className="flex flex-col md:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#737373]" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search Lead ID (SSM-...), customer name, mobile, alt/WhatsApp, company, or booked project..."
              className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 pl-9 pr-3 text-xs text-[#16273A] focus:border-[#C99B56] focus:outline-none dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'newest' | 'oldest' | 'updated')}
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#16273A] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <option value="newest">Sort: Newest Created</option>
              <option value="oldest">Sort: Oldest Created</option>
              <option value="updated">Sort: Recently Updated</option>
            </select>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap ${
                showFilters
                  ? 'border-[#C99B56] bg-[#FBF6EE] text-[#16273A] dark:bg-[#2A2318] dark:text-[#FBF6EE]'
                  : 'border-[#E2E8F0] bg-white text-[#16273A] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white'
              }`}
            >
              <Filter className="h-3.5 w-3.5" /> Filters
            </button>

            {viewMode === 'kanban' && (
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs text-[#16273A] dark:border-[#1E3349] dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={showClosedKanban}
                  onChange={(e) => setShowClosedKanban(e.target.checked)}
                  className="accent-[#C99B56]"
                />
                Show Booking Done &amp; Dead
              </label>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-3 border-t border-[#E2E8F0] dark:border-[#1E3349]">
            <select
              value={stageFilter}
              onChange={(e) => {
                setStageFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <option value="all">All Stages</option>
              {stages.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <option value="all">All Sources</option>
              {sources.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            {user.role === 'super_admin' && (
              <select
                value={assignedToFilter}
                onChange={(e) => {
                  setAssignedToFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              >
                <option value="all">All Employees</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={propertyTypeFilter}
              onChange={(e) => {
                setPropertyTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <option value="all">All Property Types</option>
              {propertyTypes.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={transactionTypeFilter}
              onChange={(e) => {
                setTransactionTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <option value="all">Sale &amp; Rent</option>
              {transactionTypes.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>

            <select
              value={localityFilter}
              onChange={(e) => {
                setLocalityFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <option value="all">All Localities</option>
              {localities.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>

            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
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

            <label className="inline-flex items-center gap-1.5 text-xs text-[#16273A] dark:text-white cursor-pointer px-1">
              <input
                type="checkbox"
                checked={inactiveOnly}
                onChange={(e) => {
                  setInactiveOnly(e.target.checked);
                  setPage(1);
                }}
                className="accent-[#C99B56]"
              />
              Inactive (15d+) only
            </label>

            <button
              type="button"
              onClick={() => {
                setStageFilter('all');
                setSourceFilter('all');
                setAssignedToFilter('all');
                setPropertyTypeFilter('all');
                setTransactionTypeFilter('all');
                setLocalityFilter('all');
                setDatePreset('all_time');
                setInactiveOnly(false);
                setSearch('');
                setPage(1);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#C99B56] hover:underline"
            >
              <RotateCcw className="h-3 w-3" /> Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Customizable Columns Panel (PRD 10.2) */}
      {showColumnPanel && viewMode === 'table' && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#1E3349] dark:bg-[#121E2C]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-semibold text-[#16273A] dark:text-white">
              Customize Table Columns (Show / Hide / Reorder)
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={restoreDefaultColumns}
                className="rounded-md border border-[#E2E8F0] px-2.5 py-1 text-xs text-[#525252] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-[#A3A3A3]"
              >
                Restore Defaults
              </button>
              {user.role === 'super_admin' && (
                <button
                  type="button"
                  onClick={saveCompanyDefaultColumns}
                  className="rounded-md border border-[#C99B56] px-2.5 py-1 text-xs font-medium text-[#C99B56] hover:bg-[#C99B56]/10"
                >
                  Save as Company Default
                </button>
              )}
              <button
                type="button"
                onClick={savePersonalColumns}
                className="rounded-md bg-[#16273A] px-3 py-1 text-xs font-semibold text-white dark:bg-[#C99B56] dark:text-[#16273A]"
              >
                Save My Preferences
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {columns.map((key) => {
              const meta = ALL_TABLE_COLUMNS.find((c) => c.key === key);
              if (!meta) return null;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-xs dark:border-[#1E3349]"
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked onChange={() => toggleColumn(key)} className="accent-[#C99B56]" />
                    <span className="font-medium text-[#16273A] dark:text-white">{meta.label}</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveColumn(key, -1)} className="p-0.5 text-[#737373] hover:text-[#16273A]">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => moveColumn(key, 1)} className="p-0.5 text-[#737373] hover:text-[#16273A]">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
            {ALL_TABLE_COLUMNS.filter((c) => !columns.includes(c.key)).map((c) => (
              <label
                key={c.key}
                className="flex items-center gap-2 rounded-lg border border-dashed border-[#E2E8F0] px-2.5 py-1.5 text-xs text-[#737373] cursor-pointer dark:border-[#1E3349]"
              >
                <input type="checkbox" checked={false} onChange={() => toggleColumn(c.key)} className="accent-[#C99B56]" />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white dark:border-[#1E3349] dark:bg-[#121E2C] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
                <tr>
                  {columns.map((key) => {
                    const meta = ALL_TABLE_COLUMNS.find((c) => c.key === key);
                    return (
                      <th key={key} className="px-4 py-3 font-semibold text-[#525252] dark:text-[#A3A3A3] whitespace-nowrap">
                        {meta?.label || key}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/70 dark:divide-[#1E3349]">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={columns.length} className="px-4 py-3.5">
                        <div className="h-4 rounded bg-[#FBF6EE]/60 dark:bg-[#242424]" />
                      </td>
                    </tr>
                  ))
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-center text-[#737373] dark:text-[#A3A3A3]">
                      No leads match your current search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => onOpenLead(lead.id)}
                      className="cursor-pointer hover:bg-[#FBF6EE]/40 dark:hover:bg-[#1A2C40] transition-colors"
                    >
                      {columns.map((key) => (
                        <td key={key} className="px-4 py-3 whitespace-nowrap">
                          {renderCell(lead, key)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer (10/25/50/100) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC]/60 dark:border-[#1E3349] dark:bg-[#0F1926] text-xs">
            <div className="flex items-center gap-2 text-[#525252] dark:text-[#A3A3A3]">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handleChangePageSize(Number(e.target.value))}
                className="rounded border border-[#E2E8F0] bg-white px-2 py-1 text-xs font-mono-tabular dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono-tabular text-[#525252] dark:text-[#A3A3A3]">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium disabled:opacity-40 dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium disabled:opacity-40 dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* KANBAN VIEW (PRD 10.3) */
        <div className="flex gap-3.5 overflow-x-auto pb-4">
          {kanbanStages.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage.name);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedLead) {
                    handleDropStage(draggedLead, stage);
                    setDraggedLead(null);
                  }
                }}
                className="w-72 shrink-0 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-[#1E3349] dark:bg-[#151515]"
              >
                <div className="flex items-center justify-between px-1 pb-2.5 mb-2.5 border-b border-[#E2E8F0] dark:border-[#1E3349]">
                  <span className="text-xs font-semibold text-[#16273A] dark:text-white truncate">{stage.name}</span>
                  <span className="font-mono-tabular text-xs font-semibold text-[#C99B56]">{stageLeads.length}</span>
                </div>

                <div className="space-y-2.5 min-h-[180px]">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable={!(stage.is_terminal === 1)}
                      onDragStart={() => setDraggedLead(lead)}
                      onClick={() => onOpenLead(lead.id)}
                      className="cursor-pointer rounded-lg border border-[#E2E8F0] bg-white p-3 hover:border-[#C99B56] dark:border-[#1E3349] dark:bg-[#1B1B1B] dark:hover:border-[#C99B56] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono-tabular font-semibold text-[#C99B56]">{lead.lead_code}</span>
                        {lead.is_inactive === 1 && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-[#16273A] dark:text-white truncate">
                          {lead.customer_name}
                        </div>
                        <LeadContactActions
                          lead={lead}
                          variant="kanban"
                          onLogged={() => fetchLeads(true)}
                          onError={(msg) => setActionError(msg)}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-[#525252] dark:text-[#A3A3A3] truncate">
                        {[lead.bhk_config, lead.property_subtype, lead.transaction_type].filter(Boolean).join(' · ')}
                      </div>
                      <div className="mt-1 text-[11px] text-[#737373] dark:text-[#A3A3A3] truncate">
                        {lead.localities.join(', ')}
                      </div>
                      <div className="mt-2 pt-2 border-t border-[#E2E8F0]/60 dark:border-[#1E3349] flex items-center justify-between text-[11px]">
                        <span className="font-mono-tabular font-medium text-[#16273A] dark:text-white">
                          {formatBudgetRange(lead.budget_from, lead.budget_to)}
                        </span>
                        <span className="text-[#737373] dark:text-[#A3A3A3] truncate max-w-[100px]">
                          {lead.assigned_to_name}
                        </span>
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="py-8 text-center text-[11px] text-[#737373] dark:text-[#737373]">Drop lead here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingBooking && (
        <BookingModal
          lead={pendingBooking.lead}
          targetStageName={pendingBooking.stageName}
          onClose={() => setPendingBooking(null)}
          onCompleted={() => {
            setPendingBooking(null);
            fetchLeads();
          }}
        />
      )}

      {pendingDead && (
        <DeadModal
          lead={pendingDead.lead}
          targetStageName={pendingDead.stageName}
          deadReasons={deadReasons}
          onClose={() => setPendingDead(null)}
          onCompleted={() => {
            setPendingDead(null);
            fetchLeads();
          }}
        />
      )}
    </div>
  );
};
