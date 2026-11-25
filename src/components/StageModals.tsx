import { X } from 'lucide-react';
import React, { useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import type { LeadRecord, MasterItem, UserProfile } from '../types.ts';

interface BookingModalProps {
  lead: LeadRecord;
  targetStageName: string;
  onClose: () => void;
  onCompleted: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({ lead, targetStageName, onClose, onCompleted }) => {
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectName, setProjectName] = useState(lead.booking_project_name || '');
  const [txAmount, setTxAmount] = useState(lead.final_transaction_amount ? String(lead.final_transaction_amount) : '');
  const [brokPct, setBrokPct] = useState(lead.brokerage_percentage ? String(lead.brokerage_percentage) : '2');
  const [brokAmount, setBrokAmount] = useState(lead.brokerage_amount ? String(lead.brokerage_amount) : '');
  const [paymentStatus, setPaymentStatus] = useState<'Pending' | 'Partially Paid' | 'Paid'>(
    lead.payment_status || 'Pending'
  );
  const [remarks, setRemarks] = useState(lead.booking_remarks || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAmountOrPctChange = (nextAmt: string, nextPct: string) => {
    setTxAmount(nextAmt);
    setBrokPct(nextPct);
    const a = Number(nextAmt);
    const p = Number(nextPct);
    if (!Number.isNaN(a) && !Number.isNaN(p) && a > 0 && p >= 0) {
      setBrokAmount(String(Math.round((a * p) / 100)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({
          stage: targetStageName,
          booking_date: bookingDate,
          booking_project_name: projectName,
          final_transaction_amount: Number(txAmount),
          brokerage_amount: Number(brokAmount),
          brokerage_percentage: Number(brokPct),
          payment_status: paymentStatus,
          booking_remarks: remarks,
        }),
      });
      onCompleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-white p-6 dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-[#1E3349]">
          <div>
            <h3 className="text-base font-semibold text-[#16273A] dark:text-white">
              Move to {targetStageName}
            </h3>
            <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
              {lead.lead_code} · {lead.customer_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[#737373] hover:text-[#16273A] dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Booking Date *</label>
              <input
                type="date"
                required
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Payment Status *</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as 'Pending' | 'Partially Paid' | 'Paid')}
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              >
                <option value="Pending">Pending</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
              Property / Project Name *
            </label>
            <input
              type="text"
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g., Skyview Residency, Bodakdev"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
                Transaction Amount (INR) *
              </label>
              <input
                type="number"
                required
                min={1}
                value={txAmount}
                onChange={(e) => handleAmountOrPctChange(e.target.value, brokPct)}
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
                Brokerage % *
              </label>
              <input
                type="number"
                required
                step="0.01"
                min={0}
                value={brokPct}
                onChange={(e) => handleAmountOrPctChange(txAmount, e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
                Brokerage Amount (INR) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={brokAmount}
                onChange={(e) => setBrokAmount(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
              Booking Remarks (Optional)
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-white dark:hover:bg-[#1A2C40]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#16273A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#20364F] disabled:opacity-50 dark:bg-[#C99B56] dark:text-[#16273A]"
            >
              {saving ? 'Saving Booking...' : 'Confirm Booking Done'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface DeadModalProps {
  lead: LeadRecord;
  targetStageName: string;
  deadReasons: MasterItem[];
  onClose: () => void;
  onCompleted: () => void;
}

export const DeadModal: React.FC<DeadModalProps> = ({ lead, targetStageName, deadReasons, onClose, onCompleted }) => {
  const activeReasons = deadReasons.filter((r) => r.is_active === 1);
  const [deadReason, setDeadReason] = useState(activeReasons[0]?.name || 'Other');
  const [deadRemarks, setDeadRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({
          stage: targetStageName,
          dead_reason: deadReason,
          dead_remarks: deadRemarks,
        }),
      });
      onCompleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-[#1E3349]">
          <div>
            <h3 className="text-base font-semibold text-[#16273A] dark:text-white">Mark Lead as Dead</h3>
            <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
              {lead.lead_code} · {lead.customer_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[#737373] hover:text-[#16273A] dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Dead Reason *</label>
            <select
              required
              value={deadReason}
              onChange={(e) => setDeadReason(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              {activeReasons.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
              Mandatory Closure Remarks *
            </label>
            <textarea
              required
              rows={3}
              value={deadRemarks}
              onChange={(e) => setDeadRemarks(e.target.value)}
              placeholder="Explain why this requirement is closed..."
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-white dark:hover:bg-[#1A2C40]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {saving ? 'Updating...' : 'Confirm Dead Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ReassignModalProps {
  lead: LeadRecord;
  users: UserProfile[];
  onClose: () => void;
  onCompleted: () => void;
}

export const ReassignModal: React.FC<ReassignModalProps> = ({ lead, users, onClose, onCompleted }) => {
  const activeUsers = users.filter((u) => u.status === 'active' && u.id !== lead.assigned_to);
  const [targetUserId, setTargetUserId] = useState<string>(activeUsers[0] ? String(activeUsers[0].id) : '');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}/reassign`, {
        method: 'POST',
        body: JSON.stringify({ assigned_to: targetUserId, remarks }),
      });
      onCompleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-[#1E3349]">
          <div>
            <h3 className="text-base font-semibold text-[#16273A] dark:text-white">Reassign Lead</h3>
            <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
              {lead.lead_code} · Current: {lead.assigned_to_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[#737373] hover:text-[#16273A] dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">New Assignee *</label>
            <select
              required
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role === 'super_admin' ? 'Super Admin' : u.designation})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[#737373] dark:text-[#A3A3A3]">
              Pending activities automatically transfer to the new assignee; completed & cancelled records stay with the original employee.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
              Mandatory Reassignment Remarks *
            </label>
            <textarea
              required
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Reason for reassignment..."
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-white dark:hover:bg-[#1A2C40]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || activeUsers.length === 0}
              className="rounded-lg bg-[#16273A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#20364F] disabled:opacity-50 dark:bg-[#C99B56] dark:text-[#16273A]"
            >
              {saving ? 'Reassigning...' : 'Confirm Reassignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ReopenModalProps {
  lead: LeadRecord;
  stages: MasterItem[];
  onClose: () => void;
  onCompleted: () => void;
}

export const ReopenModal: React.FC<ReopenModalProps> = ({ lead, stages, onClose, onCompleted }) => {
  const activeStages = stages.filter((s) => s.is_active === 1 && s.is_terminal === 0);
  const [stage, setStage] = useState(activeStages.find((s) => s.name === 'Negotiation')?.name || activeStages[0]?.name || 'New Lead');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ stage, remarks }),
      });
      onCompleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-[#1E3349]">
          <div>
            <h3 className="text-base font-semibold text-[#16273A] dark:text-white">Reopen Closed Lead</h3>
            <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
              {lead.lead_code} · Currently {lead.stage}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[#737373] hover:text-[#16273A] dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Reopen Into Stage *</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              {activeStages.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
              Mandatory Reopen Remarks *
            </label>
            <textarea
              required
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Authorization reason for reopening..."
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-white dark:hover:bg-[#1A2C40]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#16273A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#20364F] disabled:opacity-50 dark:bg-[#C99B56] dark:text-[#16273A]"
            >
              {saving ? 'Reopening...' : 'Reopen Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
