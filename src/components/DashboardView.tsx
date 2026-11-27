import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Filter,
  Phone,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiDownload, apiFetch, formatDateTime } from '../lib/api.ts';
import type { ActivityRecord, DatePreset, LeadRecord, UserProfile } from '../types.ts';

export interface DashboardLeadSummary {
  id: string;
  lead_code: string;
  customer_name: string;
  mobile: string;
  stage: string;
  lead_source: string;
  assigned_to: string;
  assigned_to_email?: string;
  assigned_to_name: string;
  is_inactive?: number;
  created_at?: string;
  updated_at?: string;
}

interface DashboardData {
  cards: {
    totalLeads: number;
    newLeads: number;
    activeLeads: number;
    bookingDone: number;
    deadLeads: number;
  };
  sourceDistribution: Array<{ name: string; count: number }>;
  stageDistribution: Array<{ name: string; count: number }>;
  sourcesList: string[];
  filteredLeads: DashboardLeadSummary[];
  leadCodeMap: Record<string, { id: string; customer_name: string; mobile: string }>;
  employeeAllocation: Array<{
    id: string;
    full_name: string;
    email?: string;
    designation: string;
    total_leads: number;
    active_leads: number;
    won_leads: number;
  }>;
  todaysActivities: ActivityRecord[];
  overdueActivities: ActivityRecord[];
  upcomingVisitsAndMeetings: ActivityRecord[];
  inactiveLeads: Array<{
    id: string;
    lead_code: string;
    customer_name: string;
    mobile: string;
    stage: string;
    lead_source?: string;
    last_qualifying_interaction_at: string;
    last_interaction_type: string | null;
    assigned_to?: string;
    assigned_to_name: string;
  }>;
  recentActivity: Array<{
    id: string;
    lead_id: string;
    lead_code: string;
    customer_name: string;
    customer_mobile: string;
    event_type: string;
    description: string;
    employee_name: string;
    created_at: string;
  }>;
  recentlyUpdatedLeads: LeadRecord[];
}

interface DashboardViewProps {
  user: UserProfile;
  users: UserProfile[];
  onOpenLead: (leadId: string) => void;
  onCreateLead: () => void;
  onOpenInactiveReport: () => void;
}

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'all_time', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
];

const DASHBOARD_REPORTS: Array<{ key: string; label: string; adminOnly?: boolean }> = [
  { key: 'lead-stage-source', label: 'Lead Stage × Lead Source' },
  { key: 'lead-source', label: 'Lead Source' },
  { key: 'lead-stage', label: 'Lead Stage' },
  { key: 'employee-performance', label: 'Employee Performance' },
  { key: 'lead-creation', label: 'Lead Creation' },
  { key: 'follow-up', label: 'Follow-up' },
  { key: 'site-visit', label: 'Site Visit' },
  { key: 'booking', label: 'Booking' },
  { key: 'dead-lead', label: 'Dead Lead' },
  { key: 'duplicate-lead', label: 'Duplicate Lead' },
  { key: 'import-history', label: 'Import History', adminOnly: true },
  { key: 'inactive-leads', label: 'Inactive Leads (15d+)' },
];

interface HoverLeadItem {
  id: string;
  lead_code: string;
  customer_name: string;
  mobile: string;
  stage?: string;
  assigned_to_name?: string;
}

const LeadHoverCard: React.FC<{
  leadCode?: string | null;
  customerName?: string | null;
  mobile?: string | null;
  children: React.ReactNode;
}> = ({ leadCode, customerName, mobile, children }) => (
  <div className="relative group">
    {children}
    <div
      role="tooltip"
      className="pointer-events-none opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-150 absolute left-0 bottom-full mb-1.5 z-40 w-max max-w-[260px] rounded-lg border border-[#C99B56]/60 bg-[#16273A] px-3 py-2 text-left text-white shadow-lg dark:bg-[#0C141E]"
    >
      <div className="font-mono-tabular text-[11px] font-bold text-[#C99B56]">{leadCode || 'Lead'}</div>
      <div className="text-xs font-semibold text-white truncate">{customerName || 'Customer'}</div>
      <div className="mt-0.5 inline-flex items-center gap-1 font-mono-tabular text-[11px] text-[#E2E8F0]">
        <Phone className="h-3 w-3 text-[#C99B56] shrink-0" />
        <span>{mobile || 'No number'}</span>
      </div>
    </div>
  </div>
);

