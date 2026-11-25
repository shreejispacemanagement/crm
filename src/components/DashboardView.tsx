import { AlertCircle, ArrowUpRight, CalendarClock, Clock, Plus } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import type { ActivityRecord, DatePreset, LeadRecord, UserProfile } from '../types.ts';

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
  employeeAllocation: Array<{
    id: string;
    full_name: string;
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
    last_qualifying_interaction_at: string;
    last_interaction_type: string | null;
    assigned_to_name: string;
  }>;
  recentActivity: Array<{
    id: string;
    lead_id: string;
    lead_code: string;
    customer_name: string;
    event_type: string;
    description: string;
    employee_name: string;
    created_at: string;
  }>;
  recentlyUpdatedLeads: LeadRecord[];
}

interface DashboardViewProps {
  user: UserProfile;
  onOpenLead: (leadId: string) => void;
  onCreateLead: () => void;
  onOpenInactiveReport: () => void;
}

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
  { value: 'all_time', label: 'All Time' },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  onOpenLead,
  onCreateLead,
  onOpenInactiveReport,
}) => {
  const [datePreset, setDatePreset] = useState<DatePreset>('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ datePreset });
      if (datePreset === 'custom' && customStart) qs.set('customStart', customStart);
      if (datePreset === 'custom' && customEnd) qs.set('customEnd', customEnd);
      const res = await apiFetch<DashboardData>(`/api/dashboard?${qs.toString()}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [datePreset, customStart, customEnd]);

  const isAdmin = user.role === 'super_admin';

  return (
    <div className="space-y-6">
      {/* Header & Date Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#171717] dark:text-white">
            {isAdmin ? 'Dashboard' : 'My Sales Workspace'}
          </h1>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3] mt-0.5">
            {isAdmin
              ? 'Company-wide pipeline, lead allocation, activity discipline, and inactivity monitoring'
              : `Assigned pipeline, follow-ups, visits, and active requirements for ${user.full_name}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#E5DEC9] bg-white p-1 dark:border-[#2A2A2A] dark:bg-[#171717]">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setDatePreset(p.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  datePreset === p.value
                    ? 'bg-[#171717] text-white dark:bg-[#B58A35] dark:text-[#171717]'
                    : 'text-[#525252] hover:bg-[#F3EBDD]/60 dark:text-[#A3A3A3] dark:hover:bg-[#242424]'
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
                className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2A2A2A] dark:bg-[#171717] dark:text-white"
              />
              <span className="text-xs text-[#737373]">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2A2A2A] dark:bg-[#171717] dark:text-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          { label: isAdmin ? 'Total Leads' : 'My Total Leads', val: data?.cards.totalLeads ?? 0, accent: false },
          { label: 'New Leads', val: data?.cards.newLeads ?? 0, accent: false },
          { label: 'Active Leads', val: data?.cards.activeLeads ?? 0, accent: true },
          { label: 'Booking Done', val: data?.cards.bookingDone ?? 0, tone: 'emerald' as const },
          { label: 'Dead Leads', val: data?.cards.deadLeads ?? 0, tone: 'neutral' as const },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[#E5DEC9] bg-white p-4 dark:border-[#2A2A2A] dark:bg-[#171717]"
          >
            <div className="text-xs font-medium text-[#737373] dark:text-[#A3A3A3]">{card.label}</div>
            <div
              className={`mt-2 text-2xl font-bold font-mono-tabular ${
                card.accent
                  ? 'text-[#B58A35]'
                  : card.tone === 'emerald'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-[#171717] dark:text-white'
              }`}
            >
              {loading ? '—' : card.val}
            </div>
          </div>
        ))}
      </div>

      {data && data.cards.totalLeads === 0 && (
        <div className="rounded-xl border border-[#E5DEC9] bg-white p-8 text-center dark:border-[#2A2A2A] dark:bg-[#171717]">
          <p className="text-sm font-medium text-[#171717] dark:text-white">No leads recorded for this date filter.</p>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3] mt-1">
            Switch to All Time or create a new property requirement lead.
          </p>
          <button
            type="button"
            onClick={onCreateLead}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2E2E2E] dark:bg-[#B58A35] dark:text-[#171717]"
          >
            <Plus className="h-3.5 w-3.5" /> Create First Lead
          </button>
        </div>
      )}

      {/* Pipeline Stage & Lead Source / Allocation */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Pipeline Stages */}
          <div className="lg:col-span-7 rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            <h2 className="text-sm font-semibold text-[#171717] dark:text-white mb-4">
              {isAdmin ? 'Lead Stage Distribution' : 'My Pipeline'}
            </h2>
            <div className="space-y-2.5">
              {data.stageDistribution.map((s) => {
                const maxCount = Math.max(1, ...data.stageDistribution.map((x) => x.count));
                const pct = Math.round((s.count / maxCount) * 100);
                return (
                  <div key={s.name} className="grid grid-cols-12 items-center gap-3 text-xs">
                    <div className="col-span-5 sm:col-span-4 truncate font-medium text-[#262626] dark:text-[#E5E5E5]">
                      {s.name}
                    </div>
                    <div className="col-span-5 sm:col-span-6 h-2 rounded-full bg-[#F3EBDD] dark:bg-[#262626] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          s.name === 'Booking Done'
                            ? 'bg-emerald-600'
                            : s.name === 'Dead'
                            ? 'bg-neutral-400 dark:bg-neutral-600'
                            : 'bg-[#B58A35]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="col-span-2 text-right font-mono-tabular font-semibold text-[#171717] dark:text-white">
                      {s.count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Source Distribution (Admin) OR Upcoming Visits & Meetings (Exec) */}
          <div className="lg:col-span-5 rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            {isAdmin ? (
              <>
                <h2 className="text-sm font-semibold text-[#171717] dark:text-white mb-4">Lead Source Distribution</h2>
                {data.sourceDistribution.length === 0 ? (
                  <p className="text-xs text-[#737373]">No lead sources in selected range.</p>
                ) : (
                  <div className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
                    {data.sourceDistribution.map((src) => (
                      <div key={src.name} className="flex items-center justify-between py-2 text-xs">
                        <span className="text-[#262626] dark:text-[#E5E5E5]">{src.name}</span>
                        <span className="font-mono-tabular font-semibold text-[#171717] dark:text-white">{src.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-[#171717] dark:text-white mb-4">
                  Upcoming Site Visits & Meetings
                </h2>
                {data.upcomingVisitsAndMeetings.length === 0 ? (
                  <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">No upcoming site visits or meetings scheduled.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.upcomingVisitsAndMeetings.map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => onOpenLead(act.lead_id)}
                        className="w-full text-left flex items-start justify-between gap-3 rounded-lg border border-[#E5DEC9] p-3 hover:border-[#B58A35] dark:border-[#2A2A2A] dark:hover:border-[#B58A35] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#171717] dark:text-white truncate">
                            {act.activity_type} · {act.customer_name}
                          </div>
                          <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">
                            {act.lead_code} · {act.description || 'Scheduled'}
                          </div>
                        </div>
                        <span className="text-[11px] font-mono-tabular text-[#B58A35] whitespace-nowrap shrink-0">
                          {act.scheduled_date} {act.scheduled_time}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Employee-wise Lead Allocation (Super Admin) */}
      {isAdmin && data && (
        <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
          <h2 className="text-sm font-semibold text-[#171717] dark:text-white mb-3">Employee-wise Lead Allocation</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DEC9] text-[#737373] dark:border-[#2A2A2A] dark:text-[#A3A3A3]">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Designation</th>
                  <th className="py-2 px-4 font-medium text-right">Total Leads</th>
                  <th className="py-2 px-4 font-medium text-right">Active Pipeline</th>
                  <th className="py-2 pl-4 font-medium text-right">Booking Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
                {data.employeeAllocation.map((emp) => (
                  <tr key={emp.id}>
                    <td className="py-2.5 pr-4 font-medium text-[#171717] dark:text-white">{emp.full_name}</td>
                    <td className="py-2.5 pr-4 text-[#737373] dark:text-[#A3A3A3]">{emp.designation}</td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular text-[#171717] dark:text-white">{emp.total_leads}</td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular font-semibold text-[#B58A35]">{emp.active_leads}</td>
                    <td className="py-2.5 pl-4 text-right font-mono-tabular text-emerald-700 dark:text-emerald-400">
                      {emp.won_leads}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actionable Queues: Today's Activities, Overdue Activities, Inactive Leads */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Today's Follow-ups, Site Visits & Meetings */}
          <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#171717] dark:text-white flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[#B58A35]" />
                Today&apos;s Schedule
              </h2>
              <span className="font-mono-tabular text-xs font-semibold text-[#737373]">{data.todaysActivities.length}</span>
            </div>
            {data.todaysActivities.length === 0 ? (
              <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">No pending activities scheduled for today.</p>
            ) : (
              <div className="space-y-2">
                {data.todaysActivities.slice(0, 6).map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => onOpenLead(act.lead_id)}
                    className="w-full text-left rounded-lg border border-[#E5DEC9] p-2.5 hover:border-[#B58A35] dark:border-[#2A2A2A] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#171717] dark:text-white truncate">{act.customer_name}</span>
                      <span className="text-[11px] font-mono-tabular text-[#B58A35] shrink-0">{act.scheduled_time}</span>
                    </div>
                    <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">
                      {act.activity_type} · {act.lead_code} {isAdmin ? `· ${act.assigned_to_name}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Overdue Activities */}
          <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#171717] dark:text-white flex items-center gap-2">
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
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => onOpenLead(act.lead_id)}
                    className="w-full text-left rounded-lg border border-red-500/30 bg-red-50/40 p-2.5 hover:border-red-500 dark:bg-red-950/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#171717] dark:text-white truncate">{act.customer_name}</span>
                      <span className="text-[11px] font-mono-tabular text-red-600 dark:text-red-400 shrink-0">
                        {act.scheduled_date}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">
                      {act.activity_type} · {act.lead_code} {isAdmin ? `· ${act.assigned_to_name}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Inactive Leads (15+ Days) */}
          <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#171717] dark:text-white flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Inactive Leads (15+ Days)
              </h2>
              <button
                type="button"
                onClick={onOpenInactiveReport}
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#B58A35] hover:underline"
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
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => onOpenLead(lead.id)}
                      className="w-full text-left rounded-lg border border-amber-500/30 bg-amber-50/40 p-2.5 hover:border-amber-500 dark:bg-amber-950/20 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#171717] dark:text-white truncate">{lead.customer_name}</span>
                        <span className="text-[11px] font-mono-tabular font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                          {days}d idle
                        </span>
                      </div>
                      <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] mt-0.5 truncate">
                        {lead.lead_code} · {lead.stage} {isAdmin ? `· ${lead.assigned_to_name}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Lead Activity / Recently Updated Leads */}
      {data && (
        <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
          <h2 className="text-sm font-semibold text-[#171717] dark:text-white mb-3">
            {isAdmin ? 'Recent Lead Activity' : 'Recently Updated Leads'}
          </h2>
          {isAdmin ? (
            <div className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
              {data.recentActivity.map((ev) => (
                <div key={ev.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 text-xs">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenLead(ev.lead_id)}
                      className="font-mono-tabular font-semibold text-[#B58A35] hover:underline mr-2"
                    >
                      {ev.lead_code}
                    </button>
                    <span className="font-medium text-[#171717] dark:text-white mr-1.5">{ev.customer_name}</span>
                    <span className="text-[#525252] dark:text-[#A3A3A3]">— {ev.description}</span>
                  </div>
                  <div className="text-[11px] text-[#737373] dark:text-[#A3A3A3] whitespace-nowrap shrink-0">
                    {ev.employee_name} · {formatDateTime(ev.created_at)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
              {data.recentlyUpdatedLeads.map((l) => (
                <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 text-xs">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenLead(l.id)}
                      className="font-mono-tabular font-semibold text-[#B58A35] hover:underline mr-2"
                    >
                      {l.lead_code}
                    </button>
                    <span className="font-medium text-[#171717] dark:text-white mr-2">{l.customer_name}</span>
                    <span className="text-[#737373] dark:text-[#A3A3A3]">
                      {l.property_subtype} · {l.localities.join(', ')}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono-tabular text-[#737373] dark:text-[#A3A3A3] whitespace-nowrap shrink-0">
                    {l.stage} · Updated {formatDateTime(l.updated_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
