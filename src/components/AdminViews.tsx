import { Plus, RotateCcw, Shield, ShieldCheck, Trash2, Upload, UserMinus, UserPlus } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiFetch, formatDateOnly, formatDateTime } from '../lib/api.ts';
import type {
  AuditLogEntry,
  CompanySettings,
  LeadRecord,
  MasterCategory,
  MasterItem,
  UserProfile,
} from '../types.ts';

// ===================== MASTER MANAGEMENT (PRD 17) =====================

const MASTER_CATEGORIES: Array<{ key: MasterCategory; label: string; hasParent?: boolean }> = [
  { key: 'lead_stage', label: 'Lead Stages' },
  { key: 'lead_source', label: 'Lead Sources' },
  { key: 'locality', label: 'Ahmedabad Localities' },
  { key: 'property_type', label: 'Property Types' },
  { key: 'property_subtype', label: 'Property Subtypes', hasParent: true },
  { key: 'transaction_type', label: 'Transaction Types' },
  { key: 'bhk_config', label: 'BHK Configurations' },
  { key: 'furnishing_type', label: 'Furnishing Types' },
  { key: 'possession_pref', label: 'Possession Preferences' },
  { key: 'dead_reason', label: 'Dead Reasons' },
];

export const MastersView: React.FC<{
  masters: MasterItem[];
  onRefresh: () => void;
}> = ({ masters, onRefresh }) => {
  const [selectedCat, setSelectedCat] = useState<MasterCategory>('lead_stage');
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState('Residential');
  const [newOrder, setNewOrder] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editOrder, setEditOrder] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = masters
    .filter((m) => m.category === selectedCat)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const propertyTypes = masters.filter((m) => m.category === 'property_type');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/masters', {
        method: 'POST',
        body: JSON.stringify({
          category: selectedCat,
          name: newName,
          parent_value: selectedCat === 'property_subtype' ? newParent : null,
          sort_order: newOrder ? Number(newOrder) : undefined,
        }),
      });
      setNewName('');
      setNewOrder('');
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveEdit = async (item: MasterItem) => {
    setError(null);
    try {
      await apiFetch(`/api/masters/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          sort_order: Number(editOrder),
        }),
      });
      setEditingId(null);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleActive = async (item: MasterItem) => {
    setError(null);
    try {
      await apiFetch(`/api/masters/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: item.is_active === 1 ? false : true }),
      });
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (item: MasterItem) => {
    setError(null);
    try {
      await apiFetch(`/api/masters/${item.id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSeedDefaults = async () => {
    setError(null);
    setNotice(null);
    setSeeding(true);
    try {
      const res = await apiFetch<{ added: number }>('/api/masters/seed-defaults', { method: 'POST' });
      setNotice(
        res.added > 0
          ? `Added ${res.added} default PRD master value(s) across categories.`
          : 'All default PRD master values are already present.'
      );
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">Master Management</h1>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
            Add, edit, reorder, and deactivate master values. Used values cannot be permanently deleted to preserve history.
          </p>
        </div>
        <button
          type="button"
          disabled={seeding}
          onClick={handleSeedDefaults}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#16273A] hover:bg-[#FBF6EE] disabled:opacity-50 dark:border-[#1E3349] dark:bg-[#121E2C] dark:text-white dark:hover:bg-[#1A2C40]"
        >
          <RotateCcw className="h-3.5 w-3.5 text-[#C99B56]" />
          {seeding ? 'Seeding PRD Defaults...' : 'Load PRD Defaults'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-2 dark:border-[#1E3349] dark:bg-[#121E2C]">
        {MASTER_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setSelectedCat(c.key);
              setError(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              selectedCat === c.key
                ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                : 'text-[#525252] hover:bg-[#FBF6EE]/70 dark:text-[#A3A3A3]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          {notice}
        </div>
      )}

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#1E3349] dark:bg-[#121E2C]">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2.5">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">New Value Name *</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Add ${MASTER_CATEGORIES.find((c) => c.key === selectedCat)?.label}...`}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>
          {selectedCat === 'property_subtype' && (
            <div>
              <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Parent Property Type</label>
              <select
                value={newParent}
                onChange={(e) => setNewParent(e.target.value)}
                className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              >
                {propertyTypes.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="w-24">
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Order</label>
            <input
              type="number"
              value={newOrder}
              onChange={(e) => setNewOrder(e.target.value)}
              placeholder="Auto"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-2 text-xs font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg bg-[#16273A] px-4 py-2 text-xs font-semibold text-white dark:bg-[#C99B56] dark:text-[#16273A]"
          >
            <Plus className="h-3.5 w-3.5" /> Add Value
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden dark:border-[#1E3349] dark:bg-[#121E2C]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Order</th>
              <th className="px-4 py-2.5 font-semibold">Value Name</th>
              {selectedCat === 'property_subtype' && <th className="px-4 py-2.5 font-semibold">Property Type</th>}
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
            {items.length === 0 ? (
              <tr>
                <td colSpan={selectedCat === 'property_subtype' ? 5 : 4} className="px-4 py-8 text-center text-[#737373]">
                  No master values found for this category yet. Click <strong>Load PRD Defaults</strong> above or add one manually.
                </td>
              </tr>
            ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-2.5 font-mono-tabular w-20">
                  {editingId === item.id ? (
                    <input
                      type="number"
                      value={editOrder}
                      onChange={(e) => setEditOrder(e.target.value)}
                      className="w-16 rounded border border-[#E2E8F0] px-2 py-1 text-xs font-mono-tabular dark:bg-[#0C141E] dark:text-white"
                    />
                  ) : (
                    item.sort_order
                  )}
                </td>
                <td className="px-4 py-2.5 font-medium text-[#16273A] dark:text-white">
                  {editingId === item.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded border border-[#E2E8F0] px-2.5 py-1 text-xs dark:bg-[#0C141E] dark:text-white"
                    />
                  ) : (
                    <>
                      {item.name}
                      {item.is_terminal === 1 && (
                        <span className="ml-2 text-[11px] text-[#737373]">(Terminal {item.terminal_outcome})</span>
                      )}
                    </>
                  )}
                </td>
                {selectedCat === 'property_subtype' && (
                  <td className="px-4 py-2.5 text-[#525252] dark:text-[#A3A3A3]">{item.parent_value || '—'}</td>
                )}
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      item.is_active === 1
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                    }`}
                  >
                    {item.is_active === 1 ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                  {editingId === item.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(item)}
                        className="font-semibold text-[#C99B56] hover:underline"
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-[#737373]">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditName(item.name);
                          setEditOrder(String(item.sort_order));
                        }}
                        className="text-[#C99B56] font-medium hover:underline"
                      >
                        Edit
                      </button>
                      {item.is_terminal === 0 && (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          className="text-[#525252] hover:underline dark:text-[#A3A3A3]"
                        >
                          {item.is_active === 1 ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      {item.is_terminal === 0 && !item.system_key && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ===================== USER & EMPLOYEE MANAGEMENT (PRD 18) =====================

export const UsersView: React.FC<{
  currentUser: UserProfile;
  users: UserProfile[];
  onRefresh: () => void;
}> = ({ currentUser, users, onRefresh }) => {
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [designation, setDesignation] = useState('Property Consultant');
  const [role, setRole] = useState<'sales_executive' | 'super_admin'>('sales_executive');

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editDraft, setEditDraft] = useState<{
    email: string;
    full_name: string;
    mobile: string;
    designation: string;
    role: 'sales_executive' | 'super_admin';
  } | null>(null);

  const [deactivateUser, setDeactivateUser] = useState<UserProfile | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, full_name: fullName, mobile, designation, role }),
      });
      setShowCreate(false);
      setEmail('');
      setFullName('');
      setMobile('');
      setNotice('Employee invited. They can now sign in using Google Authentication.');
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editDraft) return;
    setError(null);
    try {
      await apiFetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editDraft),
      });
      setEditingUser(null);
      setNotice('Employee profile updated.');
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivateUser) return;
    setError(null);
    try {
      await apiFetch(`/api/users/${deactivateUser.id}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({ reassign_to: reassignTargetId || undefined }),
      });
      setDeactivateUser(null);
      setNotice(`${deactivateUser.full_name} deactivated.`);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleReactivate = async (u: UserProfile) => {
    setError(null);
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const activeSalesExecs = users.filter((u) => u.status === 'active' && u.role === 'sales_executive');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">Team &amp; Employee Management</h1>
          <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
            Invite employees by their Google email, control roles, and manage deactivation with automatic lead reassignment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#16273A] px-3.5 py-2 text-xs font-semibold text-white dark:bg-[#C99B56] dark:text-[#16273A]"
        >
          <UserPlus className="h-3.5 w-3.5" /> Invite Employee
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3 dark:border-[#1E3349] dark:bg-[#121E2C]"
        >
          <h3 className="text-sm font-semibold text-[#16273A] dark:text-white">Invite Employee via Google Email</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full Name *"
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@gmail.com (Google Email) *"
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <input
              type="tel"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              placeholder="10-Digit Mobile"
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <input
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="Designation"
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'sales_executive' | 'super_admin')}
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <option value="sales_executive">Sales Executive</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-[#737373]">
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#16273A] px-4 py-1.5 text-xs font-semibold text-white dark:bg-[#C99B56] dark:text-[#16273A]"
            >
              Send Invite
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
              <tr>
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold text-right">Active Leads</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#16273A] dark:text-white">{u.full_name}</div>
                    <div className="text-[11px] text-[#737373]">{u.designation}</div>
                  </td>
                  <td className="px-4 py-3 text-[#262626] dark:text-[#E5E5E5]">{u.email}</td>
                  <td className="px-4 py-3 font-mono-tabular text-[#525252] dark:text-[#A3A3A3]">{u.mobile || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 font-medium text-[#16273A] dark:text-white">
                      {u.role === 'super_admin' && <Shield className="h-3 w-3 text-[#C99B56]" />}
                      {u.role === 'super_admin' ? 'Super Admin' : 'Sales Executive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-semibold">{u.active_lead_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                          u.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                      >
                        {u.status}
                      </span>
                      {u.is_pending_claim && (
                        <span className="rounded px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          Pending First Sign-In
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(u);
                        setEditDraft({
                          email: u.email,
                          full_name: u.full_name,
                          mobile: u.mobile,
                          designation: u.designation,
                          role: u.role,
                        });
                      }}
                      className="text-[#C99B56] font-medium hover:underline"
                    >
                      Edit
                    </button>
                    {u.id !== currentUser.id && u.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeactivateUser(u);
                          const firstOther = activeSalesExecs.find((x) => x.id !== u.id);
                          setReassignTargetId(firstOther ? String(firstOther.id) : '');
                        }}
                        className="text-red-600 hover:underline"
                      >
                        Deactivate
                      </button>
                    )}
                    {u.status === 'inactive' && (
                      <button
                        type="button"
                        onClick={() => handleReactivate(u)}
                        className="text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && editDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 space-y-3 dark:border-[#1E3349] dark:bg-[#121E2C]"
          >
            <h3 className="text-base font-semibold text-[#16273A] dark:text-white">Edit Employee: {editingUser.full_name}</h3>
            <input
              type="text"
              required
              value={editDraft.full_name}
              onChange={(e) => setEditDraft({ ...editDraft, full_name: e.target.value })}
              placeholder="Full Name"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <input
              type="email"
              required
              value={editDraft.email}
              onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
              placeholder="Login Email (changes logged)"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <input
              type="tel"
              maxLength={10}
              value={editDraft.mobile}
              onChange={(e) => setEditDraft({ ...editDraft, mobile: e.target.value.replace(/\D/g, '') })}
              placeholder="Mobile"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <input
              type="text"
              value={editDraft.designation}
              onChange={(e) => setEditDraft({ ...editDraft, designation: e.target.value })}
              placeholder="Designation"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
            <select
              value={editDraft.role}
              onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value as 'sales_executive' | 'super_admin' })}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            >
              <option value="sales_executive">Sales Executive</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingUser(null)} className="px-3 py-1.5 text-xs">
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#16273A] px-4 py-1.5 text-xs font-semibold text-white dark:bg-[#C99B56] dark:text-[#16273A]"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}


      {/* Deactivate Modal */}
      {deactivateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleDeactivate}
            className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 space-y-3 dark:border-[#1E3349] dark:bg-[#121E2C]"
          >
            <h3 className="text-base font-semibold text-[#16273A] dark:text-white flex items-center gap-2">
              <UserMinus className="h-4 w-4 text-red-600" /> Deactivate {deactivateUser.full_name}
            </h3>
            {(deactivateUser.active_lead_count || 0) > 0 &&
            activeSalesExecs.filter((x) => x.id !== deactivateUser.id).length > 0 ? (
              <div>
                <p className="text-xs text-[#525252] dark:text-[#A3A3A3] mb-2">
                  This employee currently owns <strong>{deactivateUser.active_lead_count}</strong> active lead(s). Select an active Sales Executive to receive all active leads and pending activities:
                </p>
                <select
                  required
                  value={reassignTargetId}
                  onChange={(e) => setReassignTargetId(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  {activeSalesExecs
                    .filter((x) => x.id !== deactivateUser.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.full_name} ({x.designation})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-[#525252] dark:text-[#A3A3A3]">
                Inactive employees cannot log in. Historical leads and activities remain preserved.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDeactivateUser(null)} className="px-3 py-1.5 text-xs">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-red-700 px-4 py-1.5 text-xs font-semibold text-white">
                Confirm Deactivation
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// ===================== DELETED LEADS (PRD 19.3) =====================

export const DeletedLeadsView: React.FC<{
  onOpenLead: (id: string) => void;
  onRestored: () => void;
}> = ({ onOpenLead, onRestored }) => {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ leads: LeadRecord[] }>('/api/leads?deleted=true&all=true');
      setLeads(res.leads);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (id: string) => {
    await apiFetch(`/api/leads/${id}/restore`, { method: 'POST' });
    await load();
    onRestored();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">Deleted Leads</h1>
        <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
          Soft-deleted leads excluded from normal pipelines and dashboards. Sequential SSM IDs are never reused.
        </p>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
              <tr>
                <th className="px-4 py-3 font-semibold">Lead ID</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Deleted By</th>
                <th className="px-4 py-3 font-semibold">Deleted Date</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#737373]">
                    Loading deleted leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#737373]">
                    No deleted leads.
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-mono-tabular font-semibold text-[#C99B56]">
                      <button type="button" onClick={() => onOpenLead(l.id)} className="hover:underline">
                        {l.lead_code}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-[#16273A] dark:text-white">{l.customer_name}</td>
                    <td className="px-4 py-3 font-mono-tabular">{l.mobile}</td>
                    <td className="px-4 py-3">{l.stage}</td>
                    <td className="px-4 py-3 text-[#737373]">{l.deleted_by_name || '—'}</td>
                    <td className="px-4 py-3 font-mono-tabular text-[#737373]">{formatDateOnly(l.deleted_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRestore(l.id)}
                        className="inline-flex items-center gap-1 rounded border border-[#C99B56] px-2.5 py-1 text-xs font-semibold text-[#C99B56] hover:bg-[#C99B56]/10"
                      >
                        <RotateCcw className="h-3 w-3" /> Restore
                      </button>
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

// ===================== AUDIT TRAIL, EXPORT LOGS & LOGIN HISTORY (PRD 15, 19.4, 20) =====================

export const AuditLogsView: React.FC<{ user: UserProfile; onOpenLead: (id: string) => void }> = ({
  user,
  onOpenLead,
}) => {
  const isAdmin = user.role === 'super_admin';
  const [tab, setTab] = useState<'audit' | 'exports' | 'logins'>('audit');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [exportLogs, setExportLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loginHistory, setLoginHistory] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    apiFetch<{ logs: AuditLogEntry[] }>('/api/audit-logs').then((r) => setAuditLogs(r.logs));
    if (isAdmin) {
      apiFetch<{ logs: Array<Record<string, unknown>> }>('/api/export-logs').then((r) => setExportLogs(r.logs));
      apiFetch<{ history: Array<Record<string, unknown>> }>('/api/login-history').then((r) => setLoginHistory(r.history));
    }
  }, [isAdmin]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">Audit History &amp; System Logs</h1>
        <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
          Immutable field-level audit trail {isAdmin ? ', export activity log, and login/logout history' : 'for your assigned leads'}
        </p>
      </div>

      {isAdmin && (
        <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-white p-0.5 dark:border-[#1E3349] dark:bg-[#121E2C]">
          {[
            { key: 'audit', label: 'Immutable Audit Trail' },
            { key: 'exports', label: 'Export Activity Log' },
            { key: 'logins', label: 'Login / Logout History' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as typeof tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                tab === t.key
                  ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                  : 'text-[#525252] dark:text-[#A3A3A3]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden dark:border-[#1E3349] dark:bg-[#121E2C]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Timestamp</th>
                  <th className="px-4 py-2.5 font-semibold">Lead / Entity</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Field</th>
                  <th className="px-4 py-2.5 font-semibold">Previous → New</th>
                  <th className="px-4 py-2.5 font-semibold">Employee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                {auditLogs.map((al) => (
                  <tr key={al.id}>
                    <td className="px-4 py-2.5 font-mono-tabular text-[11px] text-[#737373] whitespace-nowrap">
                      {formatDateTime(al.created_at)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {al.lead_id && al.lead_code ? (
                        <button
                          type="button"
                          onClick={() => onOpenLead(al.lead_id!)}
                          className="font-mono-tabular font-semibold text-[#C99B56] hover:underline"
                        >
                          {al.lead_code}
                        </button>
                      ) : (
                        <span className="text-[#737373]">{al.entity_type}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[#16273A] dark:text-white">{al.action_type}</td>
                    <td className="px-4 py-2.5 text-[#525252] dark:text-[#A3A3A3]">{al.field_name || '—'}</td>
                    <td className="px-4 py-2.5 text-[#262626] dark:text-[#E5E5E5] max-w-md">
                      <div>
                        {al.previous_value || '—'} → {al.new_value || '—'}
                      </div>
                      {al.remarks && <div className="text-[11px] text-[#737373]">Remarks: {al.remarks}</div>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{al.employee_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'exports' && isAdmin && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden dark:border-[#1E3349] dark:bg-[#121E2C]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Timestamp</th>
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 font-semibold">Format</th>
                <th className="px-4 py-2.5 font-semibold">Export Type</th>
                <th className="px-4 py-2.5 font-semibold text-right">Records</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
              {exportLogs.map((el) => (
                <tr key={String(el.id)}>
                  <td className="px-4 py-2.5 font-mono-tabular text-[#737373]">{formatDateTime(String(el.created_at))}</td>
                  <td className="px-4 py-2.5 font-medium">{String(el.employee_name || '')}</td>
                  <td className="px-4 py-2.5 uppercase font-mono-tabular">{String(el.format)}</td>
                  <td className="px-4 py-2.5">{String(el.export_mode)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{Number(el.record_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'logins' && isAdmin && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden dark:border-[#1E3349] dark:bg-[#121E2C]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] dark:bg-[#0F1926] dark:border-[#1E3349]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Timestamp</th>
                <th className="px-4 py-2.5 font-semibold">User / Email</th>
                <th className="px-4 py-2.5 font-semibold">Event</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
              {loginHistory.map((lh) => (
                <tr key={String(lh.id)}>
                  <td className="px-4 py-2.5 font-mono-tabular text-[#737373]">{formatDateTime(String(lh.created_at))}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[#16273A] dark:text-white">{String(lh.employee_name || lh.email)}</div>
                    <div className="text-[11px] text-[#737373]">{String(lh.email)}</div>
                  </td>
                  <td className="px-4 py-2.5 capitalize">{String(lh.event_type).replace('_', ' ')}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        lh.status === 'success'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                      }`}
                    >
                      {String(lh.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[#525252] dark:text-[#A3A3A3]">{String(lh.reason || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ===================== PROFILE & COMPANY SETTINGS (PRD 18, 20, 21) =====================

export const ProfileSettingsView: React.FC<{
  user: UserProfile;
  settings: CompanySettings;
  onUserUpdated: (u: UserProfile) => void;
  onSettingsUpdated: (s: CompanySettings) => void;
}> = ({ user, settings, onUserUpdated, onSettingsUpdated }) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [mobile, setMobile] = useState(user.mobile);
  const [photo, setPhoto] = useState<string | null>(user.profile_photo);

  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: fullName, mobile, profile_photo: photo }),
      });
      onUserUpdated(res.user);
      setMsg('Profile updated.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await apiFetch<CompanySettings>('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify({ company_logo: String(reader.result || '') }),
        });
        onSettingsUpdated(res);
        setMsg('Company logo updated.');
      } catch (err) {
        setError((err as Error).message);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    const res = await apiFetch<CompanySettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ company_logo: null }),
    });
    onSettingsUpdated(res);
    setMsg('Company logo removed; fallback app name active.');
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white">Profile &amp; Settings</h1>
        <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
          Manage your employee profile, Google sign-in security, and {user.role === 'super_admin' ? 'company branding' : 'display preferences'}.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3.5 dark:border-[#1E3349] dark:bg-[#121E2C]"
        >
          <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">My Profile</h2>
          <div className="flex items-center gap-3">
            {photo ? (
              <img
                src={photo}
                alt={user.full_name}
                referrerPolicy="no-referrer"
                className="h-12 w-12 rounded-full object-cover border border-[#E2E8F0]"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-[#FBF6EE] flex items-center justify-center text-sm font-bold text-[#16273A]">
                {user.full_name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-white">
              <Upload className="h-3.5 w-3.5" /> Change Photo
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#737373] mb-1">Login Email (Read-only)</label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs text-[#737373] dark:border-[#1E3349] dark:bg-[#0C141E]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">10-Digit Mobile</label>
            <input
              type="tel"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#16273A] px-4 py-2 text-xs font-semibold text-white dark:bg-[#C99B56] dark:text-[#16273A]"
          >
            Save Profile
          </button>
        </form>

        <div className="space-y-5">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-2.5 dark:border-[#1E3349] dark:bg-[#121E2C]">
            <h2 className="text-sm font-semibold text-[#16273A] dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#C99B56]" /> Google Authentication
            </h2>
            <p className="text-xs text-[#525252] dark:text-[#A3A3A3]">
              Signed in with verified Google account{' '}
              <span className="font-semibold text-[#16273A] dark:text-white">{user.email}</span>.
            </p>
            <p className="text-[11px] text-[#737373] dark:text-[#A3A3A3]">
              Password and 2-step verification are managed through your Google Account. Sessions also enforce a 30-minute inactivity lock.
            </p>
          </div>

          {user.role === 'super_admin' && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3 dark:border-[#1E3349] dark:bg-[#121E2C]">
              <h2 className="text-sm font-semibold text-[#16273A] dark:text-white">Company Branding Logo</h2>
              <p className="text-xs text-[#737373]">
                Displayed on Login screen and application header. Falls back to SSM CRM monogram if removed.
              </p>
              <div className="flex items-center gap-3">
                <div className="h-12 w-16 rounded-lg bg-white p-1 border border-[#E2E8F0] dark:border-[#1E3349] flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={(settings.company_logo || './assets/aistudio/image_b871e6e7.png').replace(/^\/assets\//, './assets/')}
                    alt="Current Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#16273A] px-3.5 py-2 text-xs font-semibold text-white cursor-pointer hover:bg-[#20364F] dark:bg-[#C99B56] dark:text-[#16273A]">
                  <Upload className="h-3.5 w-3.5" /> Change Logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {settings.company_logo && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Reset Default
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