const LeadGroupHoverTrigger: React.FC<{
  title: string;
  leads: HoverLeadItem[];
  onOpenLead: (leadId: string) => void;
  onViewAll?: () => void;
  className?: string;
  children: React.ReactNode;
}> = ({ title, leads, onOpenLead, onViewAll, className = '', children }) => {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: 'bottom',
  });

  const cancelClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 130);
  };

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 310;
    const estimatedHeight = Math.min(340, 88 + Math.min(leads.length, 7) * 44);
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeTop = spaceBelow < estimatedHeight + 16 && rect.top > estimatedHeight + 16;

    const rawLeft = rect.left;
    const clampedLeft = Math.max(12, Math.min(rawLeft, window.innerWidth - popoverWidth - 12));
    const top = placeTop ? rect.top - 6 : rect.bottom + 6;

    setCoords({
      top,
      left: clampedLeft,
      placement: placeTop ? 'top' : 'bottom',
    });
  }, [leads.length]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleOpen = () => {
    if (leads.length === 0) return;
    cancelClose();
    updatePosition();
    setOpen(true);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleOpen}
        onMouseLeave={scheduleClose}
        className={className}
      >
        {children}
      </div>
      {open &&
        leads.length > 0 &&
        createPortal(
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top,
              transform: coords.placement === 'top' ? 'translateY(-100%)' : 'translateY(0)',
              width: 310,
              zIndex: 80,
            }}
            className="rounded-xl border border-[#C99B56]/60 bg-[#16273A] text-white shadow-2xl dark:bg-[#0C141E]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold text-[#C99B56]">{title}</div>
                <div className="text-[10px] text-[#CBD5E1]">{leads.length} lead{leads.length === 1 ? '' : 's'} · Click to open</div>
              </div>
              {onViewAll && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onViewAll();
                  }}
                  className="shrink-0 rounded bg-[#C99B56] px-2 py-0.5 text-[10px] font-bold text-[#16273A] hover:bg-[#D8AD6E]"
                >
                  View all
                </button>
              )}
            </div>
            <div className="max-h-[270px] overflow-y-auto divide-y divide-white/10">
              {leads.slice(0, 7).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onOpenLead(l.id);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-tabular text-[11px] font-bold text-[#C99B56] shrink-0">
                        {l.lead_code}
                      </span>
                      <span className="truncate text-xs font-semibold text-white">{l.customer_name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 font-mono-tabular text-[11px] text-[#CBD5E1]">
                      <Phone className="h-3 w-3 text-[#C99B56] shrink-0" />
                      <span>{l.mobile || 'No number'}</span>
                      {l.stage && <span className="text-[#94A3B8] truncate">· {l.stage}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-[#C99B56] shrink-0" />
                </button>
              ))}
            </div>
            {leads.length > 7 && onViewAll && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onViewAll();
                }}
                className="w-full border-t border-white/10 px-3 py-2 text-center text-[11px] font-semibold text-[#C99B56] hover:bg-white/5"
              >
                + {leads.length - 7} more lead{leads.length - 7 === 1 ? '' : 's'} — View all
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  users,
  onOpenLead,
  onCreateLead,
  onOpenInactiveReport,
}) => {
  const [datePreset, setDatePreset] = useState<DatePreset>('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('all');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Drilldown modal state
  const [drilldown, setDrilldown] = useState<{
    title: string;
    subtitle?: string;
    leads: DashboardLeadSummary[];
  } | null>(null);
  const [drillSearch, setDrillSearch] = useState('');

  // Inline Dashboard Reports state (synced with Dashboard datePreset & employeeId)
  const isAdmin = user.role === 'super_admin';
  const visibleReports = useMemo(
    () => DASHBOARD_REPORTS.filter((r) => !r.adminOnly || isAdmin),
    [isAdmin]
  );
  const [selectedReport, setSelectedReport] = useState<string>('lead-stage-source');
  const [reportPayload, setReportPayload] = useState<{
    title: string;
    columns: string[];
    rows: Array<Array<string | number | null>>;
  } | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  const buildFilterQs = useCallback(() => {
    const qs = new URLSearchParams({ datePreset });
    if (datePreset === 'custom' && customStart) qs.set('customStart', customStart);
    if (datePreset === 'custom' && customEnd) qs.set('customEnd', customEnd);
    if (isAdmin && employeeId !== 'all') qs.set('employeeId', employeeId);
    return qs;
  }, [datePreset, customStart, customEnd, isAdmin, employeeId]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildFilterQs();
      const res = await apiFetch<DashboardData>(`/api/dashboard?${qs.toString()}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [buildFilterQs]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const qs = buildFilterQs();
      const res = await apiFetch<{ title: string; columns: string[]; rows: Array<Array<string | number | null>> }>(
        `/api/reports/${selectedReport}?${qs.toString()}`
      );
      setReportPayload(res);
    } finally {
      setReportLoading(false);
    }
  }, [selectedReport, buildFilterQs]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleExportReport = (reportKey: string, format: 'xlsx' | 'csv') => {
    const qs = buildFilterQs();
    qs.set('type', reportKey);
    qs.set('format', format);
    apiDownload(`/api/export/report?${qs.toString()}`, `ssm_${reportKey}.${format}`);
  };

  const openDrilldown = (title: string, leads: DashboardLeadSummary[], subtitle?: string) => {
    setDrillSearch('');
    setDrilldown({ title, subtitle, leads });
  };

  // Precomputed filtered lead buckets for cards, stages, sources, employees, and Stage x Source matrix
  const allFilteredLeads = data?.filteredLeads ?? [];

  const cardBuckets = useMemo(() => {
    return {
      total: allFilteredLeads,
      newLeads: allFilteredLeads.filter((l) => l.stage === 'New Lead'),
      activeLeads: allFilteredLeads.filter((l) => l.stage !== 'Booking Done' && l.stage !== 'Dead'),
      bookingDone: allFilteredLeads.filter((l) => l.stage === 'Booking Done'),
      deadLeads: allFilteredLeads.filter((l) => l.stage === 'Dead'),
    };
  }, [allFilteredLeads]);

  const leadsByStage = useMemo(() => {
    const map = new Map<string, DashboardLeadSummary[]>();
    for (const l of allFilteredLeads) {
      const arr = map.get(l.stage) || [];
      arr.push(l);
      map.set(l.stage, arr);
    }
    return map;
  }, [allFilteredLeads]);

  const leadsBySource = useMemo(() => {
    const map = new Map<string, DashboardLeadSummary[]>();
    for (const l of allFilteredLeads) {
      const src = l.lead_source || 'Unspecified';
      const arr = map.get(src) || [];
      arr.push(l);
      map.set(src, arr);
    }
    return map;
  }, [allFilteredLeads]);

  const inactiveSummaries: DashboardLeadSummary[] = useMemo(
    () =>
      (data?.inactiveLeads ?? []).map((l) => ({
        id: l.id,
        lead_code: l.lead_code,
        customer_name: l.customer_name,
        mobile: l.mobile,
        stage: l.stage,
        lead_source: l.lead_source || '',
        assigned_to: l.assigned_to || '',
        assigned_to_name: l.assigned_to_name,
        is_inactive: 1,
      })),
    [data?.inactiveLeads]
  );

  // Stage x Source matrix buckets
  const stageNamesForMatrix = useMemo(() => {
    const names = (data?.stageDistribution ?? []).map((s) => s.name);
    for (const l of allFilteredLeads) {
      if (l.stage && !names.includes(l.stage)) names.push(l.stage);
    }
    return names;
  }, [data?.stageDistribution, allFilteredLeads]);

  const sourceNamesForMatrix = useMemo(() => {
    const names = [...(data?.sourcesList ?? [])];
    for (const l of allFilteredLeads) {
      const src = l.lead_source || 'Unspecified';
      if (!names.includes(src)) names.push(src);
    }
    return names;
  }, [data?.sourcesList, allFilteredLeads]);

  const matrixBuckets = useMemo(() => {
    const map = new Map<string, DashboardLeadSummary[]>();
    for (const l of allFilteredLeads) {
      const key = `${l.stage || 'Unspecified'}|||${l.lead_source || 'Unspecified'}`;
      const arr = map.get(key) || [];
      arr.push(l);
      map.set(key, arr);
    }
    return map;
  }, [allFilteredLeads]);

  const employeeBuckets = (emp: DashboardData['employeeAllocation'][number]) => {
    const emailLower = (emp.email || '').toLowerCase();
    const total = allFilteredLeads.filter(
      (l) => l.assigned_to === emp.id || (emailLower && (l.assigned_to_email || '').toLowerCase() === emailLower)
    );
    return {
      total,
      active: total.filter((l) => l.stage !== 'Booking Done' && l.stage !== 'Dead'),
      won: total.filter((l) => l.stage === 'Booking Done'),
    };
  };

  const drillFilteredLeads = useMemo(() => {
    if (!drilldown) return [];
    const q = drillSearch.trim().toLowerCase();
    if (!q) return drilldown.leads;
    return drilldown.leads.filter(
      (l) =>
        l.lead_code.toLowerCase().includes(q) ||
        l.customer_name.toLowerCase().includes(q) ||
        l.mobile.toLowerCase().includes(q) ||
        l.stage.toLowerCase().includes(q) ||
        l.lead_source.toLowerCase().includes(q) ||
        l.assigned_to_name.toLowerCase().includes(q)
    );
  }, [drilldown, drillSearch]);

  const activeFilterSummary = useMemo(() => {
    const dateLabel = DATE_PRESETS.find((d) => d.value === datePreset)?.label || 'All Time';
    const empName =
      !isAdmin
        ? user.full_name
        : employeeId === 'all'
        ? 'All Employees'
        : users.find((u) => u.id === employeeId)?.full_name || 'Employee';
    return `${dateLabel} · ${empName}`;
  }, [datePreset, employeeId, isAdmin, user.full_name, users]);

  const sortedTeam = useMemo(
    () => [...users].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [users]
  );

  return (
    <div className="space-y-6">
      {/* Header + Date & Employee Filter Bar */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">
              {isAdmin ? 'Dashboard' : 'My Sales Workspace'}
            </h1>
            <p className="text-xs text-[#737373] dark:text-[#A3A3A3] mt-0.5">
              {isAdmin
                ? 'Company-wide pipeline, Stage × Source matrix, lead allocation, and live reports'
                : `Assigned pipeline, follow-ups, visits, and active requirements for ${user.full_name}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 dark:border-[#1E3349] dark:bg-[#121E2C]">
                <Users className="h-3.5 w-3.5 text-[#C99B56] shrink-0" />
                <select
                  aria-label="Filter dashboard by employee"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="bg-transparent text-xs font-medium text-[#16273A] dark:text-white focus:outline-none py-0.5 pr-1"
                >
                  <option value="all" className="dark:bg-[#121E2C]">
                    All Employees
                  </option>
                  {sortedTeam.map((u) => (
                    <option key={u.id} value={u.id} className="dark:bg-[#121E2C]">
                      {u.full_name}
                      {u.status === 'inactive' ? ' (Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white p-1 dark:border-[#1E3349] dark:bg-[#121E2C]">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDatePreset(p.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    datePreset === p.value
                      ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                      : 'text-[#525252] hover:bg-[#FBF6EE]/60 dark:text-[#A3A3A3] dark:hover:bg-[#1A2C40]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {datePreset === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white"
                />
                <span className="text-xs text-[#737373]">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white"
                />
              </div>
            )}

            {(datePreset !== 'all_time' || employeeId !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setDatePreset('all_time');
                  setCustomStart('');
                  setCustomEnd('');
                  setEmployeeId('all');
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#737373] hover:text-[#16273A] dark:border-[#1E3349] dark:bg-[#121E2C] dark:hover:text-white"
              >
                <Filter className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards (Hover + Clickable) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          {
            label: isAdmin ? 'Total Leads' : 'My Total Leads',
            val: data?.cards.totalLeads ?? 0,
            leads: cardBuckets.total,
            accent: false,
          },
          {
            label: 'New Leads',
            val: data?.cards.newLeads ?? 0,
            leads: cardBuckets.newLeads,
            accent: false,
          },
          {
            label: 'Active Leads',
            val: data?.cards.activeLeads ?? 0,
            leads: cardBuckets.activeLeads,
            accent: true,
          },
          {
            label: 'Booking Done',
            val: data?.cards.bookingDone ?? 0,
            leads: cardBuckets.bookingDone,
            tone: 'emerald' as const,
          },
          {
            label: 'Dead Leads',
            val: data?.cards.deadLeads ?? 0,
            leads: cardBuckets.deadLeads,
            tone: 'neutral' as const,
          },
        ].map((card) => (
          <LeadGroupHoverTrigger
            key={card.label}
            title={card.label}
            leads={card.leads}
            onOpenLead={onOpenLead}
            onViewAll={() => openDrilldown(card.label, card.leads, activeFilterSummary)}
          >
            <button
              type="button"
              onClick={() => openDrilldown(card.label, card.leads, activeFilterSummary)}
              className={`w-full text-left rounded-xl border border-[#E2E8F0] bg-white p-4 transition-all dark:border-[#1E3349] dark:bg-[#121E2C] ${
                card.leads.length > 0
                  ? 'hover:border-[#C99B56] hover:shadow-sm cursor-pointer'
                  : 'cursor-default'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#737373] dark:text-[#A3A3A3]">{card.label}</span>
                {card.leads.length > 0 && (
                  <ArrowUpRight className="h-3.5 w-3.5 text-[#C99B56] shrink-0" />
                )}
              </div>
              <div
                className={`mt-2 text-2xl font-bold font-mono-tabular ${
                  card.accent
                    ? 'text-[#C99B56]'
                    : card.tone === 'emerald'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-[#16273A] dark:text-white'
                }`}
              >
                {loading ? '—' : card.val}
              </div>
            </button>
          </LeadGroupHoverTrigger>
        ))}
      </div>

      {data && data.cards.totalLeads === 0 && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center dark:border-[#1E3349] dark:bg-[#121E2C]">
          <p className="text-sm font-medium text-[#16273A] dark:text-white">No leads recorded for this filter.</p>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3] mt-1">
            Switch to All Time / All Employees or create a new property requirement lead.
          </p>
          <button
            type="button"
            onClick={onCreateLead}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#16273A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#20364F] dark:bg-[#C99B56] dark:text-[#16273A]"
          >
            <Plus className="h-3.5 w-3.5" /> Create Lead
          </button>
        </div>
      )}

      {/* Pipeline Stage & Lead Source / Upcoming Visits */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Lead Stage Distribution (Hover + Clickable) */}
          <div className="lg:col-span-7 rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">
                {isAdmin ? 'Lead Stage Distribution' : 'My Pipeline'}
              </h2>
              <span className="text-[11px] text-[#737373] dark:text-[#A3A3A3]">Hover or click stage for leads</span>
            </div>
            <div className="space-y-1.5">
              {data.stageDistribution.map((s) => {
                const maxCount = Math.max(1, ...data.stageDistribution.map((x) => x.count));
                const pct = Math.round((s.count / maxCount) * 100);
                const stageLeads = leadsByStage.get(s.name) || [];
                return (
                  <LeadGroupHoverTrigger
                    key={s.name}
                    title={`Stage: ${s.name}`}
                    leads={stageLeads}
                    onOpenLead={onOpenLead}
                    onViewAll={() => openDrilldown(`Stage: ${s.name}`, stageLeads, activeFilterSummary)}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        stageLeads.length > 0 && openDrilldown(`Stage: ${s.name}`, stageLeads, activeFilterSummary)
                      }
                      className={`w-full grid grid-cols-12 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        stageLeads.length > 0
                          ? 'hover:bg-[#FBF6EE]/70 dark:hover:bg-[#1A2C40] cursor-pointer'
                          : 'cursor-default'
                      }`}
                    >
                      <div className="col-span-5 sm:col-span-4 truncate font-medium text-[#262626] dark:text-[#E5E5E5]">
                        {s.name}
                      </div>
                      <div className="col-span-5 sm:col-span-6 h-2 rounded-full bg-[#FBF6EE] dark:bg-[#262626] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            s.name === 'Booking Done'
                              ? 'bg-emerald-600'
                              : s.name === 'Dead'
                              ? 'bg-neutral-400 dark:bg-neutral-600'
                              : 'bg-[#C99B56]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="col-span-2 text-right font-mono-tabular font-semibold text-[#16273A] dark:text-white">
                        {s.count}
                      </div>
                    </button>
                  </LeadGroupHoverTrigger>
                );
              })}
            </div>
          </div>

          {/* Lead Source Distribution (Admin) OR Upcoming Visits (Exec) */}
          <div className="lg:col-span-5 rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
            {isAdmin ? (
              <>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">Lead Source Distribution</h2>
                  <span className="text-[11px] text-[#737373] dark:text-[#A3A3A3]">Hover or click source</span>
                </div>
                {data.sourceDistribution.length === 0 ? (
                  <p className="text-xs text-[#737373]">No lead sources in selected range.</p>
                ) : (
                  <div className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                    {data.sourceDistribution.map((src) => {
                      const srcLeads = leadsBySource.get(src.name || 'Unspecified') || [];
                      return (
                        <LeadGroupHoverTrigger
                          key={src.name}
                          title={`Source: ${src.name}`}
                          leads={srcLeads}
                          onOpenLead={onOpenLead}
                          onViewAll={() => openDrilldown(`Source: ${src.name}`, srcLeads, activeFilterSummary)}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              srcLeads.length > 0 && openDrilldown(`Source: ${src.name}`, srcLeads, activeFilterSummary)
                            }
                            className="w-full flex items-center justify-between py-2 px-2 -mx-2 rounded-md text-xs hover:bg-[#FBF6EE]/70 dark:hover:bg-[#1A2C40] transition-colors cursor-pointer"
                          >
                            <span className="text-[#262626] dark:text-[#E5E5E5] font-medium">{src.name}</span>
                            <span className="font-mono-tabular font-semibold text-[#16273A] dark:text-white inline-flex items-center gap-1">
                              {src.count}
                              <ChevronRight className="h-3 w-3 text-[#C99B56]" />
                            </span>
                          </button>
                        </LeadGroupHoverTrigger>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-[#16273A] dark:text-white mb-4">
                  Upcoming Site Visits &amp; Meetings
                </h2>
                {data.upcomingVisitsAndMeetings.length === 0 ? (
                  <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">No upcoming site visits or meetings scheduled.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.upcomingVisitsAndMeetings.map((act) => (
                      <LeadHoverCard
                        key={act.id}
                        leadCode={act.lead_code}
                        customerName={act.customer_name}
                        mobile={act.customer_mobile}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenLead(act.lead_id)}
                          title={`${act.lead_code} · ${act.customer_name}${act.customer_mobile ? ` · ${act.customer_mobile}` : ''}`}
                          className="w-full text-left flex items-start justify-between gap-3 rounded-lg border border-[#E2E8F0] p-3 hover:border-[#C99B56] dark:border-[#1E3349] dark:hover:border-[#C99B56] transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#16273A] dark:text-white truncate">
                              {act.activity_type} · <span className="hover:text-[#C99B56] hover:underline">{act.customer_name}</span>
                            </div>
                            <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">
                              <span className="font-mono-tabular font-semibold text-[#C99B56]">{act.lead_code}</span> · {act.description || 'Scheduled'}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono-tabular text-[#C99B56] whitespace-nowrap shrink-0">
                            {act.scheduled_date} {act.scheduled_time}
                          </span>
                        </button>
                      </LeadHoverCard>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Employee-wise Lead Allocation (Super Admin, Hover + Clickable per employee & metric) */}
      {isAdmin && data && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">Employee-wise Lead Allocation</h2>
            <span className="text-[11px] text-[#737373] dark:text-[#A3A3A3]">
              Hover or click any employee count to inspect leads
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#737373] dark:border-[#1E3349] dark:text-[#A3A3A3]">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Designation</th>
                  <th className="py-2 px-4 font-medium text-right">Total Leads</th>
                  <th className="py-2 px-4 font-medium text-right">Active Pipeline</th>
                  <th className="py-2 pl-4 font-medium text-right">Booking Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                {data.employeeAllocation.map((emp) => {
                  const buckets = employeeBuckets(emp);
                  return (
                    <tr key={emp.id} className="hover:bg-[#FBF6EE]/40 dark:hover:bg-[#1A2C40]/60 transition-colors">
                      <td className="py-2.5 pr-4 font-medium text-[#16273A] dark:text-white">
                        <LeadGroupHoverTrigger
                          title={`${emp.full_name} — All Assigned Leads`}
                          leads={buckets.total}
                          onOpenLead={onOpenLead}
                          onViewAll={() =>
                            openDrilldown(`${emp.full_name} — Total Leads`, buckets.total, activeFilterSummary)
                          }
                          className="inline-block"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              buckets.total.length > 0 &&
                              openDrilldown(`${emp.full_name} — Total Leads`, buckets.total, activeFilterSummary)
                            }
                            className={`text-left font-medium ${
                              buckets.total.length > 0 ? 'hover:text-[#C99B56] hover:underline cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            {emp.full_name}
                          </button>
                        </LeadGroupHoverTrigger>
                      </td>
                      <td className="py-2.5 pr-4 text-[#737373] dark:text-[#A3A3A3]">{emp.designation}</td>
                      <td className="py-2.5 px-4 text-right font-mono-tabular">
                        <LeadGroupHoverTrigger
                          title={`${emp.full_name} — Total Leads`}
                          leads={buckets.total}
                          onOpenLead={onOpenLead}
                          onViewAll={() =>
                            openDrilldown(`${emp.full_name} — Total Leads`, buckets.total, activeFilterSummary)
                          }
                          className="inline-block"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              buckets.total.length > 0 &&
                              openDrilldown(`${emp.full_name} — Total Leads`, buckets.total, activeFilterSummary)
                            }
                            className={`font-mono-tabular text-[#16273A] dark:text-white ${
                              buckets.total.length > 0 ? 'hover:text-[#C99B56] hover:underline cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            {emp.total_leads}
                          </button>
                        </LeadGroupHoverTrigger>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-tabular">
                        <LeadGroupHoverTrigger
                          title={`${emp.full_name} — Active Pipeline`}
                          leads={buckets.active}
                          onOpenLead={onOpenLead}
                          onViewAll={() =>
                            openDrilldown(`${emp.full_name} — Active Pipeline`, buckets.active, activeFilterSummary)
                          }
                          className="inline-block"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              buckets.active.length > 0 &&
                              openDrilldown(`${emp.full_name} — Active Pipeline`, buckets.active, activeFilterSummary)
                            }
                            className={`font-mono-tabular font-semibold text-[#C99B56] ${
                              buckets.active.length > 0 ? 'hover:underline cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            {emp.active_leads}
                          </button>
                        </LeadGroupHoverTrigger>
                      </td>
                      <td className="py-2.5 pl-4 text-right font-mono-tabular">
                        <LeadGroupHoverTrigger
                          title={`${emp.full_name} — Booking Done`}
                          leads={buckets.won}
                          onOpenLead={onOpenLead}
                          onViewAll={() =>
                            openDrilldown(`${emp.full_name} — Booking Done`, buckets.won, activeFilterSummary)
                          }
                          className="inline-block"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              buckets.won.length > 0 &&
                              openDrilldown(`${emp.full_name} — Booking Done`, buckets.won, activeFilterSummary)
                            }
                            className={`font-mono-tabular text-emerald-700 dark:text-emerald-400 ${
                              buckets.won.length > 0 ? 'hover:underline cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            {emp.won_leads}
                          </button>
                        </LeadGroupHoverTrigger>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actionable Queues: Today's Activities, Overdue Activities, Inactive Leads */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Today's Schedule */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#16273A] dark:text-white flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[#C99B56]" />
                Today&apos;s Schedule
              </h2>
              <span className="font-mono-tabular text-xs font-semibold text-[#737373]">{data.todaysActivities.length}</span>
            </div>
            {data.todaysActivities.length === 0 ? (
              <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">No pending activities scheduled for today.</p>
            ) : (
              <div className="space-y-2">
                {data.todaysActivities.slice(0, 6).map((act) => (
                  <LeadHoverCard
                    key={act.id}
                    leadCode={act.lead_code}
                    customerName={act.customer_name}
                    mobile={act.customer_mobile}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenLead(act.lead_id)}
                      title={`${act.lead_code} · ${act.customer_name}${act.customer_mobile ? ` · ${act.customer_mobile}` : ''}`}
                      className="w-full text-left rounded-lg border border-[#E2E8F0] p-2.5 hover:border-[#C99B56] dark:border-[#1E3349] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#16273A] dark:text-white truncate group-hover:text-[#C99B56] transition-colors">
                          {act.customer_name}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-[#C99B56] shrink-0">{act.scheduled_time}</span>
                      </div>
                      <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">
                        {act.activity_type} · <span className="font-mono-tabular font-semibold text-[#C99B56]">{act.lead_code}</span>{' '}
                        {isAdmin ? `· ${act.assigned_to_name}` : ''}
                      </div>
                    </button>
                  </LeadHoverCard>
                ))}
              </div>
            )}
          </div>

          {/* Overdue Activities */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#16273A] dark:text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-red-600" />
                Overdue Activities
              </h2>
              <span className="font-mono-tabular text-xs font-semibold text-red-600">{data.overdueActivities.length}</span>
            </div>
            {data.overdueActivities.length === 0 ? (
              <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">Zero overdue activities.</p>
            ) : (
              <div className="space-y-2">
                {data.overdueActivities.slice(0, 6).map((act) => (
                  <LeadHoverCard
                    key={act.id}
                    leadCode={act.lead_code}
                    customerName={act.customer_name}
                    mobile={act.customer_mobile}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenLead(act.lead_id)}
                      title={`${act.lead_code} · ${act.customer_name}${act.customer_mobile ? ` · ${act.customer_mobile}` : ''}`}
                      className="w-full text-left rounded-lg border border-red-500/30 bg-red-50/40 p-2.5 hover:border-red-500 dark:bg-red-950/20 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#16273A] dark:text-white truncate group-hover:text-red-600 dark:group-hover:text-red-300 transition-colors">
                          {act.customer_name}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-red-600 dark:text-red-400 shrink-0">
                          {act.scheduled_date}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">
                        {act.activity_type} · <span className="font-mono-tabular font-semibold text-[#C99B56]">{act.lead_code}</span>{' '}
                        {isAdmin ? `· ${act.assigned_to_name}` : ''}
                      </div>
                    </button>
                  </LeadHoverCard>
                ))}
              </div>
            )}
          </div>

          {/* Inactive Leads (15+ Days) - Header Hover/Click + Individual Lead Hover/Click */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
            <div className="flex items-center justify-between mb-3 gap-2">
              <LeadGroupHoverTrigger
                title="Inactive Leads (15+ Days)"
                leads={inactiveSummaries}
                onOpenLead={onOpenLead}
                onViewAll={() =>
                  openDrilldown('Inactive Leads (15+ Days)', inactiveSummaries, 'Active pipeline leads with 15+ days inactivity')
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    inactiveSummaries.length > 0 &&
                    openDrilldown('Inactive Leads (15+ Days)', inactiveSummaries, 'Active pipeline leads with 15+ days inactivity')
                  }
                  className="text-sm font-semibold text-[#16273A] dark:text-white flex items-center gap-2 hover:text-[#C99B56] transition-colors cursor-pointer"
                >
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Inactive Leads ({data.inactiveLeads.length})</span>
                </button>
              </LeadGroupHoverTrigger>
              <button
                type="button"
                onClick={onOpenInactiveReport}
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#C99B56] hover:underline shrink-0"
              >
                Report <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
            {data.inactiveLeads.length === 0 ? (
              <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">All active pipeline leads have recent interactions.</p>
            ) : (
              <div className="space-y-2">
                {data.inactiveLeads.slice(0, 6).map((lead) => {
                  const days = Math.floor(
                    (Date.now() - new Date(lead.last_qualifying_interaction_at).getTime()) / 86400000
                  );
                  return (
                    <LeadHoverCard
                      key={lead.id}
                      leadCode={lead.lead_code}
                      customerName={lead.customer_name}
                      mobile={lead.mobile}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenLead(lead.id)}
                        title={`${lead.lead_code} · ${lead.customer_name}${lead.mobile ? ` · ${lead.mobile}` : ''}`}
                        className="w-full text-left rounded-lg border border-amber-500/30 bg-amber-50/40 p-2.5 hover:border-amber-500 dark:bg-amber-950/20 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#16273A] dark:text-white truncate group-hover:text-[#C99B56] transition-colors">
                            {lead.customer_name}
                          </span>
                          <span className="text-[11px] font-mono-tabular font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                            {days}d idle
                          </span>
                        </div>
                        <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">
                          <span className="font-mono-tabular font-semibold text-[#C99B56]">{lead.lead_code}</span> · {lead.stage}{' '}
                          {isAdmin ? `· ${lead.assigned_to_name}` : ''}
                        </div>
                      </button>
                    </LeadHoverCard>
                  );
                })}
                {data.inactiveLeads.length > 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      openDrilldown(
                        'Inactive Leads (15+ Days)',
                        inactiveSummaries,
                        'Active pipeline leads with 15+ days inactivity'
                      )
                    }
                    className="w-full rounded-lg border border-dashed border-amber-500/40 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-50/60 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  >
                    View all {data.inactiveLeads.length} inactive leads
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lead Stage × Lead Source Matrix Report (Directly on Dashboard, Hoverable & Clickable Cells) */}
      {data && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">
                Lead Stage × Lead Source Report
              </h2>
              <p className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5">
                Cross-tabulation for {activeFilterSummary} · Hover or click any count to inspect or open leads
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleExportReport('lead-stage-source', 'xlsx')}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              >
                <Download className="h-3 w-3" /> Excel
              </button>
              <button
                type="button"
                onClick={() => handleExportReport('lead-stage-source', 'csv')}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] dark:border-[#1E3349]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
                <tr>
                  <th className="sticky left-0 z-10 bg-[#F8FAFC] dark:bg-[#0F1926] px-3 py-2.5 font-semibold text-[#16273A] dark:text-white whitespace-nowrap border-r border-[#E2E8F0] dark:border-[#1E3349]">
                    Lead Stage
                  </th>
                  {sourceNamesForMatrix.map((src) => (
                    <th key={src} className="px-3 py-2.5 text-center font-semibold text-[#525252] dark:text-[#A3A3A3] whitespace-nowrap">
                      {src}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-bold text-[#16273A] dark:text-white whitespace-nowrap bg-[#FBF6EE]/60 dark:bg-[#1A2C40]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                {stageNamesForMatrix.map((stageName) => {
                  const rowLeads = leadsByStage.get(stageName) || [];
                  return (
                    <tr key={stageName} className="hover:bg-[#FBF6EE]/30 dark:hover:bg-[#1A2C40]/40">
                      <td className="sticky left-0 z-10 bg-white dark:bg-[#121E2C] px-3 py-2 font-medium text-[#16273A] dark:text-white whitespace-nowrap border-r border-[#E2E8F0] dark:border-[#1E3349]">
                        <LeadGroupHoverTrigger
                          title={`Stage: ${stageName}`}
                          leads={rowLeads}
                          onOpenLead={onOpenLead}
                          onViewAll={() => openDrilldown(`Stage: ${stageName}`, rowLeads, activeFilterSummary)}
                          className="inline-block"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              rowLeads.length > 0 && openDrilldown(`Stage: ${stageName}`, rowLeads, activeFilterSummary)
                            }
                            className={rowLeads.length > 0 ? 'hover:text-[#C99B56] hover:underline cursor-pointer' : 'cursor-default'}
                          >
                            {stageName}
                          </button>
                        </LeadGroupHoverTrigger>
                      </td>
                      {sourceNamesForMatrix.map((srcName) => {
                        const cellLeads = matrixBuckets.get(`${stageName}|||${srcName}`) || [];
                        return (
                          <td key={srcName} className="px-3 py-2 text-center font-mono-tabular">
                            {cellLeads.length === 0 ? (
                              <span className="text-[#CBD5E1] dark:text-[#334155]">0</span>
                            ) : (
                              <LeadGroupHoverTrigger
                                title={`${stageName} × ${srcName}`}
                                leads={cellLeads}
                                onOpenLead={onOpenLead}
                                onViewAll={() =>
                                  openDrilldown(`${stageName} × ${srcName}`, cellLeads, activeFilterSummary)
                                }
                                className="inline-block"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    openDrilldown(`${stageName} × ${srcName}`, cellLeads, activeFilterSummary)
                                  }
                                  className="inline-flex min-w-[26px] items-center justify-center rounded-md bg-[#FBF6EE] px-1.5 py-0.5 font-semibold text-[#16273A] hover:bg-[#C99B56] hover:text-white dark:bg-[#1A2C40] dark:text-[#C99B56] dark:hover:bg-[#C99B56] dark:hover:text-[#16273A] transition-colors cursor-pointer"
                                >
                                  {cellLeads.length}
                                </button>
                              </LeadGroupHoverTrigger>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-mono-tabular font-bold bg-[#FBF6EE]/40 dark:bg-[#1A2C40]/60">
                        <LeadGroupHoverTrigger
                          title={`Stage Total: ${stageName}`}
                          leads={rowLeads}
                          onOpenLead={onOpenLead}
                          onViewAll={() => openDrilldown(`Stage: ${stageName}`, rowLeads, activeFilterSummary)}
                          className="inline-block"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              rowLeads.length > 0 && openDrilldown(`Stage: ${stageName}`, rowLeads, activeFilterSummary)
                            }
                            className={`text-[#16273A] dark:text-white ${
                              rowLeads.length > 0 ? 'hover:text-[#C99B56] hover:underline cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            {rowLeads.length}
                          </button>
                        </LeadGroupHoverTrigger>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-[#F8FAFC] dark:bg-[#0F1926] font-bold border-t border-[#E2E8F0] dark:border-[#1E3349]">
                  <td className="sticky left-0 z-10 bg-[#F8FAFC] dark:bg-[#0F1926] px-3 py-2.5 text-[#16273A] dark:text-white border-r border-[#E2E8F0] dark:border-[#1E3349]">
                    Total
                  </td>
                  {sourceNamesForMatrix.map((srcName) => {
                    const colLeads = leadsBySource.get(srcName) || [];
                    return (
                      <td key={srcName} className="px-3 py-2.5 text-center font-mono-tabular">
                        <LeadGroupHoverTrigger
                          title={`Source Total: ${srcName}`}
                          leads={colLeads}
                          onOpenLead={onOpenLead}
                          onViewAll={() => openDrilldown(`Source: ${srcName}`, colLeads, activeFilterSummary)}
                          className="inline-block"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              colLeads.length > 0 && openDrilldown(`Source: ${srcName}`, colLeads, activeFilterSummary)
                            }
                            className={`text-[#16273A] dark:text-white ${
                              colLeads.length > 0 ? 'hover:text-[#C99B56] hover:underline cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            {colLeads.length}
                          </button>
                        </LeadGroupHoverTrigger>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center font-mono-tabular bg-[#FBF6EE] dark:bg-[#1A2C40]">
                    <LeadGroupHoverTrigger
                      title="All Filtered Leads"
                      leads={allFilteredLeads}
                      onOpenLead={onOpenLead}
                      onViewAll={() => openDrilldown('Total Filtered Leads', allFilteredLeads, activeFilterSummary)}
                      className="inline-block"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          allFilteredLeads.length > 0 &&
                          openDrilldown('Total Filtered Leads', allFilteredLeads, activeFilterSummary)
                        }
                        className={`text-[#16273A] dark:text-[#C99B56] ${
                          allFilteredLeads.length > 0 ? 'hover:underline cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        {allFilteredLeads.length}
                      </button>
                    </LeadGroupHoverTrigger>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Reports Explorer Directly Inside Dashboard (Synced with Dashboard Date & Employee Filters) */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#16273A] dark:text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#C99B56]" />
              Dashboard Reports Explorer
            </h2>
            <p className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5">
              Filtered by <span className="font-semibold text-[#16273A] dark:text-white">{activeFilterSummary}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleExportReport(selectedReport, 'xlsx')}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <Download className="h-3.5 w-3.5" /> Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => handleExportReport(selectedReport, 'csv')}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <Download className="h-3.5 w-3.5" /> CSV (.csv)
            </button>
          </div>
        </div>

        {/* Report Tabs */}
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1.5 mb-4 dark:border-[#1E3349] dark:bg-[#0F1926]">
          {visibleReports.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setSelectedReport(r.key)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                selectedReport === r.key
                  ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                  : 'text-[#525252] hover:bg-white dark:text-[#A3A3A3] dark:hover:bg-[#1A2C40]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Report Table */}
        <div className="rounded-lg border border-[#E2E8F0] overflow-hidden dark:border-[#1E3349]">
          <div className="px-4 py-2.5 border-b border-[#E2E8F0] dark:border-[#1E3349] flex items-center justify-between bg-[#F8FAFC]/70 dark:bg-[#0F1926]">
            <span className="text-xs font-semibold text-[#16273A] dark:text-white">{reportPayload?.title || 'Report'}</span>
            <span className="font-mono-tabular text-[11px] text-[#737373]">{reportPayload?.rows.length || 0} row(s)</span>
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
                <tr>
                  {reportPayload?.columns.map((col) => (
                    <th key={col} className="px-3.5 py-2.5 font-semibold text-[#525252] dark:text-[#A3A3A3] whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                {reportLoading ? (
                  <tr>
                    <td colSpan={reportPayload?.columns.length || 4} className="px-4 py-8 text-center text-[#737373]">
                      Generating report...
                    </td>
                  </tr>
                ) : !reportPayload || reportPayload.rows.length === 0 ? (
                  <tr>
                    <td colSpan={reportPayload?.columns.length || 4} className="px-4 py-8 text-center text-[#737373]">
                      No records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  reportPayload.rows.map((row, rIdx) => {
                    const leadIdColIdx = reportPayload.columns.indexOf('Lead ID');
                    const rowLeadCode = leadIdColIdx >= 0 ? String(row[leadIdColIdx] || '') : '';
                    const matchedLead = rowLeadCode ? data?.leadCodeMap?.[rowLeadCode] : undefined;
                    return (
                      <tr key={rIdx} className="hover:bg-[#FBF6EE]/30 dark:hover:bg-[#1A2C40]/60">
                        {row.map((cell, cIdx) => {
                          const colName = reportPayload.columns[cIdx] || '';
                          const isClickableLeadCell =
                            Boolean(matchedLead) && (colName === 'Lead ID' || colName === 'Customer Name');
                          return (
                            <td
                              key={cIdx}
                              className={`px-3.5 py-2.5 whitespace-nowrap ${
                                typeof cell === 'number'
                                  ? 'font-mono-tabular text-[#16273A] dark:text-white font-medium'
                                  : 'text-[#262626] dark:text-[#E5E5E5]'
                              }`}
                            >
                              {isClickableLeadCell && matchedLead ? (
                                <LeadHoverCard
                                  leadCode={rowLeadCode}
                                  customerName={matchedLead.customer_name}
                                  mobile={matchedLead.mobile}
                                >
                                  <button
                                    type="button"
                                    onClick={() => onOpenLead(matchedLead.id)}
                                    className={`hover:underline cursor-pointer ${
                                      colName === 'Lead ID'
                                        ? 'font-mono-tabular font-semibold text-[#C99B56]'
                                        : 'font-medium text-[#16273A] dark:text-white hover:text-[#C99B56]'
                                    }`}
                                  >
                                    {String(cell)}
                                  </button>
                                </LeadHoverCard>
                              ) : typeof cell === 'number' && colName.includes('(INR)') ? (
                                `₹${cell.toLocaleString('en-IN')}`
                              ) : cell === null || cell === undefined || cell === '' ? (
                                '—'
                              ) : (
                                String(cell)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recently Updated Leads & Recent Lead Activity */}
      {data && (
        <div className="space-y-5">
          {data.recentlyUpdatedLeads.length > 0 && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
              <h2 className="text-sm font-semibold text-[#16273A] dark:text-white mb-3">Recently Updated Leads</h2>
              <div className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                {data.recentlyUpdatedLeads.map((l) => (
                  <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 text-xs">
                    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <LeadHoverCard leadCode={l.lead_code} customerName={l.customer_name} mobile={l.mobile}>
                        <span className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenLead(l.id)}
                            title={`${l.lead_code} · ${l.customer_name} · ${l.mobile}`}
                            className="font-mono-tabular font-semibold text-[#C99B56] hover:underline cursor-pointer"
                          >
                            {l.lead_code}
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenLead(l.id)}
                            title={`${l.lead_code} · ${l.customer_name} · ${l.mobile}`}
                            className="font-medium text-[#16273A] dark:text-white hover:text-[#C99B56] hover:underline cursor-pointer"
                          >
                            {l.customer_name}
                          </button>
                        </span>
                      </LeadHoverCard>
                      <span className="text-[#737373] dark:text-[#A3A3A3]">
                        {l.property_subtype} · {l.localities.join(', ')}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-tabular text-[#737373] dark:text-[#A3A3A3] whitespace-nowrap shrink-0">
                      {l.stage} · {isAdmin && l.assigned_to_name ? `${l.assigned_to_name} · ` : ''}Updated {formatDateTime(l.updated_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3349] dark:bg-[#121E2C]">
              <h2 className="text-sm font-semibold text-[#16273A] dark:text-white mb-3">Recent Lead Activity</h2>
              {data.recentActivity.length === 0 ? (
                <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">No recent lead activity recorded yet.</p>
              ) : (
                <div className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                  {data.recentActivity.map((ev) => (
                    <div key={ev.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 text-xs">
                      <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <LeadHoverCard
                          leadCode={ev.lead_code}
                          customerName={ev.customer_name}
                          mobile={ev.customer_mobile}
                        >
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenLead(ev.lead_id)}
                              title={`${ev.lead_code} · ${ev.customer_name}${ev.customer_mobile ? ` · ${ev.customer_mobile}` : ''}`}
                              className="font-mono-tabular font-semibold text-[#C99B56] hover:underline cursor-pointer"
                            >
                              {ev.lead_code}
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenLead(ev.lead_id)}
                              title={`${ev.lead_code} · ${ev.customer_name}${ev.customer_mobile ? ` · ${ev.customer_mobile}` : ''}`}
                              className="font-medium text-[#16273A] dark:text-white hover:text-[#C99B56] hover:underline cursor-pointer"
                            >
                              {ev.customer_name}
                            </button>
                          </span>
                        </LeadHoverCard>
                        <span className="text-[#525252] dark:text-[#A3A3A3]">— {ev.description}</span>
                      </div>
                      <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] whitespace-nowrap shrink-0">
                        {ev.employee_name} · {formatDateTime(ev.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Drilldown Leads Modal */}
      {drilldown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDrilldown(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl dark:border-[#1E3349] dark:bg-[#121E2C] overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3349]">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#16273A] dark:text-white truncate">
                  {drilldown.title}{' '}
                  <span className="font-mono-tabular text-[#C99B56]">({drilldown.leads.length})</span>
                </h3>
                {drilldown.subtitle && (
                  <p className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">{drilldown.subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDrilldown(null)}
                className="rounded-lg p-1.5 text-[#737373] hover:bg-[#FBF6EE] hover:text-[#16273A] dark:hover:bg-[#1A2C40] dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-[#E2E8F0] px-5 py-3 dark:border-[#1E3349]">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={drillSearch}
                  onChange={(e) => setDrillSearch(e.target.value)}
                  placeholder="Search Lead ID, Customer Name, Mobile, Stage, Source..."
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-[#16273A] focus:border-[#C99B56] focus:outline-none dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {drillFilteredLeads.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#737373] dark:text-[#A3A3A3]">
                  No matching leads found.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold text-[#525252] dark:text-[#A3A3A3]">Lead ID</th>
                      <th className="px-4 py-2.5 font-semibold text-[#525252] dark:text-[#A3A3A3]">Customer Name</th>
                      <th className="px-4 py-2.5 font-semibold text-[#525252] dark:text-[#A3A3A3]">Mobile</th>
                      <th className="px-4 py-2.5 font-semibold text-[#525252] dark:text-[#A3A3A3]">Stage</th>
                      <th className="px-4 py-2.5 font-semibold text-[#525252] dark:text-[#A3A3A3]">Source</th>
                      {isAdmin && (
                        <th className="px-4 py-2.5 font-semibold text-[#525252] dark:text-[#A3A3A3]">Assigned To</th>
                      )}
                      <th className="px-4 py-2.5 text-right font-semibold text-[#525252] dark:text-[#A3A3A3]">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                    {drillFilteredLeads.map((l) => (
                      <tr
                        key={l.id}
                        onClick={() => {
                          setDrilldown(null);
                          onOpenLead(l.id);
                        }}
                        className="hover:bg-[#FBF6EE]/60 dark:hover:bg-[#1A2C40] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono-tabular font-semibold text-[#C99B56] whitespace-nowrap">
                          {l.lead_code}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[#16273A] dark:text-white whitespace-nowrap">
                          {l.customer_name}
                        </td>
                        <td className="px-4 py-2.5 font-mono-tabular text-[#525252] dark:text-[#CBD5E1] whitespace-nowrap">
                          {l.mobile || '—'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="rounded-md bg-[#FBF6EE] px-2 py-0.5 text-[11px] font-medium text-[#16273A] dark:bg-[#1A2C40] dark:text-[#E2E8F0]">
                            {l.stage}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[#525252] dark:text-[#A3A3A3] whitespace-nowrap">
                          {l.lead_source || '—'}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2.5 text-[#525252] dark:text-[#A3A3A3] whitespace-nowrap">
                            {l.assigned_to_name || '—'}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C99B56]">
                            Details <ExternalLink className="h-3 w-3" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
