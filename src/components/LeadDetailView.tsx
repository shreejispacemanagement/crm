import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Edit3,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiFetch, formatAmountInWords, formatBudgetRange, formatDateOnly, formatDateTime, formatINR, generateBudgetOptions } from '../lib/api.ts';
import {
  AREA_UNITS,
  type ActivityRecord,
  type AuditLogEntry,
  type CommunicationRecord,
  type DuplicateMatch,
  type LeadRecord,
  type MasterItem,
  type TimelineEvent,
  type UserProfile,
} from '../types.ts';
import { BookingModal, DeadModal, ReassignModal, ReopenModal } from './StageModals.tsx';

interface LeadDetailViewProps {
  leadId: string;
  user: UserProfile;
  users: UserProfile[];
  masters: MasterItem[];
  onBack: () => void;
  onOpenLead: (id: string) => void;
  onMutated: () => void;
}

export const LeadDetailView: React.FC<LeadDetailViewProps> = ({
  leadId,
  user,
  users,
  masters,
  onBack,
  onOpenLead,
  onMutated,
}) => {
  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [communications, setCommunications] = useState<CommunicationRecord[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'timeline' | 'activities' | 'communications' | 'audit'>('timeline');

  // Inline edit state
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState(false);
  const [editingBooking, setEditingBooking] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({});

  // Stage / Modals
  const [bookingModalStage, setBookingModalStage] = useState<string | null>(null);
  const [deadModalStage, setDeadModalStage] = useState<string | null>(null);
  const [showReassign, setShowReassign] = useState(false);
  const [showReopen, setShowReopen] = useState(false);

  // Schedule Activity Form
  const [showActForm, setShowActForm] = useState(false);
  const [actType, setActType] = useState('Follow-up Call');
  const [actDate, setActDate] = useState(new Date().toISOString().slice(0, 10));
  const [actTime, setActTime] = useState('11:00');
  const [actDesc, setActDesc] = useState('');

  // Complete / Reschedule / Cancel modals inline
  const [completingAct, setCompletingAct] = useState<ActivityRecord | null>(null);
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [reschedulingAct, setReschedulingAct] = useState<ActivityRecord | null>(null);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedTime, setReschedTime] = useState('');
  const [cancellingAct, setCancellingAct] = useState<ActivityRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Communication Log Form
  const [showCommForm, setShowCommForm] = useState(false);
  const [commType, setCommType] = useState('Call Completed');
  const [commDesc, setCommDesc] = useState('');
  const [commNextAction, setCommNextAction] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        lead: LeadRecord;
        activities: ActivityRecord[];
        communications: CommunicationRecord[];
        timeline: TimelineEvent[];
        auditLogs: AuditLogEntry[];
        duplicates: DuplicateMatch[];
      }>(`/api/leads/${leadId}`);
      setLead(res.lead);
      setActivities(res.activities);
      setCommunications(res.communications);
      setTimeline(res.timeline);
      setAuditLogs(res.auditLogs);
      setDuplicates(res.duplicates);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [leadId]);

  const stages = masters
    .filter((m) => m.category === 'lead_stage' && m.is_active === 1)
    .sort((a, b) => a.sort_order - b.sort_order);
  const deadReasons = masters.filter((m) => m.category === 'dead_reason');
  const sources = masters.filter((m) => m.category === 'lead_source' && m.is_active === 1);
  const localitiesMaster = masters.filter((m) => m.category === 'locality' && m.is_active === 1);
  const bhkMaster = masters.filter((m) => m.category === 'bhk_config' && m.is_active === 1);
  const furnishingMaster = masters.filter((m) => m.category === 'furnishing_type' && m.is_active === 1);
  const possessionMaster = masters.filter((m) => m.category === 'possession_pref' && m.is_active === 1);

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E5DEC9] bg-white p-8 dark:border-[#2A2A2A] dark:bg-[#171717]">
        <p className="text-xs text-[#737373]">Loading lead profile...</p>
      </div>
    );
  }

  if (error && !lead) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-white p-6 dark:bg-[#171717]">
        <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        <button type="button" onClick={onBack} className="mt-3 text-xs font-semibold text-[#B58A35] hover:underline">
          ← Back to Leads
        </button>
      </div>
    );
  }

  if (!lead) return null;

  const stageMeta = masters.find((m) => m.category === 'lead_stage' && m.name === lead.stage);
  const isTerminal = Boolean(stageMeta?.is_terminal);
  const canEdit = user.role === 'super_admin' || !isTerminal;
  const isAdmin = user.role === 'super_admin';

  const handleStageSelect = async (nextStageName: string) => {
    if (nextStageName === lead.stage) return;
    setError(null);
    const target = masters.find((m) => m.category === 'lead_stage' && m.name === nextStageName);
    if (!target) return;

    if (target.terminal_outcome === 'won' || target.system_key === 'booking_done') {
      setBookingModalStage(target.name);
      return;
    }
    if (target.terminal_outcome === 'lost' || target.system_key === 'dead') {
      setDeadModalStage(target.name);
      return;
    }
    try {
      await apiFetch(`/api/leads/${lead.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: nextStageName }),
      });
      await load();
      onMutated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveEdit = async (section: 'customer' | 'requirement' | 'booking') => {
    setError(null);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editDraft),
      });
      if (section === 'customer') setEditingCustomer(false);
      if (section === 'requirement') setEditingRequirement(false);
      if (section === 'booking') setEditingBooking(false);
      await load();
      onMutated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleScheduleActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/api/leads/${lead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          activity_type: actType,
          scheduled_date: actDate,
          scheduled_time: actTime,
          description: actDesc,
        }),
      });
      setActDesc('');
      setShowActForm(false);
      await load();
      onMutated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCompleteActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingAct) return;
    setError(null);
    try {
      await apiFetch(`/api/activities/${completingAct.id}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ completion_remarks: completionRemarks }),
      });
      setCompletingAct(null);
      setCompletionRemarks('');
      await load();
      onMutated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRescheduleActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingAct) return;
    setError(null);
    try {
      await apiFetch(`/api/activities/${reschedulingAct.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduled_date: reschedDate, scheduled_time: reschedTime }),
      });
      setReschedulingAct(null);
      await load();
      onMutated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCancelActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingAct) return;
    setError(null);
    try {
      await apiFetch(`/api/activities/${cancellingAct.id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ cancel_reason: cancelReason }),
      });
      setCancellingAct(null);
      setCancelReason('');
      await load();
      onMutated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLogCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/api/leads/${lead.id}/communications`, {
        method: 'POST',
        body: JSON.stringify({
          comm_type: commType,
          description: commDesc,
          next_action_remarks: commNextAction,
        }),
      });
      setCommDesc('');
      setCommNextAction('');
      setShowCommForm(false);
      await load();
      onMutated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSoftDelete = async () => {
    setError(null);
    try {
      await apiFetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      onMutated();
      onBack();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRestore = async () => {
    setError(null);
    try {
      await apiFetch(`/api/leads/${lead.id}/restore`, { method: 'POST' });
      await load();
      onMutated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const upcomingActivities = activities.filter((a) => a.status === 'Pending');

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#737373] hover:text-[#B58A35] mb-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Leads
            </button>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono-tabular text-sm font-bold text-[#B58A35]">{lead.lead_code}</span>
              <h1 className="text-xl font-bold text-[#171717] dark:text-white">{lead.customer_name}</h1>
              {lead.is_inactive === 1 && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                  Inactive ({lead.inactive_days}d)
                </span>
              )}
              {lead.is_deleted === 1 && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300">
                  Deleted
                </span>
              )}
            </div>
            <div className="text-xs text-[#737373] dark:text-[#A3A3A3] flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Assigned: <strong className="text-[#171717] dark:text-white">{lead.assigned_to_name}</strong></span>
              <span>·</span>
              <span>Creator: {lead.created_by_name}</span>
              <span>·</span>
              <span>Source: {lead.lead_source}</span>
              <span>·</span>
              <span>Created {formatDateOnly(lead.created_at)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Stage Selector */}
            {!isTerminal && lead.is_deleted === 0 ? (
              <select
                value={lead.stage}
                onChange={(e) => handleStageSelect(e.target.value)}
                className="rounded-lg border border-[#B58A35] bg-[#F3EBDD]/60 px-3 py-1.5 text-xs font-semibold text-[#171717] dark:bg-[#26211A] dark:text-[#F3EBDD]"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.name}>
                    Stage: {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  lead.stage === 'Booking Done'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'
                }`}
              >
                Stage: {lead.stage} (Closed)
              </span>
            )}

            {isAdmin && lead.is_deleted === 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowReassign(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] px-3 py-1.5 text-xs font-medium text-[#171717] hover:bg-[#F3EBDD] dark:border-[#2E2E2E] dark:text-white dark:hover:bg-[#242424]"
                >
                  <UserCheck className="h-3.5 w-3.5" /> Reassign
                </button>

                {isTerminal && (
                  <button
                    type="button"
                    onClick={() => setShowReopen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#B58A35] px-3 py-1.5 text-xs font-medium text-[#B58A35] hover:bg-[#B58A35]/10"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reopen Lead
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSoftDelete}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Soft Delete
                </button>
              </>
            )}

            {isAdmin && lead.is_deleted === 1 && (
              <button
                type="button"
                onClick={handleRestore}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#171717] px-3 py-1.5 text-xs font-semibold text-white dark:bg-[#B58A35] dark:text-[#171717]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restore Lead
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {duplicates.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-50/70 p-3 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Other requirements linked to {lead.mobile}:
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {duplicates.map((d) => {
                const canOpen = d.is_deleted === 0 && (isAdmin || d.assigned_to === user.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={!canOpen}
                    onClick={() => canOpen && onOpenLead(d.id)}
                    className="rounded border border-amber-500/30 bg-white px-2.5 py-1 text-[11px] font-medium text-[#171717] hover:border-[#B58A35] disabled:opacity-60 dark:bg-[#171717] dark:text-white"
                  >
                    <span className="font-mono-tabular text-[#B58A35]">{d.lead_code}</span> · {d.requirement_summary} · {d.stage}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main 2-Column Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Customer, Requirement, Booking/Dead Details */}
        <div className="lg:col-span-5 space-y-5">
          {/* Customer Details */}
          <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#171717] dark:text-white">Customer Details</h2>
              {canEdit && !editingCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    setEditDraft({
                      customer_name: lead.customer_name,
                      mobile: lead.mobile,
                      alternate_mobile: lead.alternate_mobile || '',
                      whatsapp: lead.whatsapp || '',
                      email: lead.email || '',
                      company_name: lead.company_name || '',
                      lead_source: lead.lead_source,
                      customer_remarks: lead.customer_remarks || '',
                    });
                    setEditingCustomer(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#B58A35] hover:underline"
                >
                  <Edit3 className="h-3 w-3" /> Edit
                </button>
              )}
            </div>

            {editingCustomer ? (
              <div className="space-y-2.5 text-xs">
                <input
                  type="text"
                  value={String(editDraft.customer_name || '')}
                  onChange={(e) => setEditDraft({ ...editDraft, customer_name: e.target.value })}
                  placeholder="Customer Name"
                  className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    maxLength={10}
                    value={String(editDraft.mobile || '')}
                    onChange={(e) => setEditDraft({ ...editDraft, mobile: e.target.value.replace(/\D/g, '') })}
                    placeholder="Mobile"
                    className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  />
                  <input
                    type="tel"
                    maxLength={10}
                    value={String(editDraft.alternate_mobile || '')}
                    onChange={(e) => setEditDraft({ ...editDraft, alternate_mobile: e.target.value.replace(/\D/g, '') })}
                    placeholder="Alternate Mobile"
                    className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[#737373]">WhatsApp</span>
                      <button
                        type="button"
                        onClick={() => setEditDraft({ ...editDraft, whatsapp: editDraft.mobile })}
                        disabled={!editDraft.mobile}
                        className="text-[10px] font-semibold text-[#B58A35] hover:underline disabled:opacity-40 cursor-pointer"
                        title="Copy Mobile into WhatsApp"
                      >
                        Same as Primary
                      </button>
                    </div>
                    <input
                      type="tel"
                      maxLength={10}
                      value={String(editDraft.whatsapp || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, whatsapp: e.target.value.replace(/\D/g, '') })}
                      placeholder="WhatsApp (10 digits)"
                      className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    />
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#737373] mb-1">Email</span>
                    <input
                      type="email"
                      value={String(editDraft.email || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                      placeholder="Email"
                      className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={String(editDraft.company_name || '')}
                    onChange={(e) => setEditDraft({ ...editDraft, company_name: e.target.value })}
                    placeholder="Company"
                    className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  />
                  <select
                    value={String(editDraft.lead_source || '')}
                    onChange={(e) => setEditDraft({ ...editDraft, lead_source: e.target.value })}
                    className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={String(editDraft.customer_remarks || '')}
                  onChange={(e) => setEditDraft({ ...editDraft, customer_remarks: e.target.value })}
                  placeholder="Customer Remarks"
                  className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingCustomer(false)}
                    className="rounded border border-[#E5DEC9] px-3 py-1 text-xs dark:border-[#2E2E2E] dark:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit('customer')}
                    className="rounded bg-[#171717] px-3 py-1 text-xs font-semibold text-white dark:bg-[#B58A35] dark:text-[#171717]"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Primary Mobile</dt>
                  <dd className="font-mono-tabular font-medium text-[#171717] dark:text-white">{lead.mobile}</dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Alternate Mobile</dt>
                  <dd className="font-mono-tabular text-[#171717] dark:text-white">{lead.alternate_mobile || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">WhatsApp</dt>
                  <dd className="font-mono-tabular text-[#171717] dark:text-white">{lead.whatsapp || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Email</dt>
                  <dd className="text-[#171717] dark:text-white truncate">{lead.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Company</dt>
                  <dd className="text-[#171717] dark:text-white">{lead.company_name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Last Interaction</dt>
                  <dd className="font-mono-tabular text-[#171717] dark:text-white">
                    {formatDateOnly(lead.last_qualifying_interaction_at)}
                  </dd>
                </div>
                {lead.customer_remarks && (
                  <div className="col-span-2">
                    <dt className="text-[#737373] dark:text-[#A3A3A3]">Customer Remarks</dt>
                    <dd className="text-[#171717] dark:text-white mt-0.5">{lead.customer_remarks}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Property Requirement */}
          <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#171717] dark:text-white">Property Requirement</h2>
              {canEdit && !editingRequirement && (
                <button
                  type="button"
                  onClick={() => {
                    setEditDraft({
                      localities: [...lead.localities],
                      budget_from: lead.budget_from ?? '',
                      budget_to: lead.budget_to ?? '',
                      min_area: lead.min_area ?? '',
                      max_area: lead.max_area ?? '',
                      area_unit: lead.area_unit || 'Sq. Ft.',
                      bhk_config: lead.bhk_config || '',
                      commercial_config: lead.commercial_config || '',
                      furnishing_type: lead.furnishing_type || '',
                      preferred_floor: lead.preferred_floor || '',
                      possession_pref: lead.possession_pref || '',
                      required_workstations: lead.required_workstations ?? '',
                      required_cabins: lead.required_cabins ?? '',
                      requirement_remarks: lead.requirement_remarks || '',
                    });
                    setEditingRequirement(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#B58A35] hover:underline"
                >
                  <Edit3 className="h-3 w-3" /> Edit
                </button>
              )}
            </div>

            {editingRequirement ? (
              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-[11px] text-[#737373] mb-1">Localities</label>
                  <div className="flex flex-wrap gap-1">
                    {localitiesMaster.map((loc) => {
                      const arr = (editDraft.localities as string[]) || [];
                      const active = arr.includes(loc.name);
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() =>
                            setEditDraft({
                              ...editDraft,
                              localities: active ? arr.filter((x) => x !== loc.name) : [...arr, loc.name],
                            })
                          }
                          className={`rounded px-2 py-0.5 text-[11px] border ${
                            active
                              ? 'border-[#B58A35] bg-[#F3EBDD] text-[#171717] dark:bg-[#26211A] dark:text-[#F3EBDD]'
                              : 'border-[#E5DEC9] text-[#737373] dark:border-[#2E2E2E]'
                          }`}
                        >
                          {loc.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-[#737373]">Budget From (INR)</span>
                      {Boolean(editDraft.budget_from && Number(editDraft.budget_from) > 0) && (
                        <span className="text-[10px] font-semibold text-[#B58A35]">
                          {formatAmountInWords(editDraft.budget_from as string | number)}
                        </span>
                      )}
                    </div>
                    <select
                      value={generateBudgetOptions(lead.transaction_type).some((o) => o.value === Number(editDraft.budget_from)) ? String(editDraft.budget_from) : ''}
                      onChange={(e) => {
                        if (e.target.value) setEditDraft({ ...editDraft, budget_from: e.target.value });
                      }}
                      className="w-full mb-1 rounded-lg border border-[#E5DEC9] px-2 py-1 text-xs dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    >
                      <option value="">Select Preset...</option>
                      {generateBudgetOptions(lead.transaction_type).map((opt) => (
                        <option key={`edit-from-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={String(editDraft.budget_from ?? '')}
                      onChange={(e) => setEditDraft({ ...editDraft, budget_from: e.target.value })}
                      placeholder="Budget From (INR)"
                      className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-[#737373]">Budget To (INR)</span>
                      {Boolean(editDraft.budget_to && Number(editDraft.budget_to) > 0) && (
                        <span className="text-[10px] font-semibold text-[#B58A35]">
                          {formatAmountInWords(editDraft.budget_to as string | number)}
                        </span>
                      )}
                    </div>
                    <select
                      value={generateBudgetOptions(lead.transaction_type).some((o) => o.value === Number(editDraft.budget_to)) ? String(editDraft.budget_to) : ''}
                      onChange={(e) => {
                        if (e.target.value) setEditDraft({ ...editDraft, budget_to: e.target.value });
                      }}
                      className="w-full mb-1 rounded-lg border border-[#E5DEC9] px-2 py-1 text-xs dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    >
                      <option value="">Select Preset...</option>
                      {generateBudgetOptions(lead.transaction_type).map((opt) => (
                        <option key={`edit-to-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={String(editDraft.budget_to ?? '')}
                      onChange={(e) => setEditDraft({ ...editDraft, budget_to: e.target.value })}
                      placeholder="Budget To (INR)"
                      className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    value={String(editDraft.min_area ?? '')}
                    onChange={(e) => setEditDraft({ ...editDraft, min_area: e.target.value })}
                    placeholder="Min Area"
                    className="rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  />
                  <input
                    type="number"
                    value={String(editDraft.max_area ?? '')}
                    onChange={(e) => setEditDraft({ ...editDraft, max_area: e.target.value })}
                    placeholder="Max Area"
                    className="rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  />
                  <select
                    value={String(editDraft.area_unit || 'Sq. Ft.')}
                    onChange={(e) => setEditDraft({ ...editDraft, area_unit: e.target.value })}
                    className="rounded-lg border border-[#E5DEC9] px-2 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {lead.property_type === 'Residential' ? (
                    <select
                      value={String(editDraft.bhk_config || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, bhk_config: e.target.value })}
                      className="rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    >
                      <option value="">BHK (Any)</option>
                      {bhkMaster.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={String(editDraft.commercial_config || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, commercial_config: e.target.value })}
                      placeholder="Commercial Config"
                      className="rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    />
                  )}
                  <select
                    value={String(editDraft.furnishing_type || '')}
                    onChange={(e) => setEditDraft({ ...editDraft, furnishing_type: e.target.value })}
                    className="rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  >
                    <option value="">Furnishing (Any)</option>
                    {furnishingMaster.map((f) => (
                      <option key={f.id} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {lead.property_subtype.trim().toLowerCase() === 'showroom' ? (
                    <div>
                      <span className="block text-[11px] text-[#737373] mb-1">Preferred Floor (Showroom)</span>
                      <select
                        value={String(editDraft.preferred_floor || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, preferred_floor: e.target.value })}
                        className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                      >
                        <option value="Ground Floor">Ground Floor</option>
                        <option value="First Floor">First Floor</option>
                        <option value="Second Floor">Second Floor</option>
                        <option value="Third Floor">Third Floor</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <span className="block text-[11px] text-[#737373] mb-1">Preferred Floor</span>
                      <input
                        type="text"
                        value={String(editDraft.preferred_floor || '')}
                        onChange={(e) => setEditDraft({ ...editDraft, preferred_floor: e.target.value })}
                        placeholder="Preferred Floor"
                        className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                      />
                    </div>
                  )}
                  <div>
                    <span className="block text-[11px] text-[#737373] mb-1">Possession</span>
                    <select
                      value={String(editDraft.possession_pref || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, possession_pref: e.target.value })}
                      className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    >
                      <option value="">Possession (Any)</option>
                      {possessionMaster.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <input
                  type="text"
                  value={String(editDraft.requirement_remarks || '')}
                  onChange={(e) => setEditDraft({ ...editDraft, requirement_remarks: e.target.value })}
                  placeholder="Requirement Remarks"
                  className="w-full rounded-lg border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingRequirement(false)}
                    className="rounded border border-[#E5DEC9] px-3 py-1 text-xs dark:border-[#2E2E2E] dark:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit('requirement')}
                    className="rounded bg-[#171717] px-3 py-1 text-xs font-semibold text-white dark:bg-[#B58A35] dark:text-[#171717]"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Type &amp; Subtype</dt>
                  <dd className="font-medium text-[#171717] dark:text-white">
                    {lead.property_type} · {lead.property_subtype}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Transaction</dt>
                  <dd className="font-medium text-[#171717] dark:text-white">{lead.transaction_type}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Preferred Localities</dt>
                  <dd className="text-[#171717] dark:text-white mt-0.5">{lead.localities.join(' · ')}</dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Budget (INR)</dt>
                  <dd className="font-mono-tabular font-medium text-[#171717] dark:text-white">
                    {formatBudgetRange(lead.budget_from, lead.budget_to)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Area</dt>
                  <dd className="font-mono-tabular text-[#171717] dark:text-white">
                    {lead.min_area || lead.max_area
                      ? `${lead.min_area ?? '—'} to ${lead.max_area ?? '—'} ${lead.area_unit || ''}`
                      : '—'}
                  </dd>
                </div>
                {lead.property_type === 'Residential' ? (
                  <div>
                    <dt className="text-[#737373] dark:text-[#A3A3A3]">BHK</dt>
                    <dd className="text-[#171717] dark:text-white">{lead.bhk_config || '—'}</dd>
                  </div>
                ) : (
                  <>
                    <div>
                      <dt className="text-[#737373] dark:text-[#A3A3A3]">Commercial Config</dt>
                      <dd className="text-[#171717] dark:text-white">{lead.commercial_config || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[#737373] dark:text-[#A3A3A3]">Workstations / Cabins</dt>
                      <dd className="font-mono-tabular text-[#171717] dark:text-white">
                        {lead.required_workstations ?? '—'} WS / {lead.required_cabins ?? '—'} Cabins
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Furnishing</dt>
                  <dd className="text-[#171717] dark:text-white">{lead.furnishing_type || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Preferred Floor</dt>
                  <dd className="text-[#171717] dark:text-white">{lead.preferred_floor || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#737373] dark:text-[#A3A3A3]">Possession</dt>
                  <dd className="text-[#171717] dark:text-white">{lead.possession_pref || '—'}</dd>
                </div>
                {lead.requirement_remarks && (
                  <div className="col-span-2">
                    <dt className="text-[#737373] dark:text-[#A3A3A3]">Requirement Remarks</dt>
                    <dd className="text-[#171717] dark:text-white mt-0.5">{lead.requirement_remarks}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Booking Details (PRD 6) */}
          {lead.stage === 'Booking Done' && (
            <div className="rounded-xl border border-emerald-600/30 bg-emerald-50/30 p-5 dark:bg-emerald-950/15">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">Booking Details</h2>
                {isAdmin && !editingBooking && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditDraft({
                        booking_date: lead.booking_date || '',
                        booking_project_name: lead.booking_project_name || '',
                        final_transaction_amount: lead.final_transaction_amount || 0,
                        brokerage_amount: lead.brokerage_amount || 0,
                        brokerage_percentage: lead.brokerage_percentage || 0,
                        payment_status: lead.payment_status || 'Pending',
                        booking_remarks: lead.booking_remarks || '',
                      });
                      setEditingBooking(true);
                    }}
                    className="text-xs font-medium text-[#B58A35] hover:underline"
                  >
                    Correct (Admin)
                  </button>
                )}
              </div>

              {editingBooking ? (
                <div className="space-y-2 text-xs">
                  <input
                    type="text"
                    value={String(editDraft.booking_project_name || '')}
                    onChange={(e) => setEditDraft({ ...editDraft, booking_project_name: e.target.value })}
                    className="w-full rounded border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={String(editDraft.final_transaction_amount ?? '')}
                      onChange={(e) => setEditDraft({ ...editDraft, final_transaction_amount: Number(e.target.value) })}
                      className="rounded border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    />
                    <input
                      type="number"
                      value={String(editDraft.brokerage_amount ?? '')}
                      onChange={(e) => setEditDraft({ ...editDraft, brokerage_amount: Number(e.target.value) })}
                      className="rounded border border-[#E5DEC9] px-2.5 py-1.5 font-mono-tabular dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                    />
                  </div>
                  <select
                    value={String(editDraft.payment_status || 'Pending')}
                    onChange={(e) => setEditDraft({ ...editDraft, payment_status: e.target.value })}
                    className="w-full rounded border border-[#E5DEC9] px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#111111] dark:text-white"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Paid">Paid</option>
                  </select>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingBooking(false)} className="px-3 py-1 rounded border text-xs">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit('booking')}
                      className="px-3 py-1 rounded bg-[#171717] text-white text-xs dark:bg-[#B58A35] dark:text-[#171717]"
                    >
                      Save Booking
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <dt className="text-[#737373]">Project</dt>
                    <dd className="font-semibold text-[#171717] dark:text-white">{lead.booking_project_name}</dd>
                  </div>
                  <div>
                    <dt className="text-[#737373]">Booking Date</dt>
                    <dd className="font-mono-tabular text-[#171717] dark:text-white">{lead.booking_date}</dd>
                  </div>
                  <div>
                    <dt className="text-[#737373]">Final Amount</dt>
                    <dd className="font-mono-tabular font-semibold text-[#171717] dark:text-white">
                      {formatINR(lead.final_transaction_amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#737373]">Brokerage ({lead.brokerage_percentage}%)</dt>
                    <dd className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatINR(lead.brokerage_amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#737373]">Payment Status</dt>
                    <dd className="font-medium text-[#171717] dark:text-white">{lead.payment_status}</dd>
                  </div>
                  {lead.booking_remarks && (
                    <div className="col-span-2">
                      <dt className="text-[#737373]">Remarks</dt>
                      <dd className="text-[#171717] dark:text-white">{lead.booking_remarks}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}

          {/* Dead Details */}
          {lead.stage === 'Dead' && (
            <div className="rounded-xl border border-[#E5DEC9] bg-neutral-100/70 p-5 dark:border-[#2A2A2A] dark:bg-[#1B1B1B]">
              <h2 className="text-sm font-semibold text-[#171717] dark:text-white mb-2">Dead Lead Closure</h2>
              <dl className="space-y-1.5 text-xs">
                <div>
                  <dt className="text-[#737373]">Reason</dt>
                  <dd className="font-medium text-[#171717] dark:text-white">{lead.dead_reason}</dd>
                </div>
                <div>
                  <dt className="text-[#737373]">Remarks</dt>
                  <dd className="text-[#171717] dark:text-white">{lead.dead_remarks || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#737373]">Marked By &amp; Date</dt>
                  <dd className="text-[#525252] dark:text-[#A3A3A3]">
                    {lead.dead_by_name} · {formatDateTime(lead.dead_at)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* Right Column: Upcoming Activities, Quick Actions & Timeline/Audit Tabs */}
        <div className="lg:col-span-7 space-y-5">
          {/* Quick Action Buttons + Upcoming Activities */}
          <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-[#171717] dark:text-white">
                Upcoming Activities ({upcomingActivities.length})
              </h2>
              {lead.is_deleted === 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowActForm(!showActForm);
                        setShowCommForm(false);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#171717] px-3 py-1.5 text-xs font-semibold text-white dark:bg-[#B58A35] dark:text-[#171717]"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" /> Schedule Activity
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCommForm(!showCommForm);
                      setShowActForm(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] px-3 py-1.5 text-xs font-medium text-[#171717] hover:bg-[#F3EBDD] dark:border-[#2E2E2E] dark:text-white dark:hover:bg-[#242424]"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" /> Log Call / WhatsApp
                  </button>
                </div>
              )}
            </div>

            {showActForm && (
              <form
                onSubmit={handleScheduleActivity}
                className="mb-4 rounded-lg border border-[#E5DEC9] bg-[#F8F6F1] p-3.5 space-y-3 dark:border-[#2A2A2A] dark:bg-[#111111]"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <select
                    value={actType}
                    onChange={(e) => setActType(e.target.value)}
                    className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                  >
                    <option value="Follow-up Call">Follow-up Call</option>
                    <option value="WhatsApp Follow-up">WhatsApp Follow-up</option>
                    <option value="Site Visit">Site Visit (Auto-syncs stage)</option>
                    <option value="Meeting">Meeting (Auto-syncs stage)</option>
                    <option value="Other">Other</option>
                  </select>
                  <input
                    type="date"
                    required
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                    className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                  />
                  <input
                    type="time"
                    required
                    value={actTime}
                    onChange={(e) => setActTime(e.target.value)}
                    className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                  />
                </div>
                <input
                  type="text"
                  value={actDesc}
                  onChange={(e) => setActDesc(e.target.value)}
                  placeholder="Description / Agenda (e.g., Visit Skyview 4BHK sample flat)"
                  className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowActForm(false)} className="px-3 py-1 text-xs text-[#737373]">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[#171717] px-3.5 py-1.5 text-xs font-semibold text-white dark:bg-[#B58A35] dark:text-[#171717]"
                  >
                    Save Activity
                  </button>
                </div>
              </form>
            )}

            {showCommForm && (
              <form
                onSubmit={handleLogCommunication}
                className="mb-4 rounded-lg border border-[#E5DEC9] bg-[#F8F6F1] p-3.5 space-y-2.5 dark:border-[#2A2A2A] dark:bg-[#111111]"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <select
                    value={commType}
                    onChange={(e) => setCommType(e.target.value)}
                    className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                  >
                    <option value="Call Completed">Call Completed</option>
                    <option value="WhatsApp Message Sent">WhatsApp Message Sent</option>
                    <option value="Customer Response Received">Customer Response Received</option>
                    <option value="Discussion Summary">Discussion Summary</option>
                    <option value="Next Action/Follow-up Remarks">Next Action/Follow-up Remarks</option>
                  </select>
                  <input
                    type="text"
                    value={commNextAction}
                    onChange={(e) => setCommNextAction(e.target.value)}
                    placeholder="Next Action / Follow-up Remarks (Optional)"
                    className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                  />
                </div>
                <textarea
                  required
                  rows={2}
                  value={commDesc}
                  onChange={(e) => setCommDesc(e.target.value)}
                  placeholder="Enter discussion summary or customer response..."
                  className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCommForm(false)} className="px-3 py-1 text-xs text-[#737373]">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[#171717] px-3.5 py-1.5 text-xs font-semibold text-white dark:bg-[#B58A35] dark:text-[#171717]"
                  >
                    Record Log
                  </button>
                </div>
              </form>
            )}

            {upcomingActivities.length === 0 ? (
              <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">No pending activities scheduled for this lead.</p>
            ) : (
              <div className="space-y-2.5">
                {upcomingActivities.map((act) => (
                  <div
                    key={act.id}
                    className={`rounded-lg border p-3 text-xs ${
                      act.is_overdue
                        ? 'border-red-500/40 bg-red-50/40 dark:bg-red-950/15'
                        : 'border-[#E5DEC9] dark:border-[#2A2A2A]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#171717] dark:text-white">{act.activity_type}</span>
                          {act.is_overdue && (
                            <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              Overdue
                            </span>
                          )}
                          <span className="font-mono-tabular text-[#B58A35]">
                            {act.scheduled_date} {act.scheduled_time}
                          </span>
                        </div>
                        <p className="text-[#525252] dark:text-[#A3A3A3] mt-0.5">
                          {act.description || 'No description'} · Assigned: {act.assigned_to_name}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setCompletingAct(act);
                            setCompletionRemarks('');
                          }}
                          className="inline-flex items-center gap-1 rounded border border-emerald-600/40 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Complete
                        </button>
                        {(isAdmin || act.assigned_to === user.id) && (
                          <button
                            type="button"
                            onClick={() => {
                              setReschedulingAct(act);
                              setReschedDate(act.scheduled_date);
                              setReschedTime(act.scheduled_time);
                            }}
                            className="rounded border border-[#E5DEC9] px-2 py-1 text-[11px] font-medium text-[#171717] hover:bg-[#F3EBDD] dark:border-[#2E2E2E] dark:text-white"
                          >
                            Reschedule
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setCancellingAct(act);
                            setCancelReason('');
                          }}
                          className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 dark:text-red-400"
                        >
                          <XCircle className="h-3 w-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inline Activity Action Dialogs */}
            {completingAct && (
              <form
                onSubmit={handleCompleteActivity}
                className="mt-3 rounded-lg border border-emerald-600/30 bg-emerald-50/40 p-3 space-y-2 dark:bg-emerald-950/20"
              >
                <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                  Complete {completingAct.activity_type}
                </div>
                <input
                  type="text"
                  value={completionRemarks}
                  onChange={(e) => setCompletionRemarks(e.target.value)}
                  placeholder="Outcome / completion remarks..."
                  className="w-full rounded border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setCompletingAct(null)} className="text-xs text-[#737373]">
                    Cancel
                  </button>
                  <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                    Confirm Complete
                  </button>
                </div>
              </form>
            )}

            {reschedulingAct && (
              <form
                onSubmit={handleRescheduleActivity}
                className="mt-3 rounded-lg border border-[#B58A35]/40 bg-[#F3EBDD]/40 p-3 space-y-2 dark:bg-[#221F1A]"
              >
                <div className="text-xs font-semibold text-[#171717] dark:text-white">
                  Reschedule {reschedulingAct.activity_type}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    required
                    value={reschedDate}
                    onChange={(e) => setReschedDate(e.target.value)}
                    className="rounded border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                  />
                  <input
                    type="time"
                    required
                    value={reschedTime}
                    onChange={(e) => setReschedTime(e.target.value)}
                    className="rounded border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setReschedulingAct(null)} className="text-xs text-[#737373]">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded bg-[#171717] px-3 py-1 text-xs font-semibold text-white dark:bg-[#B58A35] dark:text-[#171717]"
                  >
                    Save New Schedule
                  </button>
                </div>
              </form>
            )}

            {cancellingAct && (
              <form
                onSubmit={handleCancelActivity}
                className="mt-3 rounded-lg border border-red-500/30 bg-red-50/40 p-3 space-y-2 dark:bg-red-950/20"
              >
                <div className="text-xs font-semibold text-red-900 dark:text-red-300">
                  Cancel {cancellingAct.activity_type} (Stage will not revert)
                </div>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Cancellation reason (optional)"
                  className="w-full rounded border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-white"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setCancellingAct(null)} className="text-xs text-[#737373]">
                    Keep
                  </button>
                  <button type="submit" className="rounded bg-red-700 px-3 py-1 text-xs font-semibold text-white">
                    Confirm Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Chronological Timeline / All Activities / Communications / Immutable Audit History */}
          <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 dark:border-[#2A2A2A] dark:bg-[#171717]">
            <div className="flex flex-wrap items-center gap-1 border-b border-[#E5DEC9] pb-3 mb-4 dark:border-[#2A2A2A]">
              {[
                { key: 'timeline', label: `Chronological Timeline (${timeline.length})` },
                { key: 'activities', label: `All Activities (${activities.length})` },
                { key: 'communications', label: `Communication Logs (${communications.length})` },
                { key: 'audit', label: `Audit History (${auditLogs.length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'bg-[#171717] text-white dark:bg-[#B58A35] dark:text-[#171717]'
                      : 'text-[#525252] hover:bg-[#F3EBDD]/60 dark:text-[#A3A3A3] dark:hover:bg-[#242424]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'timeline' && (
              <div className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
                {timeline.map((ev) => (
                  <div key={ev.id} className="py-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#171717] dark:text-white">{ev.event_type}</span>
                      <span className="font-mono-tabular text-[11px] text-[#737373] dark:text-[#A3A3A3]">
                        {formatDateTime(ev.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-[#404040] dark:text-[#D4D4D4]">{ev.description}</p>
                    <p className="mt-0.5 text-[11px] text-[#737373] dark:text-[#A3A3A3]">By {ev.employee_name}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'activities' && (
              <div className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
                {activities.length === 0 ? (
                  <p className="text-xs text-[#737373]">No activities recorded.</p>
                ) : (
                  activities.map((a) => (
                    <div key={a.id} className="py-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#171717] dark:text-white">
                          {a.activity_type} · {a.status}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-[#737373]">
                          {a.scheduled_date} {a.scheduled_time}
                        </span>
                      </div>
                      <p className="mt-1 text-[#525252] dark:text-[#A3A3A3]">
                        {a.completion_remarks || a.cancel_reason || a.description || '—'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#737373]">
                        Assignee: {a.assigned_to_name}
                        {a.completed_by_name ? ` · Completed by ${a.completed_by_name} (${formatDateTime(a.completed_at)})` : ''}
                        {a.reschedule_count > 0 ? ` · Rescheduled ${a.reschedule_count}x` : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'communications' && (
              <div className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
                {communications.length === 0 ? (
                  <p className="text-xs text-[#737373]">No manual communication logs recorded.</p>
                ) : (
                  communications.map((c) => (
                    <div key={c.id} className="py-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#171717] dark:text-white">{c.comm_type}</span>
                        <span className="font-mono-tabular text-[11px] text-[#737373]">{formatDateTime(c.created_at)}</span>
                      </div>
                      <p className="mt-1 text-[#404040] dark:text-[#D4D4D4]">{c.description}</p>
                      {c.next_action_remarks && (
                        <p className="mt-0.5 text-[11px] text-[#B58A35]">Next action: {c.next_action_remarks}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-[#737373]">Logged by {c.employee_name}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5DEC9] text-[#737373] dark:border-[#2A2A2A]">
                      <th className="py-2 pr-3 font-medium">When</th>
                      <th className="py-2 pr-3 font-medium">Action</th>
                      <th className="py-2 pr-3 font-medium">Field</th>
                      <th className="py-2 pr-3 font-medium">Previous → New</th>
                      <th className="py-2 font-medium">Employee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DEC9]/60 dark:divide-[#242424]">
                    {auditLogs.map((al) => (
                      <tr key={al.id}>
                        <td className="py-2 pr-3 font-mono-tabular text-[11px] text-[#737373] whitespace-nowrap">
                          {formatDateTime(al.created_at)}
                        </td>
                        <td className="py-2 pr-3 font-medium text-[#171717] dark:text-white whitespace-nowrap">{al.action_type}</td>
                        <td className="py-2 pr-3 text-[#525252] dark:text-[#A3A3A3]">{al.field_name || '—'}</td>
                        <td className="py-2 pr-3 text-[#262626] dark:text-[#E5E5E5]">
                          {al.previous_value || '—'} → {al.new_value || '—'}
                          {al.remarks && <div className="text-[11px] text-[#737373]">Remarks: {al.remarks}</div>}
                        </td>
                        <td className="py-2 text-[#525252] dark:text-[#A3A3A3] whitespace-nowrap">{al.employee_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {bookingModalStage && (
        <BookingModal
          lead={lead}
          targetStageName={bookingModalStage}
          onClose={() => setBookingModalStage(null)}
          onCompleted={() => {
            setBookingModalStage(null);
            load();
            onMutated();
          }}
        />
      )}

      {deadModalStage && (
        <DeadModal
          lead={lead}
          targetStageName={deadModalStage}
          deadReasons={deadReasons}
          onClose={() => setDeadModalStage(null)}
          onCompleted={() => {
            setDeadModalStage(null);
            load();
            onMutated();
          }}
        />
      )}

      {showReassign && (
        <ReassignModal
          lead={lead}
          users={users}
          onClose={() => setShowReassign(false)}
          onCompleted={() => {
            setShowReassign(false);
            load();
            onMutated();
          }}
        />
      )}

      {showReopen && (
        <ReopenModal
          lead={lead}
          stages={masters.filter((m) => m.category === 'lead_stage')}
          onClose={() => setShowReopen(false)}
          onCompleted={() => {
            setShowReopen(false);
            load();
            onMutated();
          }}
        />
      )}
    </div>
  );
};
