import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import type { ActivityRecord, UserProfile } from '../types.ts';

interface CalendarViewProps {
  user: UserProfile;
  users: UserProfile[];
  onOpenLead: (leadId: string) => void;
}

type CalMode = 'day' | 'week' | 'month' | 'agenda';

export const CalendarView: React.FC<CalendarViewProps> = ({ user, users, onOpenLead }) => {
  const [calMode, setCalMode] = useState<CalMode>('agenda');
  const [cursorDate, setCursorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (user.role === 'super_admin' && employeeFilter !== 'all') qs.set('employeeId', employeeFilter);
      if (typeFilter !== 'all') qs.set('activityType', typeFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const res = await apiFetch<{ activities: ActivityRecord[] }>(`/api/activities?${qs.toString()}`);
      setActivities(res.activities);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [employeeFilter, typeFilter, statusFilter]);

  const shiftDate = (days: number) => {
    const d = new Date(`${cursorDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    setCursorDate(d.toISOString().slice(0, 10));
  };

  const weekDates = useMemo(() => {
    const base = new Date(`${cursorDate}T00:00:00`);
    const day = base.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(base);
    mon.setDate(base.getDate() + diffToMon);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [cursorDate]);

  const monthGrid = useMemo(() => {
    const base = new Date(`${cursorDate}T00:00:00`);
    const year = base.getFullYear();
    const month = base.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<string | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return cells;
  }, [cursorDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#171717] dark:text-white">Calendar &amp; Scheduling</h1>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
            {user.role === 'super_admin'
              ? 'Company-wide follow-up calls, WhatsApp follow-ups, site visits, and meetings'
              : 'My scheduled follow-ups, site visits, and meetings'}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-[#E5DEC9] bg-white p-0.5 dark:border-[#2A2A2A] dark:bg-[#171717]">
          {(['day', 'week', 'month', 'agenda'] as CalMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setCalMode(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                calMode === m
                  ? 'bg-[#171717] text-white dark:bg-[#B58A35] dark:text-[#171717]'
                  : 'text-[#525252] dark:text-[#A3A3A3]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Filters & Date Navigation */}
      <div className="rounded-xl border border-[#E5DEC9] bg-white p-3.5 flex flex-wrap items-center justify-between gap-3 dark:border-[#2A2A2A] dark:bg-[#171717]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDate(calMode === 'month' ? -30 : calMode === 'week' ? -7 : -1)}
            className="rounded-lg border border-[#E5DEC9] p-1.5 hover:bg-[#F3EBDD] dark:border-[#2E2E2E] dark:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={cursorDate}
            onChange={(e) => setCursorDate(e.target.value)}
            className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
          />
          <button
            type="button"
            onClick={() => shiftDate(calMode === 'month' ? 30 : calMode === 'week' ? 7 : 1)}
            className="rounded-lg border border-[#E5DEC9] p-1.5 hover:bg-[#F3EBDD] dark:border-[#2E2E2E] dark:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursorDate(new Date().toISOString().slice(0, 10))}
            className="rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 text-xs font-medium dark:border-[#2E2E2E] dark:text-white"
          >
            Today
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user.role === 'super_admin' && (
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
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
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
          >
            <option value="all">All Activity Types</option>
            <option value="Follow-up Call">Follow-up Call</option>
            <option value="WhatsApp Follow-up">WhatsApp Follow-up</option>
            <option value="Site Visit">Site Visit</option>
            <option value="Meeting">Meeting</option>
            <option value="Other">Other</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Views */}
      {loading ? (
        <div className="rounded-xl border border-[#E5DEC9] bg-white p-8 text-xs text-[#737373] dark:border-[#2A2A2A] dark:bg-[#171717]">
          Loading schedule...
        </div>
      ) : calMode === 'day' ? (
        <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
          <h2 className="text-sm font-semibold text-[#171717] dark:text-white mb-3 font-mono-tabular">
            Schedule for {cursorDate}
          </h2>
          {activities.filter((a) => a.scheduled_date === cursorDate).length === 0 ? (
            <p className="text-xs text-[#737373]">No activities scheduled for {cursorDate}.</p>
          ) : (
            <div className="space-y-2.5">
              {activities
                .filter((a) => a.scheduled_date === cursorDate)
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpenLead(a.lead_id)}
                    className="w-full text-left flex items-center justify-between gap-3 rounded-lg border border-[#E5DEC9] p-3 hover:border-[#B58A35] dark:border-[#2A2A2A]"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#171717] dark:text-white">
                        {a.activity_type} · {a.customer_name} ({a.lead_code})
                      </div>
                      <div className="text-[11px] text-[#737373] mt-0.5">
                        {a.description || '—'} · {a.assigned_to_name}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono-tabular text-xs font-semibold text-[#B58A35]">{a.scheduled_time}</div>
                      <div className="text-[11px] text-[#737373]">{a.is_overdue ? 'Overdue' : a.status}</div>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>
      ) : calMode === 'week' ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
          {weekDates.map((d) => {
            const dayActs = activities.filter((a) => a.scheduled_date === d);
            return (
              <div
                key={d}
                className="rounded-xl border border-[#E5DEC9] bg-white p-3 min-h-[200px] dark:border-[#2A2A2A] dark:bg-[#171717]"
              >
                <div className="font-mono-tabular text-xs font-semibold text-[#171717] dark:text-white pb-2 mb-2 border-b border-[#E5DEC9] dark:border-[#262626]">
                  {d}
                </div>
                <div className="space-y-2">
                  {dayActs.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpenLead(a.lead_id)}
                      className={`w-full text-left rounded-md border p-2 text-[11px] hover:border-[#B58A35] ${
                        a.is_overdue
                          ? 'border-red-500/40 bg-red-50/40 dark:bg-red-950/20'
                          : 'border-[#E5DEC9] dark:border-[#2A2A2A]'
                      }`}
                    >
                      <div className="font-mono-tabular font-semibold text-[#B58A35]">{a.scheduled_time}</div>
                      <div className="font-medium text-[#171717] dark:text-white truncate">{a.customer_name}</div>
                      <div className="text-[#737373] truncate">{a.activity_type}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : calMode === 'month' ? (
        <div className="rounded-xl border border-[#E5DEC9] bg-white p-4 dark:border-[#2A2A2A] dark:bg-[#171717]">
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold text-[#737373] pb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthGrid.map((dateStr, idx) => {
              if (!dateStr) return <div key={idx} className="min-h-[92px] rounded-lg bg-[#F8F6F1]/50 dark:bg-[#141414]" />;
              const dayActs = activities.filter((a) => a.scheduled_date === dateStr);
              return (
                <div
                  key={dateStr}
                  className="min-h-[92px] rounded-lg border border-[#E5DEC9] p-1.5 dark:border-[#262626]"
                >
                  <div className="font-mono-tabular text-[11px] font-semibold text-[#525252] dark:text-[#A3A3A3] mb-1">
                    {dateStr.slice(8)}
                  </div>
                  <div className="space-y-1">
                    {dayActs.slice(0, 3).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onOpenLead(a.lead_id)}
                        className="block w-full text-left truncate rounded bg-[#F3EBDD] px-1.5 py-0.5 text-[10px] font-medium text-[#171717] hover:bg-[#B58A35]/30 dark:bg-[#26211A] dark:text-[#F3EBDD]"
                      >
                        {a.scheduled_time} {a.customer_name}
                      </button>
                    ))}
                    {dayActs.length > 3 && (
                      <div className="text-[10px] text-[#737373] px-1">+{dayActs.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* AGENDA VIEW */
        <div className="rounded-xl border border-[#E5DEC9] bg-white overflow-hidden dark:border-[#2A2A2A] dark:bg-[#171717]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F1] border-b border-[#E5DEC9] dark:bg-[#141414] dark:border-[#2A2A2A]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-[#525252]">Date &amp; Time</th>
                  <th className="px-4 py-3 font-semibold text-[#525252]">Activity</th>
                  <th className="px-4 py-3 font-semibold text-[#525252]">Lead</th>
                  <th className="px-4 py-3 font-semibold text-[#525252]">Assignee</th>
                  <th className="px-4 py-3 font-semibold text-[#525252]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[#525252]">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#737373]">
                      No activities match your current filters.
                    </td>
                  </tr>
                ) : (
                  activities.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => onOpenLead(a.lead_id)}
                      className="cursor-pointer hover:bg-[#F3EBDD]/40 dark:hover:bg-[#202020]"
                    >
                      <td className="px-4 py-3 font-mono-tabular whitespace-nowrap text-[#171717] dark:text-white">
                        {a.scheduled_date} {a.scheduled_time}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#171717] dark:text-white whitespace-nowrap">
                        {a.activity_type}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono-tabular font-semibold text-[#B58A35] mr-1.5">{a.lead_code}</span>
                        <span className="text-[#171717] dark:text-white">{a.customer_name}</span>
                      </td>
                      <td className="px-4 py-3 text-[#525252] dark:text-[#A3A3A3] whitespace-nowrap">
                        {a.assigned_to_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {a.is_overdue ? (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                            Overdue
                          </span>
                        ) : (
                          <span className="text-[#525252] dark:text-[#A3A3A3]">{a.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#525252] dark:text-[#A3A3A3] max-w-xs truncate">
                        {a.completion_remarks || a.cancel_reason || a.description || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
