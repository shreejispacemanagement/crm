import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {
  ActivityRecord,
  AuditLogEntry,
  CommunicationRecord,
  CompanySettings,
  DatePreset,
  DuplicateMatch,
  ImportBatchRecord,
  ImportPreviewRow,
  LeadRecord,
  MasterCategory,
  MasterItem,
  NotificationItem,
  TimelineEvent,
  UserProfile,
} from '../types.ts';
import { mapSettingsDoc, mapUserDoc, tsToIso } from './crmAuth.ts';
import { ensureDefaultMastersSeeded } from './crmSeed.ts';
import { buildSpreadsheetBlob, generateImportTemplateBlob, parseSpreadsheetBase64Client } from './excelClient.ts';
import { OperationType, auth, db, handleFirestoreError } from './firebase.ts';

function uidGen(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidIndianMobile(val: string): boolean {
  return /^[6-9][0-9]{9}$/.test(val.trim());
}

function toFiniteNumberOrNull(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function resolveDateRange(
  preset: DatePreset | string,
  customStart?: string,
  customEnd?: string
): { start: string | null; end: string | null } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case 'today':
      return { start: startOfDay(now).toISOString(), end: endOfDay(now).toISOString() };
    case 'yesterday': {
      const y = new Date(now.getTime() - 86400000);
      return { start: startOfDay(y).toISOString(), end: endOfDay(y).toISOString() };
    }
    case 'last_7_days': {
      const s = new Date(now.getTime() - 6 * 86400000);
      return { start: startOfDay(s).toISOString(), end: endOfDay(now).toISOString() };
    }
    case 'last_30_days': {
      const s = new Date(now.getTime() - 29 * 86400000);
      return { start: startOfDay(s).toISOString(), end: endOfDay(now).toISOString() };
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(s).toISOString(), end: endOfDay(now).toISOString() };
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(s).toISOString(), end: endOfDay(e).toISOString() };
    }
    case 'custom':
      return {
        start: customStart ? new Date(`${customStart}T00:00:00`).toISOString() : null,
        end: customEnd ? new Date(`${customEnd}T23:59:59.999`).toISOString() : null,
      };
    case 'all_time':
    default:
      return { start: null, end: null };
  }
}

function mapMasterDoc(id: string, data: Record<string, unknown>): MasterItem {
  return {
    id,
    category: String(data.category) as MasterCategory,
    name: String(data.name || ''),
    parent_value: data.parent_value ? String(data.parent_value) : null,
    sort_order: Number(data.sort_order || 0),
    is_active: data.is_active === false ? 0 : 1,
    is_terminal: data.is_terminal === true ? 1 : 0,
    terminal_outcome: data.terminal_outcome === 'won' || data.terminal_outcome === 'lost' ? data.terminal_outcome : null,
    system_key: data.system_key ? String(data.system_key) : null,
    created_at: tsToIso(data.createdAt),
    updated_at: tsToIso(data.updatedAt),
  };
}

function mapLeadDoc(id: string, data: Record<string, unknown>): LeadRecord {
  const lastIntStr = String(data.last_qualifying_interaction_at || tsToIso(data.createdAt));
  const lastIntMs = new Date(lastIntStr).getTime() || Date.now();
  const inactiveDays = Math.max(0, Math.floor((Date.now() - lastIntMs) / 86400000));
  const createdIso = data.created_date_iso ? String(data.created_date_iso) : tsToIso(data.createdAt);

  return {
    id,
    lead_code: String(data.lead_code || ''),
    customer_name: String(data.customer_name || ''),
    mobile: String(data.mobile || ''),
    alternate_mobile: data.alternate_mobile ? String(data.alternate_mobile) : null,
    whatsapp: data.whatsapp ? String(data.whatsapp) : null,
    email: data.email ? String(data.email) : null,
    company_name: data.company_name ? String(data.company_name) : null,
    customer_remarks: data.customer_remarks ? String(data.customer_remarks) : null,
    lead_source: String(data.lead_source || ''),
    property_type: String(data.property_type || ''),
    property_subtype: String(data.property_subtype || ''),
    transaction_type: String(data.transaction_type || ''),
    localities: Array.isArray(data.localities) ? (data.localities as string[]) : [],
    budget_from: data.budget_from !== null && data.budget_from !== undefined ? Number(data.budget_from) : null,
    budget_to: data.budget_to !== null && data.budget_to !== undefined ? Number(data.budget_to) : null,
    min_area: data.min_area !== null && data.min_area !== undefined ? Number(data.min_area) : null,
    max_area: data.max_area !== null && data.max_area !== undefined ? Number(data.max_area) : null,
    area_unit: data.area_unit ? String(data.area_unit) : null,
    bhk_config: data.bhk_config ? String(data.bhk_config) : null,
    commercial_config: data.commercial_config ? String(data.commercial_config) : null,
    furnishing_type: data.furnishing_type ? String(data.furnishing_type) : null,
    preferred_floor: data.preferred_floor ? String(data.preferred_floor) : null,
    possession_pref: data.possession_pref ? String(data.possession_pref) : null,
    required_workstations:
      data.required_workstations !== null && data.required_workstations !== undefined ? Number(data.required_workstations) : null,
    required_cabins: data.required_cabins !== null && data.required_cabins !== undefined ? Number(data.required_cabins) : null,
    requirement_remarks: data.requirement_remarks ? String(data.requirement_remarks) : null,
    stage: String(data.stage || 'New Lead'),
    is_terminal_stage: Boolean(data.is_terminal_stage),
    created_by: String(data.created_by || ''),
    created_by_name: data.created_by_name ? String(data.created_by_name) : undefined,
    assigned_to: String(data.assigned_to || ''),
    assigned_to_uid: data.assigned_to_uid ? String(data.assigned_to_uid) : null,
    assigned_to_email: data.assigned_to_email ? String(data.assigned_to_email) : undefined,
    assigned_to_name: data.assigned_to_name ? String(data.assigned_to_name) : undefined,
    is_deleted: data.is_deleted === true ? 1 : 0,
    deleted_at: data.deleted_at ? String(data.deleted_at) : null,
    deleted_by: data.deleted_by ? String(data.deleted_by) : null,
    deleted_by_name: data.deleted_by_name ? String(data.deleted_by_name) : null,
    is_inactive: data.is_inactive === true ? 1 : 0,
    inactive_since: data.inactive_since ? String(data.inactive_since) : null,
    last_qualifying_interaction_at: lastIntStr,
    last_interaction_type: data.last_interaction_type ? String(data.last_interaction_type) : null,
    last_interaction_remarks: data.last_interaction_remarks ? String(data.last_interaction_remarks) : null,
    inactive_days: inactiveDays,
    booking_date: data.booking_date ? String(data.booking_date) : null,
    booking_project_name: data.booking_project_name ? String(data.booking_project_name) : null,
    final_transaction_amount:
      data.final_transaction_amount !== null && data.final_transaction_amount !== undefined
        ? Number(data.final_transaction_amount)
        : null,
    brokerage_amount:
      data.brokerage_amount !== null && data.brokerage_amount !== undefined ? Number(data.brokerage_amount) : null,
    brokerage_percentage:
      data.brokerage_percentage !== null && data.brokerage_percentage !== undefined ? Number(data.brokerage_percentage) : null,
    payment_status: (data.payment_status as LeadRecord['payment_status']) || null,
    booking_remarks: data.booking_remarks ? String(data.booking_remarks) : null,
    dead_reason: data.dead_reason ? String(data.dead_reason) : null,
    dead_remarks: data.dead_remarks ? String(data.dead_remarks) : null,
    dead_by: data.dead_by ? String(data.dead_by) : null,
    dead_by_name: data.dead_by_name ? String(data.dead_by_name) : null,
    dead_at: data.dead_at ? String(data.dead_at) : null,
    import_batch_ref: data.import_batch_ref ? String(data.import_batch_ref) : null,
    created_at: createdIso,
    updated_at: tsToIso(data.updatedAt),
  };
}

function mapActivityDoc(id: string, data: Record<string, unknown>): ActivityRecord {
  const scheduledAt = String(data.scheduled_at || '');
  const nowIso = new Date().toISOString();
  const status = (data.status as ActivityRecord['status']) || 'Pending';
  return {
    id,
    lead_id: String(data.lead_id || ''),
    lead_code: data.lead_code ? String(data.lead_code) : undefined,
    customer_name: data.customer_name ? String(data.customer_name) : undefined,
    customer_mobile: data.customer_mobile ? String(data.customer_mobile) : undefined,
    lead_stage: data.lead_stage ? String(data.lead_stage) : undefined,
    activity_type: String(data.activity_type || 'Follow-up Call') as ActivityRecord['activity_type'],
    scheduled_date: String(data.scheduled_date || ''),
    scheduled_time: String(data.scheduled_time || ''),
    scheduled_at: scheduledAt,
    assigned_to: String(data.assigned_to || ''),
    assigned_to_uid: data.assigned_to_uid ? String(data.assigned_to_uid) : null,
    assigned_to_email: data.assigned_to_email ? String(data.assigned_to_email) : undefined,
    assigned_to_name: data.assigned_to_name ? String(data.assigned_to_name) : undefined,
    description: data.description ? String(data.description) : null,
    status,
    is_overdue: status === 'Pending' && scheduledAt < nowIso,
    completed_by: data.completed_by ? String(data.completed_by) : null,
    completed_by_name: data.completed_by_name ? String(data.completed_by_name) : null,
    completed_at: data.completed_at ? String(data.completed_at) : null,
    completion_remarks: data.completion_remarks ? String(data.completion_remarks) : null,
    cancelled_by: data.cancelled_by ? String(data.cancelled_by) : null,
    cancelled_by_name: data.cancelled_by_name ? String(data.cancelled_by_name) : null,
    cancelled_at: data.cancelled_at ? String(data.cancelled_at) : null,
    cancel_reason: data.cancel_reason ? String(data.cancel_reason) : null,
    reschedule_count: Number(data.reschedule_count || 0),
    previous_schedule_json: Array.isArray(data.previous_schedule_history)
      ? JSON.stringify(data.previous_schedule_history)
      : null,
    created_by: String(data.created_by || ''),
    created_by_name: data.created_by_name ? String(data.created_by_name) : undefined,
    created_at: tsToIso(data.createdAt),
    updated_at: tsToIso(data.updatedAt),
  };
}

// ==================== CORE READERS ====================

export async function fetchWorkspaceSettings(): Promise<CompanySettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'workspace'));
    return mapSettingsDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'settings/workspace');
  }
}

const MASTER_CATEGORY_LIST = [
  'lead_source',
  'lead_stage',
  'property_type',
  'property_subtype',
  'transaction_type',
  'locality',
  'bhk_config',
  'dead_reason',
  'furnishing_type',
  'possession_pref',
];

export async function fetchMasters(): Promise<MasterItem[]> {
  try {
    const snap = await getDocs(query(collection(db, 'masters'), where('category', 'in', MASTER_CATEGORY_LIST)));
    return snap.docs
      .map((d) => mapMasterDoc(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'masters');
  }
}

export async function fetchTeamMembers(currentUser: UserProfile, activeLeads?: LeadRecord[]): Promise<UserProfile[]> {
  if (currentUser.role !== 'super_admin') {
    try {
      const dirSnap = await getDocs(
        query(collection(db, 'employeeDirectory'), where('status', 'in', ['active', 'inactive']))
      );
      return dirSnap.docs
        .map((d) => {
          const r = d.data() as Record<string, unknown>;
          return {
            id: String(r.id || d.id),
            uid: r.uid ? String(r.uid) : null,
            email: String(r.email_key || ''),
            full_name: String(r.full_name || ''),
            mobile: '',
            designation: String(r.designation || 'Property Consultant'),
            role: (r.role === 'super_admin' ? 'super_admin' : 'sales_executive') as UserProfile['role'],
            status: (r.status === 'inactive' ? 'inactive' : 'active') as UserProfile['status'],
            profile_photo: null,
            theme_preference: 'light' as const,
            lead_view_preference: 'table' as const,
            page_size_preference: 25,
            table_columns_preference: null,
            created_at: tsToIso(r.createdAt),
            updated_at: tsToIso(r.updatedAt),
          };
        })
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'employeeDirectory');
    }
  }

  try {
    const [uSnap, iSnap, leadsList] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'employeeInvites')),
      activeLeads ? Promise.resolve(activeLeads) : fetchAuthorizedLeads(currentUser, { deleted: true }),
    ]);

    const nonDeletedLeads = leadsList.filter((l) => l.is_deleted === 0);
    const activeLeadCounts = new Map<string, number>();
    for (const l of nonDeletedLeads) {
      if (l.stage !== 'Booking Done' && l.stage !== 'Dead') {
        const key = (l.assigned_to_email || '').toLowerCase();
        activeLeadCounts.set(key, (activeLeadCounts.get(key) || 0) + 1);
      }
    }

    const usersByEmail = new Map<string, UserProfile>();
    for (const d of uSnap.docs) {
      const p = mapUserDoc(d.id, d.data() as Record<string, unknown>);
      p.active_lead_count = activeLeadCounts.get(p.email.toLowerCase()) || 0;
      usersByEmail.set(p.email.toLowerCase(), p);
    }

    const result: UserProfile[] = Array.from(usersByEmail.values());
    for (const d of iSnap.docs) {
      const r = d.data() as Record<string, unknown>;
      const email = String(r.email || '').toLowerCase();
      if (usersByEmail.has(email)) continue;
      result.push({
        id: d.id,
        uid: r.claimed_uid ? String(r.claimed_uid) : null,
        email,
        full_name: String(r.full_name || ''),
        mobile: String(r.mobile || ''),
        designation: String(r.designation || 'Property Consultant'),
        role: r.role === 'super_admin' ? 'super_admin' : 'sales_executive',
        status: r.status === 'inactive' ? 'inactive' : 'active',
        profile_photo: null,
        theme_preference: 'light',
        lead_view_preference: 'table',
        page_size_preference: 25,
        table_columns_preference: null,
        invite_id: d.id,
        is_pending_claim: !r.claimed_uid,
        active_lead_count: activeLeadCounts.get(email) || 0,
        created_at: tsToIso(r.createdAt),
        updated_at: tsToIso(r.updatedAt),
      });
    }

    return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function fetchAuthorizedLeads(
  user: UserProfile,
  opts?: { deleted?: boolean }
): Promise<LeadRecord[]> {
  try {
    let snap;
    if (user.role === 'super_admin') {
      snap = await getDocs(collection(db, 'leads'));
      let maxSeq = 0;
      for (const d of snap.docs) {
        const seqFromId = extractLeadSeq(d.id);
        const seqFromCode = extractLeadSeq(String(d.data().lead_code || ''));
        if (seqFromId > maxSeq) maxSeq = seqFromId;
        if (seqFromCode > maxSeq) maxSeq = seqFromCode;
      }
      if (maxSeq > 0) {
        void syncWorkspaceLeadSeqFloor(maxSeq);
      }
    } else {
      const q = query(
        collection(db, 'leads'),
        where('assigned_to_email', '==', user.email.toLowerCase()),
        where('is_deleted', '==', false)
      );
      snap = await getDocs(q);
    }
    const all = snap.docs.map((d) => mapLeadDoc(d.id, d.data() as Record<string, unknown>));
    if (opts?.deleted) return all;
    return all.filter((l) => l.is_deleted === 0);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'leads');
  }
}

export async function fetchAuthorizedActivities(user: UserProfile): Promise<ActivityRecord[]> {
  try {
    let snap;
    if (user.role === 'super_admin') {
      snap = await getDocs(collection(db, 'activities'));
    } else {
      const q = query(
        collection(db, 'activities'),
        where('assigned_to_email', '==', user.email.toLowerCase()),
        where('lead_is_deleted', '==', false)
      );
      snap = await getDocs(q);
    }
    return snap.docs
      .filter((d) => d.data().lead_is_deleted !== true)
      .map((d) => mapActivityDoc(d.id, d.data() as Record<string, unknown>));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'activities');
  }
}

export async function checkMobileDuplicates(mobile: string, excludeLeadId?: string): Promise<DuplicateMatch[]> {
  const cleanMobile = mobile.trim();
  if (!isValidIndianMobile(cleanMobile)) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'mobileLookup', cleanMobile, 'matches'), where('mobile', '==', cleanMobile))
    );
    return snap.docs
      .filter((d) => d.id !== excludeLeadId)
      .map((d) => {
        const r = d.data() as Record<string, unknown>;
        return {
          id: String(r.lead_id || d.id),
          lead_code: String(r.lead_code || ''),
          customer_name: String(r.customer_name || ''),
          mobile: String(r.mobile || mobile),
          requirement_summary: String(r.requirement_summary || ''),
          stage: String(r.stage || ''),
          assigned_to: r.assigned_to ? String(r.assigned_to) : null,
          assigned_to_name: String(r.assigned_to_name || 'Unassigned'),
          is_deleted: r.is_deleted === true ? 1 : 0,
          created_at: tsToIso(r.createdAt),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `mobileLookup/${mobile}/matches`);
  }
}

// ==================== NOTIFICATIONS, TIMELINE & AUDIT ====================

async function writeTimeline(
  leadId: string,
  eventType: string,
  description: string,
  user: UserProfile
): Promise<void> {
  const id = uidGen('tl');
  const actorUid = auth.currentUser?.uid || user.uid || user.id;
  const actorName = (user.full_name || user.email || 'User').trim().slice(0, 120);
  try {
    await setDoc(doc(db, 'leads', leadId, 'timeline', id), {
      id,
      lead_id: leadId,
      event_type: eventType.slice(0, 100),
      description: description.slice(0, 2000),
      employee_id: actorUid,
      employee_name: actorName,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `leads/${leadId}/timeline/${id}`);
  }
}

async function writeAudit(params: {
  entityType: string;
  entityId: string;
  leadId?: string | null;
  leadCode?: string | null;
  leadAssignedToEmail?: string | null;
  actionType: string;
  fieldName?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  remarks?: string | null;
  user: UserProfile;
}): Promise<void> {
  const id = uidGen('audit');
  const actorUid = auth.currentUser?.uid || params.user.uid || params.user.id;
  const actorName = (params.user.full_name || params.user.email || 'User').trim().slice(0, 120);
  try {
    await setDoc(doc(db, 'auditLogs', id), {
      id,
      entity_type: params.entityType.slice(0, 60),
      entity_id: params.entityId.slice(0, 128),
      lead_id: params.leadId || null,
      lead_code: params.leadCode || null,
      lead_assigned_to_email: params.leadAssignedToEmail || null,
      action_type: params.actionType.slice(0, 80),
      field_name: params.fieldName ? params.fieldName.slice(0, 80) : null,
      previous_value: params.previousValue !== undefined && params.previousValue !== null ? String(params.previousValue).slice(0, 2000) : null,
      new_value: params.newValue !== undefined && params.newValue !== null ? String(params.newValue).slice(0, 2000) : null,
      remarks: params.remarks ? params.remarks.slice(0, 2000) : null,
      employee_id: actorUid,
      employee_name: actorName,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `auditLogs/${id}`);
  }
}

async function createNotificationDoc(params: {
  userUid?: string | null;
  userEmail: string;
  leadId?: string | null;
  leadCode?: string | null;
  activityId?: string | null;
  notifType: string;
  title: string;
  message: string;
}): Promise<void> {
  const id = uidGen('notif');
  try {
    await setDoc(doc(db, 'notifications', id), {
      id,
      user_uid: params.userUid || null,
      user_email: params.userEmail.toLowerCase(),
      lead_id: params.leadId || null,
      lead_code: params.leadCode || null,
      activity_id: params.activityId || null,
      notif_type: params.notifType.slice(0, 80),
      title: params.title.slice(0, 200),
      message: params.message.slice(0, 1000),
      is_read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`);
  }
}

async function notifySuperAdmins(
  team: UserProfile[],
  params: { leadId?: string | null; leadCode?: string | null; notifType: string; title: string; message: string }
): Promise<void> {
  const admins = team.filter((u) => u.role === 'super_admin' && u.status === 'active');
  for (const adm of admins) {
    await createNotificationDoc({
      userUid: adm.uid || adm.id,
      userEmail: adm.email,
      leadId: params.leadId,
      leadCode: params.leadCode,
      notifType: params.notifType,
      title: params.title,
      message: params.message,
    });
  }
}

async function syncMobileLookup(lead: {
  id: string;
  lead_code: string;
  mobile: string;
  customer_name: string;
  property_subtype: string;
  transaction_type: string;
  stage: string;
  assigned_to: string;
  assigned_to_name: string;
  is_deleted: boolean;
  isNew?: boolean;
}): Promise<void> {
  const ref = doc(db, 'mobileLookup', lead.mobile, 'matches', lead.id);
  const payload: Record<string, unknown> = {
    lead_id: lead.id,
    lead_code: lead.lead_code,
    mobile: lead.mobile,
    customer_name: lead.customer_name.slice(0, 150),
    requirement_summary: `${lead.property_subtype} · ${lead.transaction_type}`.slice(0, 250),
    stage: lead.stage,
    assigned_to: lead.assigned_to,
    assigned_to_name: lead.assigned_to_name,
    is_deleted: lead.is_deleted,
    updatedAt: serverTimestamp(),
  };
  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    } else {
      await setDoc(ref, { ...payload, createdAt: existing.data().createdAt || serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `mobileLookup/${lead.mobile}/matches/${lead.id}`);
  }
}

function extractLeadSeq(val: string): number {
  const m = /^SSM[_-](\d+)$/i.exec(val.trim());
  return m ? Number(m[1]) || 0 : 0;
}

let lastSyncedWorkspaceLeadSeq = -1;
async function syncWorkspaceLeadSeqFloor(maxExistingSeq: number): Promise<void> {
  if (maxExistingSeq <= lastSyncedWorkspaceLeadSeq) return;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'settings', 'workspace');
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const current = Number(snap.data().lead_seq || 0);
      if (maxExistingSeq > current) {
        tx.update(ref, { lead_seq: maxExistingSeq, updatedAt: serverTimestamp() });
      }
      lastSyncedWorkspaceLeadSeq = Math.max(current, maxExistingSeq);
    });
  } catch {
    // non-fatal sync
  }
}

async function allocateLeadCodes(count: number, user: UserProfile): Promise<string[]> {
  let maxSeq = 0;
  try {
    const snap = await getDocs(collection(db, 'leads'));
    for (const d of snap.docs) {
      const seqId = extractLeadSeq(d.id);
      const seqCode = extractLeadSeq(String(d.data().lead_code || ''));
      if (seqId > maxSeq) maxSeq = seqId;
      if (seqCode > maxSeq) maxSeq = seqCode;
    }
  } catch {
    // ignore
  }

  try {
    return await runTransaction(db, async (tx) => {
      const ref = doc(db, 'settings', 'workspace');
      const snap = await tx.get(ref);
      const current = snap.exists() ? Number(snap.data().lead_seq || 0) : 0;
      const base = Math.max(current, maxSeq);
      const nextSeq = base + count;

      if (!snap.exists()) {
        tx.set(ref, {
          company_name: 'Shreeji Space Management CRM',
          short_name: 'Shreeji Space',
          company_logo: './assets/aistudio/image_b871e6e7.png',
          default_table_columns: [
            'lead_code',
            'customer_name',
            'mobile',
            'requirement',
            'localities',
            'budget',
            'stage',
            'assigned_to',
            'created_at',
          ],
          lead_seq: nextSeq,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(ref, { lead_seq: nextSeq, updatedAt: serverTimestamp() });
      }

      const codes: string[] = [];
      for (let i = 1; i <= count; i++) {
        codes.push(`SSM-${String(base + i).padStart(6, '0')}`);
      }
      return codes;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/workspace');
  }
}

async function maybeAutoSyncStage(
  leadId: string,
  activityType: string,
  trigger: 'scheduled' | 'completed',
  user: UserProfile,
  masters: MasterItem[]
): Promise<void> {
  const stageMap: Record<string, string> = {
    'Site Visit:scheduled': 'Site Visit Planned',
    'Site Visit:completed': 'Site Visit Done',
    'Meeting:scheduled': 'Meeting Planned',
    'Meeting:completed': 'Meeting Done',
  };
  const targetName = stageMap[`${activityType}:${trigger}`];
  if (!targetName) return;

  try {
    const snap = await getDoc(doc(db, 'leads', leadId));
    if (!snap.exists()) return;
    const lead = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);
    if (lead.is_deleted === 1) return;

    const stages = masters.filter((m) => m.category === 'lead_stage');
    const curStage = stages.find((s) => s.name === lead.stage);
    const targetStage = stages.find((s) => s.name === targetName);
    if (!targetStage || targetStage.is_active === 0) return;
    if (curStage?.is_terminal === 1) return;
    if (curStage && curStage.sort_order >= targetStage.sort_order) return;

    await updateDoc(doc(db, 'leads', leadId), {
      stage: targetStage.name,
      is_terminal_stage: false,
      updatedAt: serverTimestamp(),
    });
    await syncMobileLookup({
      id: lead.id,
      lead_code: lead.lead_code,
      mobile: lead.mobile,
      customer_name: lead.customer_name,
      property_subtype: lead.property_subtype,
      transaction_type: lead.transaction_type,
      stage: targetStage.name,
      assigned_to: lead.assigned_to,
      assigned_to_name: lead.assigned_to_name || 'Assigned',
      is_deleted: false,
    });
    await writeTimeline(
      leadId,
      'Auto Stage Sync',
      `Stage automatically moved from "${lead.stage}" to "${targetStage.name}" (${activityType} ${trigger}).`,
      user
    );
    await writeAudit({
      entityType: 'lead',
      entityId: leadId,
      leadId,
      leadCode: lead.lead_code,
      leadAssignedToEmail: lead.assigned_to_email,
      actionType: 'Stage Changed',
      fieldName: 'stage',
      previousValue: lead.stage,
      newValue: targetStage.name,
      remarks: `Automatic stage sync on ${activityType} ${trigger}`,
      user,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leads/${leadId}`);
  }
}

export async function evaluateInactivityAndReminders(
  user: UserProfile,
  team: UserProfile[],
  leadsInput?: LeadRecord[],
  activitiesInput?: ActivityRecord[]
): Promise<void> {
  const leads = leadsInput || (await fetchAuthorizedLeads(user));
  const activities = activitiesInput || (await fetchAuthorizedActivities(user));
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  for (const l of leads) {
    if (l.is_deleted === 1 || l.stage === 'Booking Done' || l.stage === 'Dead' || l.is_terminal_stage) continue;
    const lastMs = new Date(l.last_qualifying_interaction_at).getTime();
    if (Number.isNaN(lastMs)) continue;
    const daysSince = Math.floor((nowMs - lastMs) / 86400000);
    if (daysSince < 15) continue;

    // Fetch raw flags to avoid duplicate notifications
    try {
      const rawSnap = await getDoc(doc(db, 'leads', l.id));
      if (!rawSnap.exists()) continue;
      const raw = rawSnap.data() as Record<string, unknown>;
      const notified15 = Boolean(raw.inactivity_notified_15);
      const escalated22 = Boolean(raw.inactivity_escalated_22);

      const updates: Record<string, unknown> = {};
      if (!raw.is_inactive) {
        updates.is_inactive = true;
        updates.inactive_since = new Date(lastMs + 15 * 86400000).toISOString();
      }
      if (!notified15) {
        updates.inactivity_notified_15 = true;
        if (l.assigned_to_email) {
          await createNotificationDoc({
            userUid: l.assigned_to_uid,
            userEmail: l.assigned_to_email,
            leadId: l.id,
            leadCode: l.lead_code,
            notifType: 'Inactivity Alert',
            title: `15+ Days Inactive: ${l.lead_code}`,
            message: `${l.customer_name} has had no qualifying interaction for ${daysSince} days.`,
          });
        }
      }
      if (daysSince >= 22 && !escalated22) {
        updates.inactivity_escalated_22 = true;
        await notifySuperAdmins(team, {
          leadId: l.id,
          leadCode: l.lead_code,
          notifType: 'Inactivity Escalation',
          title: `Escalation (22+ Days): ${l.lead_code}`,
          message: `${l.customer_name} (assigned to ${l.assigned_to_name || 'Consultant'}) has been inactive for ${daysSince} days.`,
        });
      }
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'leads', l.id), { ...updates, updatedAt: serverTimestamp() });
      }
    } catch {
      // non-fatal background sync
    }
  }

  for (const a of activities) {
    if (a.status !== 'Pending') continue;
    const schedMs = new Date(a.scheduled_at).getTime();
    if (Number.isNaN(schedMs)) continue;
    const diffMin = (schedMs - nowMs) / 60000;
    if (diffMin > 30) continue;

    try {
      const actSnap = await getDoc(doc(db, 'activities', a.id));
      if (!actSnap.exists()) continue;
      const raw = actSnap.data() as Record<string, unknown>;
      const targetEmail = String(raw.assigned_to_email || a.assigned_to_email || '');
      if (!targetEmail) continue;

      if (diffMin <= 30 && diffMin > 15 && !raw.reminded_30) {
        await updateDoc(doc(db, 'activities', a.id), { reminded_30: true, updatedAt: serverTimestamp() });
        await createNotificationDoc({
          userUid: raw.assigned_to_uid ? String(raw.assigned_to_uid) : null,
          userEmail: targetEmail,
          leadId: a.lead_id,
          leadCode: a.lead_code,
          activityId: a.id,
          notifType: 'Activity Reminder (30m)',
          title: `Upcoming ${a.activity_type} in ~30 min`,
          message: `${a.customer_name || ''} (${a.lead_code || ''}) scheduled at ${a.scheduled_time}.`,
        });
      } else if (diffMin <= 15 && diffMin >= 0 && !raw.reminded_15) {
        await updateDoc(doc(db, 'activities', a.id), { reminded_15: true, updatedAt: serverTimestamp() });
        await createNotificationDoc({
          userUid: raw.assigned_to_uid ? String(raw.assigned_to_uid) : null,
          userEmail: targetEmail,
          leadId: a.lead_id,
          leadCode: a.lead_code,
          activityId: a.id,
          notifType: 'Activity Reminder (15m)',
          title: `Due Soon: ${a.activity_type}`,
          message: `${a.customer_name || ''} (${a.lead_code || ''}) starts at ${a.scheduled_time}.`,
        });
      } else if (a.scheduled_at < nowIso && !raw.reminded_overdue) {
        await updateDoc(doc(db, 'activities', a.id), { reminded_overdue: true, updatedAt: serverTimestamp() });
        await createNotificationDoc({
          userUid: raw.assigned_to_uid ? String(raw.assigned_to_uid) : null,
          userEmail: targetEmail,
          leadId: a.lead_id,
          leadCode: a.lead_code,
          activityId: a.id,
          notifType: 'Overdue Activity',
          title: `Overdue ${a.activity_type}: ${a.lead_code || ''}`,
          message: `Scheduled for ${a.scheduled_date} ${a.scheduled_time} (${a.customer_name || ''}).`,
        });
      }
    } catch {
      // non-fatal background sync
    }
  }
}

// ==================== API-COMPATIBLE DISPATCHER ====================

export async function getFirebaseIdToken(): Promise<string> {
  const current = auth.currentUser;
  if (!current) throw new Error('Authentication required.');
  return current.getIdToken();
}

export async function callExcelEndpoint(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getFirebaseIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...options, headers });
}

function parseUrl(url: string): { path: string; params: URLSearchParams } {
  const idx = url.indexOf('?');
  if (idx === -1) return { path: url, params: new URLSearchParams() };
  return { path: url.slice(0, idx), params: new URLSearchParams(url.slice(idx + 1)) };
}

function filterAndSortLeads(leads: LeadRecord[], params: URLSearchParams, user: UserProfile): LeadRecord[] {
  const deletedMode = params.get('deleted') === 'true' && user.role === 'super_admin';
  let list = leads.filter((l) => (deletedMode ? l.is_deleted === 1 : l.is_deleted === 0));

  const assignedTo = params.get('assignedTo');
  if (user.role === 'super_admin' && assignedTo && assignedTo !== 'all') {
    list = list.filter((l) => l.assigned_to === assignedTo || l.assigned_to_uid === assignedTo);
  }

  const search = (params.get('search') || '').trim().toLowerCase();
  if (search) {
    list = list.filter(
      (l) =>
        l.lead_code.toLowerCase().includes(search) ||
        l.customer_name.toLowerCase().includes(search) ||
        l.mobile.toLowerCase().includes(search) ||
        (l.alternate_mobile || '').toLowerCase().includes(search) ||
        (l.whatsapp || '').toLowerCase().includes(search) ||
        (l.company_name || '').toLowerCase().includes(search) ||
        (l.booking_project_name || '').toLowerCase().includes(search)
    );
  }

  const stage = params.get('stage');
  if (stage && stage !== 'all') list = list.filter((l) => l.stage === stage);

  const leadSource = params.get('leadSource');
  if (leadSource && leadSource !== 'all') list = list.filter((l) => l.lead_source === leadSource);

  const propertyType = params.get('propertyType');
  if (propertyType && propertyType !== 'all') list = list.filter((l) => l.property_type === propertyType);

  const transactionType = params.get('transactionType');
  if (transactionType && transactionType !== 'all') list = list.filter((l) => l.transaction_type === transactionType);

  const locality = params.get('locality');
  if (locality && locality !== 'all') list = list.filter((l) => l.localities.includes(locality));

  if (params.get('inactiveOnly') === 'true') list = list.filter((l) => l.is_inactive === 1);

  const datePreset = params.get('datePreset');
  if (datePreset && datePreset !== 'all_time') {
    const { start, end } = resolveDateRange(
      datePreset,
      params.get('customStart') || undefined,
      params.get('customEnd') || undefined
    );
    if (start) list = list.filter((l) => l.created_at >= start);
    if (end) list = list.filter((l) => l.created_at <= end);
  }

  const sort = params.get('sort');
  if (sort === 'oldest') {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } else if (sort === 'updated') {
    list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } else {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return list;
}

function buildReportData(
  reportType: string,
  user: UserProfile,
  params: URLSearchParams,
  leadsAll: LeadRecord[],
  activitiesAll: ActivityRecord[],
  masters: MasterItem[],
  team: UserProfile[],
  importBatches: ImportBatchRecord[]
): { title: string; columns: string[]; rows: Array<Array<string | number | null>> } {
  const isExec = user.role === 'sales_executive';
  const { start, end } = resolveDateRange(
    params.get('datePreset') || 'all_time',
    params.get('customStart') || undefined,
    params.get('customEnd') || undefined
  );
  const empParam = params.get('employeeId');
  const empFilter = isExec ? user : empParam && empParam !== 'all' ? team.find((t) => t.id === empParam || t.uid === empParam) || null : null;

  const nonDeleted = leadsAll.filter((l) => l.is_deleted === 0);
  const matchEmp = (l: LeadRecord) =>
    !empFilter || l.assigned_to === empFilter.id || (l.assigned_to_email || '').toLowerCase() === empFilter.email.toLowerCase();
  const matchDate = (iso: string) => (!start || iso >= start) && (!end || iso <= end);

  const scopedLeads = nonDeleted.filter((l) => matchEmp(l) && matchDate(l.created_at));
  const stages = masters.filter((m) => m.category === 'lead_stage');

  switch (reportType) {
    case 'lead-source': {
      const grouped = new Map<string, { total: number; active: number; won: number; dead: number }>();
      for (const l of scopedLeads) {
        const cur = grouped.get(l.lead_source) || { total: 0, active: 0, won: 0, dead: 0 };
        cur.total += 1;
        if (l.stage === 'Booking Done') cur.won += 1;
        else if (l.stage === 'Dead') cur.dead += 1;
        else cur.active += 1;
        grouped.set(l.lead_source, cur);
      }
      return {
        title: 'Lead Source Report',
        columns: ['Lead Source', 'Total Leads', 'Active Leads', 'Booking Done', 'Dead Leads'],
        rows: Array.from(grouped.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .map(([src, v]) => [src, v.total, v.active, v.won, v.dead]),
      };
    }

    case 'lead-stage': {
      const grouped = new Map<string, { total: number; inactive: number }>();
      for (const l of scopedLeads) {
        const cur = grouped.get(l.stage) || { total: 0, inactive: 0 };
        cur.total += 1;
        if (l.is_inactive === 1) cur.inactive += 1;
        grouped.set(l.stage, cur);
      }
      return {
        title: 'Lead Stage Report',
        columns: ['Pipeline Stage', 'Lead Count', 'Inactive Leads'],
        rows: Array.from(grouped.entries())
          .sort((a, b) => {
            const sa = stages.find((s) => s.name === a[0])?.sort_order ?? 999;
            const sb = stages.find((s) => s.name === b[0])?.sort_order ?? 999;
            return sa - sb;
          })
          .map(([st, v]) => [st, v.total, v.inactive]),
      };
    }

    case 'employee-performance': {
      // PRD 16.1: Raw counts and INR values only — NO automatic score, NO ranking, NO conversion rate.
      const emps = empFilter ? [empFilter] : team;
      const rows = emps.map((e) => {
        const emailLower = e.email.toLowerCase();
        const assigned = nonDeleted.filter(
          (l) => (l.assigned_to === e.id || (l.assigned_to_email || '').toLowerCase() === emailLower) && matchDate(l.created_at)
        ).length;
        const created = nonDeleted.filter(
          (l) => (l.created_by === e.id || l.created_by === e.uid) && matchDate(l.created_at)
        ).length;
        const compActs = activitiesAll.filter(
          (a) =>
            a.status === 'Completed' &&
            (a.completed_by === e.id || a.completed_by === e.uid || a.completed_by_name === e.full_name) &&
            matchDate(a.completed_at || a.updated_at)
        );
        const followups = compActs.filter((a) => a.activity_type === 'Follow-up Call' || a.activity_type === 'WhatsApp Follow-up').length;
        const siteVisits = compActs.filter((a) => a.activity_type === 'Site Visit').length;
        const meetings = compActs.filter((a) => a.activity_type === 'Meeting').length;
        const wonLeads = nonDeleted.filter(
          (l) =>
            (l.assigned_to === e.id || (l.assigned_to_email || '').toLowerCase() === emailLower) &&
            l.stage === 'Booking Done' &&
            matchDate(l.created_at)
        );
        const dead = nonDeleted.filter(
          (l) =>
            (l.assigned_to === e.id || (l.assigned_to_email || '').toLowerCase() === emailLower) &&
            l.stage === 'Dead' &&
            matchDate(l.created_at)
        ).length;
        const val = wonLeads.reduce((acc, l) => acc + Number(l.final_transaction_amount || 0), 0);
        const brok = wonLeads.reduce((acc, l) => acc + Number(l.brokerage_amount || 0), 0);
        return [
          e.full_name,
          e.designation,
          assigned,
          created,
          followups,
          siteVisits,
          meetings,
          wonLeads.length,
          Math.round(val),
          Math.round(brok),
          dead,
        ];
      });
      return {
        title: 'Employee Performance Report',
        columns: [
          'Employee',
          'Designation',
          'Leads Assigned',
          'Leads Created',
          'Follow-ups Completed',
          'Site Visits Completed',
          'Meetings Completed',
          'Booking Done Count',
          'Total Booking Value (INR)',
          'Brokerage Generated (INR)',
          'Dead Leads',
        ],
        rows,
      };
    }

    case 'lead-creation':
      return {
        title: 'Lead Creation Report',
        columns: ['Lead ID', 'Customer Name', 'Mobile', 'Source', 'Requirement', 'Stage', 'Created By', 'Assigned To', 'Created Date'],
        rows: [...scopedLeads]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((l) => [
            l.lead_code,
            l.customer_name,
            l.mobile,
            l.lead_source,
            `${l.property_type} · ${l.property_subtype} (${l.transaction_type})`,
            l.stage,
            l.created_by_name || '',
            l.assigned_to_name || '',
            l.created_at.slice(0, 10),
          ]),
      };

    case 'follow-up': {
      const acts = activitiesAll
        .filter(
          (a) =>
            (a.activity_type === 'Follow-up Call' || a.activity_type === 'WhatsApp Follow-up' || a.activity_type === 'Other') &&
            (!empFilter || a.assigned_to === empFilter.id || (a.assigned_to_email || '').toLowerCase() === empFilter.email.toLowerCase()) &&
            matchDate(a.scheduled_at)
        )
        .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
      return {
        title: 'Follow-up Report',
        columns: ['Lead ID', 'Customer Name', 'Mobile', 'Activity Type', 'Scheduled Date', 'Time', 'Status', 'Employee', 'Remarks'],
        rows: acts.map((a) => [
          a.lead_code || '',
          a.customer_name || '',
          a.customer_mobile || '',
          a.activity_type,
          a.scheduled_date,
          a.scheduled_time,
          a.status,
          a.assigned_to_name || '',
          a.completion_remarks || a.description || '',
        ]),
      };
    }

    case 'site-visit': {
      const leadById = new Map(nonDeleted.map((l) => [l.id, l]));
      const acts = activitiesAll
        .filter(
          (a) =>
            a.activity_type === 'Site Visit' &&
            (!empFilter || a.assigned_to === empFilter.id || (a.assigned_to_email || '').toLowerCase() === empFilter.email.toLowerCase()) &&
            matchDate(a.scheduled_at)
        )
        .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
      return {
        title: 'Site Visit Report',
        columns: ['Lead ID', 'Customer Name', 'Mobile', 'Localities', 'Visit Date', 'Time', 'Status', 'Employee', 'Outcome / Notes'],
        rows: acts.map((a) => [
          a.lead_code || '',
          a.customer_name || '',
          a.customer_mobile || '',
          (leadById.get(a.lead_id)?.localities || []).join(', '),
          a.scheduled_date,
          a.scheduled_time,
          a.status,
          a.assigned_to_name || '',
          a.completion_remarks || a.description || '',
        ]),
      };
    }

    case 'booking': {
      const won = nonDeleted
        .filter(
          (l) =>
            l.stage === 'Booking Done' &&
            matchEmp(l) &&
            (!start || (l.booking_date || l.updated_at.slice(0, 10)) >= start.slice(0, 10)) &&
            (!end || (l.booking_date || l.updated_at.slice(0, 10)) <= end.slice(0, 10))
        )
        .sort((a, b) => (b.booking_date || '').localeCompare(a.booking_date || ''));
      return {
        title: 'Booking Report',
        columns: [
          'Lead ID',
          'Customer Name',
          'Booking Date',
          'Property / Project',
          'Transaction Amount (INR)',
          'Brokerage (INR)',
          'Brokerage %',
          'Payment Status',
          'Employee',
        ],
        rows: won.map((l) => [
          l.lead_code,
          l.customer_name,
          l.booking_date || '',
          l.booking_project_name || '',
          Number(l.final_transaction_amount || 0),
          Number(l.brokerage_amount || 0),
          Number(l.brokerage_percentage || 0),
          l.payment_status || '',
          l.assigned_to_name || '',
        ]),
      };
    }

    case 'dead-lead': {
      const dead = scopedLeads
        .filter((l) => l.stage === 'Dead')
        .sort((a, b) => (b.dead_at || b.updated_at).localeCompare(a.dead_at || a.updated_at));
      return {
        title: 'Dead Lead Report',
        columns: ['Lead ID', 'Customer Name', 'Mobile', 'Source', 'Dead Reason', 'Remarks', 'Marked By', 'Assigned To', 'Dead Date'],
        rows: dead.map((l) => [
          l.lead_code,
          l.customer_name,
          l.mobile,
          l.lead_source,
          l.dead_reason || '',
          l.dead_remarks || '',
          l.dead_by_name || '',
          l.assigned_to_name || '',
          (l.dead_at || l.updated_at).slice(0, 10),
        ]),
      };
    }

    case 'duplicate-lead': {
      const mobileCounts = new Map<string, number>();
      for (const l of leadsAll) {
        mobileCounts.set(l.mobile, (mobileCounts.get(l.mobile) || 0) + 1);
      }
      const dupes = leadsAll
        .filter((l) => (mobileCounts.get(l.mobile) || 0) > 1 && matchEmp(l) && matchDate(l.created_at))
        .sort((a, b) => a.mobile.localeCompare(b.mobile) || a.created_at.localeCompare(b.created_at));
      return {
        title: 'Duplicate Lead Report',
        columns: ['Mobile', 'Lead ID', 'Customer Name', 'Requirement', 'Stage', 'Assigned To', 'Deleted?', 'Created Date'],
        rows: dupes.map((l) => [
          l.mobile,
          l.lead_code,
          l.customer_name,
          `${l.property_subtype} (${l.transaction_type})`,
          l.stage,
          l.assigned_to_name || '',
          l.is_deleted === 1 ? 'Yes (Deleted)' : 'No',
          l.created_at.slice(0, 10),
        ]),
      };
    }

    case 'import-history': {
      if (isExec) {
        return {
          title: 'Import History Report',
          columns: ['Notice'],
          rows: [['Import History is restricted to Super Admin.']],
        };
      }
      const batches = importBatches
        .filter((b) => matchDate(b.created_at))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        title: 'Import History Report',
        columns: ['Batch Reference', 'Filename', 'Uploaded By', 'Date/Time', 'Total', 'Successful', 'Skipped', 'Failed'],
        rows: batches.map((b) => [
          b.batch_ref,
          b.filename,
          b.uploaded_by_name,
          b.created_at.slice(0, 16).replace('T', ' '),
          b.total_count,
          b.success_count,
          b.skipped_count,
          b.failed_count,
        ]),
      };
    }

    case 'inactive-leads':
    default: {
      const inactive = nonDeleted
        .filter((l) => l.is_inactive === 1 && matchEmp(l))
        .sort((a, b) => a.last_qualifying_interaction_at.localeCompare(b.last_qualifying_interaction_at));
      return {
        title: 'Inactive Leads Report',
        columns: [
          'Lead ID',
          'Customer Name',
          'Mobile',
          'Property Requirement',
          'Current Stage',
          'Assigned Employee',
          'Lead Source',
          'Last Customer Interaction Date',
          'Last Interaction Type',
          'Last Interaction Remarks',
          'Inactive Days',
        ],
        rows: inactive.map((l) => [
          l.lead_code,
          l.customer_name,
          l.mobile,
          [l.bhk_config, l.property_subtype, l.transaction_type].filter(Boolean).join(' · '),
          l.stage,
          l.assigned_to_name || '',
          l.lead_source,
          l.last_qualifying_interaction_at.slice(0, 10),
          l.last_interaction_type || 'Lead Creation',
          l.last_interaction_remarks || '',
          l.inactive_days ?? 15,
        ]),
      };
    }
  }
}

function validateAndNormalizeImportRows(
  rawRows: Array<Record<string, string>>,
  masters: MasterItem[],
  team: UserProfile[]
): Promise<ImportPreviewRow[]> {
  const activeMasters = masters.filter((m) => m.is_active === 1);
  const matchMaster = (cat: string, val: string) =>
    activeMasters.find((m) => m.category === cat && m.name.toLowerCase() === val.trim().toLowerCase());
  const activeUsers = team.filter((u) => u.status === 'active');

  return Promise.all(
    rawRows.map(async (raw, idx) => {
      const errors: string[] = [];
      const customerName = (raw['Customer Name'] || '').trim();
      const mobile = (raw['Mobile'] || '').trim();
      const altMobile = (raw['Alternate Mobile'] || '').trim();
      const whatsapp = (raw['WhatsApp'] || '').trim();
      const email = (raw['Email'] || '').trim();
      const company = (raw['Company'] || '').trim();
      const sourceRaw = (raw['Lead Source'] || '').trim();
      const propTypeRaw = (raw['Property Type'] || '').trim();
      const subtypeRaw = (raw['Property Subtype'] || '').trim();
      const txTypeRaw = (raw['Transaction Type'] || '').trim();
      const localitiesRaw = (raw['Localities'] || '').trim();
      const budgetFromRaw = (raw['Budget From'] || '').trim();
      const budgetToRaw = (raw['Budget To'] || '').trim();
      const bhkRaw = (raw['BHK'] || '').trim();
      const minAreaRaw = (raw['Min Area'] || '').trim();
      const maxAreaRaw = (raw['Max Area'] || '').trim();
      const areaUnitRaw = (raw['Area Unit'] || '').trim();
      const empRaw = (raw['Assigned Employee'] || '').trim();
      const remarksRaw = (raw['Remarks'] || '').trim();

      if (!customerName) errors.push('Customer Name is mandatory.');
      if (!isValidIndianMobile(mobile)) errors.push('Mobile must be a 10-digit Indian mobile.');
      if (altMobile && !isValidIndianMobile(altMobile)) errors.push('Alternate Mobile must be a 10-digit Indian mobile.');
      if (whatsapp && !isValidIndianMobile(whatsapp)) errors.push('WhatsApp must be a 10-digit Indian mobile.');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid Email address.');

      const srcMaster = sourceRaw ? matchMaster('lead_source', sourceRaw) : null;
      if (!srcMaster) errors.push(`Invalid or inactive Lead Source: "${sourceRaw}".`);

      const ptMaster = propTypeRaw ? matchMaster('property_type', propTypeRaw) : null;
      if (!ptMaster) errors.push(`Invalid or inactive Property Type: "${propTypeRaw}".`);

      const subMaster = subtypeRaw ? matchMaster('property_subtype', subtypeRaw) : null;
      if (!subMaster) {
        errors.push(`Invalid or inactive Property Subtype: "${subtypeRaw}".`);
      } else if (ptMaster && subMaster.parent_value && subMaster.parent_value !== ptMaster.name) {
        errors.push(`Subtype "${subMaster.name}" does not belong to Property Type "${ptMaster.name}".`);
      }

      const txMaster = txTypeRaw ? matchMaster('transaction_type', txTypeRaw) : null;
      if (!txMaster) errors.push(`Invalid or inactive Transaction Type: "${txTypeRaw}".`);

      const locTokens = localitiesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const resolvedLocalities: string[] = [];
      if (locTokens.length === 0) {
        errors.push('At least one Locality is mandatory.');
      } else {
        for (const tok of locTokens) {
          const lm = matchMaster('locality', tok);
          if (!lm) errors.push(`Unknown or inactive Locality: "${tok}".`);
          else resolvedLocalities.push(lm.name);
        }
      }

      const budgetFrom = budgetFromRaw ? Number(budgetFromRaw) : null;
      const budgetTo = budgetToRaw ? Number(budgetToRaw) : null;
      if (budgetFromRaw && Number.isNaN(budgetFrom)) errors.push('Budget From must be numeric.');
      if (budgetToRaw && Number.isNaN(budgetTo)) errors.push('Budget To must be numeric.');
      if (budgetFrom !== null && budgetTo !== null && budgetFrom > budgetTo) errors.push('Budget From cannot exceed Budget To.');

      let bhkValue: string | null = null;
      if (bhkRaw) {
        const bm = matchMaster('bhk_config', bhkRaw);
        if (!bm) errors.push(`Invalid BHK value: "${bhkRaw}".`);
        else bhkValue = bm.name;
      }

      const minArea = minAreaRaw ? Number(minAreaRaw) : null;
      const maxArea = maxAreaRaw ? Number(maxAreaRaw) : null;
      if (minAreaRaw && Number.isNaN(minArea)) errors.push('Min Area must be numeric.');
      if (maxAreaRaw && Number.isNaN(maxArea)) errors.push('Max Area must be numeric.');
      if (minArea !== null && maxArea !== null && minArea > maxArea) errors.push('Min Area cannot exceed Max Area.');
      const validUnits = ['Sq. Ft.', 'Sq. Yards (Vaar)', 'Sq. Mtr.'];
      if ((minArea !== null || maxArea !== null) && !validUnits.includes(areaUnitRaw)) {
        errors.push('Area Unit (Sq. Ft. / Sq. Yards (Vaar) / Sq. Mtr.) is required when Area is entered.');
      }

      let matchedEmp: UserProfile | undefined;
      if (!empRaw) {
        errors.push('Assigned Employee (email or full name) is mandatory.');
      } else {
        matchedEmp = activeUsers.find(
          (u) => u.email.toLowerCase() === empRaw.toLowerCase() || u.full_name.toLowerCase() === empRaw.toLowerCase()
        );
        if (!matchedEmp) errors.push(`Invalid or inactive Assigned Employee: "${empRaw}".`);
      }

      const duplicates = isValidIndianMobile(mobile) ? await checkMobileDuplicates(mobile) : [];

      return {
        rowNumber: idx + 2,
        raw,
        normalized: {
          customer_name: customerName,
          mobile,
          alternate_mobile: altMobile || null,
          whatsapp: whatsapp || null,
          email: email || null,
          company_name: company || null,
          lead_source: srcMaster?.name || sourceRaw,
          property_type: ptMaster?.name || propTypeRaw,
          property_subtype: subMaster?.name || subtypeRaw,
          transaction_type: txMaster?.name || txTypeRaw,
          localities: resolvedLocalities,
          budget_from: budgetFrom,
          budget_to: budgetTo,
          bhk_config: bhkValue,
          min_area: minArea,
          max_area: maxArea,
          area_unit: areaUnitRaw || null,
          assigned_to: matchedEmp?.id || null,
          assigned_to_uid: matchedEmp?.uid || null,
          assigned_to_email: matchedEmp?.email || null,
          assigned_to_name: matchedEmp?.full_name || null,
          requirement_remarks: remarksRaw || null,
        },
        errors,
        duplicates,
        isValid: errors.length === 0,
      };
    })
  );
}

// ==================== MAIN DISPATCHER ====================

export async function dispatchCrmRequest<T = unknown>(
  url: string,
  options: RequestInit,
  currentUser: UserProfile | null
): Promise<T> {
  const { path, params } = parseUrl(url);
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body && typeof options.body === 'string' ? (JSON.parse(options.body) as Record<string, unknown>) : {};

  if (!currentUser) {
    throw new Error('Authentication required.');
  }
  const user = currentUser;
  const userUid = auth.currentUser?.uid || user.uid || user.id;

  // ---- PROFILE & SETTINGS ----
  if (path === '/api/auth/me' && method === 'GET') {
    const [uSnap, settings] = await Promise.all([getDoc(doc(db, 'users', userUid)), fetchWorkspaceSettings()]);
    const fresh = uSnap.exists() ? mapUserDoc(userUid, uSnap.data() as Record<string, unknown>) : user;
    return { user: fresh, settings } as T;
  }

  if (path === '/api/profile' && method === 'PATCH') {
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    const dirUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (body.full_name !== undefined && String(body.full_name).trim()) {
      updates.full_name = String(body.full_name).trim().slice(0, 120);
      dirUpdates.full_name = updates.full_name;
    }
    if (body.mobile !== undefined) {
      const m = String(body.mobile).trim();
      if (m && !isValidIndianMobile(m)) throw new Error('Mobile must be a valid 10-digit Indian mobile.');
      updates.mobile = m;
    }
    if (body.designation !== undefined && String(body.designation).trim()) {
      updates.designation = String(body.designation).trim().slice(0, 100);
      dirUpdates.designation = updates.designation;
    }
    if (body.profile_photo !== undefined) updates.profile_photo = body.profile_photo ? String(body.profile_photo).slice(0, 300000) : null;
    if (body.theme_preference === 'light' || body.theme_preference === 'dark') updates.theme_preference = body.theme_preference;
    if (body.lead_view_preference === 'table' || body.lead_view_preference === 'kanban') {
      updates.lead_view_preference = body.lead_view_preference;
    }
    if ([10, 25, 50, 100].includes(Number(body.page_size_preference))) {
      updates.page_size_preference = Number(body.page_size_preference);
    }
    if (body.table_columns_preference === null || Array.isArray(body.table_columns_preference)) {
      updates.table_columns_preference =
        body.table_columns_preference === null ? null : body.table_columns_preference.slice(0, 20);
    }

    try {
      await updateDoc(doc(db, 'users', userUid), updates);
      if (dirUpdates.full_name || dirUpdates.designation) {
        const dirId = user.invite_id || userUid;
        await updateDoc(doc(db, 'employeeDirectory', dirId), dirUpdates).catch(() => {});
      }
      const freshSnap = await getDoc(doc(db, 'users', userUid));
      return { user: mapUserDoc(userUid, freshSnap.data() as Record<string, unknown>) } as T;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userUid}`);
    }
  }

  if (path === '/api/settings' && method === 'PATCH') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (body.company_name && String(body.company_name).trim()) updates.company_name = String(body.company_name).trim().slice(0, 120);
    if (body.short_name && String(body.short_name).trim()) updates.short_name = String(body.short_name).trim().slice(0, 40);
    if (body.company_logo !== undefined) updates.company_logo = body.company_logo ? String(body.company_logo).slice(0, 400000) : null;
    if (Array.isArray(body.default_table_columns)) updates.default_table_columns = body.default_table_columns.slice(0, 20);
    try {
      await updateDoc(doc(db, 'settings', 'workspace'), updates);
      await writeAudit({ entityType: 'settings', entityId: 'workspace', actionType: 'Settings Updated', user });
      return (await fetchWorkspaceSettings()) as T;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/workspace');
    }
  }

  // ---- MASTERS ----
  if (path === '/api/masters' && method === 'GET') {
    let masters = await fetchMasters();
    if (masters.length === 0 && user.role === 'super_admin') {
      await ensureDefaultMastersSeeded([]);
      masters = await fetchMasters();
    }
    return { masters } as T;
  }

  if (path === '/api/masters/seed-defaults' && method === 'POST') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const existing = await fetchMasters();
    const added = await ensureDefaultMastersSeeded(existing);
    if (added > 0) {
      await writeAudit({
        entityType: 'master',
        entityId: 'prd_defaults',
        actionType: 'Created',
        fieldName: 'masters',
        newValue: `Seeded ${added} default PRD master values`,
        user,
      });
    }
    return { added, masters: await fetchMasters() } as T;
  }

  if (path === '/api/masters' && method === 'POST') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const category = String(body.category || '') as MasterCategory;
    const name = String(body.name || '').trim();
    if (!name) throw new Error('Master value name is mandatory.');
    const existing = await fetchMasters();
    if (existing.some((m) => m.category === category && m.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`"${name}" already exists in this master category.`);
    }
    const maxOrder = existing.filter((m) => m.category === category).reduce((mx, m) => Math.max(mx, m.sort_order), 0);
    const id = uidGen(category);
    const sortOrder = body.sort_order !== undefined && body.sort_order !== '' ? Number(body.sort_order) : maxOrder + 1;
    try {
      await setDoc(doc(db, 'masters', id), {
        id,
        category,
        name: name.slice(0, 120),
        parent_value: body.parent_value ? String(body.parent_value).slice(0, 120) : null,
        sort_order: sortOrder,
        is_active: true,
        is_terminal: false,
        terminal_outcome: null,
        system_key: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAudit({ entityType: 'master', entityId: id, actionType: 'Created', fieldName: category, newValue: name, user });
      return { id } as T;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `masters/${id}`);
    }
  }

  if (path.startsWith('/api/masters/') && (method === 'PATCH' || method === 'DELETE')) {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const masterId = path.split('/')[3];
    const ref = doc(db, 'masters', masterId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Master item not found.');
    const existing = mapMasterDoc(snap.id, snap.data() as Record<string, unknown>);

    if (method === 'DELETE') {
      if (existing.is_terminal === 1 || existing.system_key) {
        throw new Error('Core system or terminal stages cannot be deleted.');
      }
      const leads = await fetchAuthorizedLeads(user, { deleted: true });
      const inUse = leads.some(
        (l) =>
          l.stage === existing.name ||
          l.lead_source === existing.name ||
          l.property_type === existing.name ||
          l.property_subtype === existing.name ||
          l.transaction_type === existing.name ||
          l.bhk_config === existing.name ||
          l.furnishing_type === existing.name ||
          l.possession_pref === existing.name ||
          l.dead_reason === existing.name ||
          l.localities.includes(existing.name)
      );
      if (inUse) {
        throw new Error('This master value is already used by existing leads. Deactivate it instead of deleting.');
      }
      await deleteDoc(ref);
      await writeAudit({
        entityType: 'master',
        entityId: masterId,
        actionType: 'Deleted',
        fieldName: existing.category,
        previousValue: existing.name,
        user,
      });
      return { ok: true } as T;
    }

    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (body.name !== undefined && String(body.name).trim()) updates.name = String(body.name).trim().slice(0, 120);
    if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order);
    if (body.is_active !== undefined) {
      if (existing.is_terminal === 1 && !body.is_active) {
        throw new Error('Terminal stages cannot be deactivated.');
      }
      updates.is_active = Boolean(body.is_active);
    }
    await updateDoc(ref, updates);
    await writeAudit({
      entityType: 'master',
      entityId: masterId,
      actionType: 'Updated',
      fieldName: existing.category,
      previousValue: existing.name,
      newValue: String(updates.name || existing.name),
      user,
    });
    return { ok: true } as T;
  }

  // ---- USERS & EMPLOYEE INVITES ----
  if (path === '/api/users' && method === 'GET') {
    return { users: await fetchTeamMembers(user) } as T;
  }

  if (path === '/api/users' && method === 'POST') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    const mobile = String(body.mobile || '').trim();
    const designation = String(body.designation || 'Property Consultant').trim();
    const role = body.role === 'super_admin' ? 'super_admin' : 'sales_executive';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid Google email is required.');
    if (!fullName) throw new Error('Full Name is mandatory.');
    if (mobile && !isValidIndianMobile(mobile)) throw new Error('Mobile must be a 10-digit Indian mobile.');

    const team = await fetchTeamMembers(user);
    if (team.some((u) => u.email.toLowerCase() === email)) {
      throw new Error(`An employee or invitation for "${email}" already exists.`);
    }

    const id = uidGen('emp');
    try {
      const b = writeBatch(db);
      b.set(doc(db, 'employeeInvites', id), {
        id,
        email,
        full_name: fullName.slice(0, 120),
        mobile,
        designation: designation.slice(0, 100),
        role,
        status: 'active',
        claimed_uid: null,
        createdBy: userUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      b.set(doc(db, 'employeeDirectory', id), {
        id,
        uid: null,
        email_key: email,
        full_name: fullName.slice(0, 120),
        designation: designation.slice(0, 100),
        role,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await b.commit();
      await writeAudit({
        entityType: 'user',
        entityId: id,
        actionType: 'Employee Invited',
        fieldName: 'email',
        newValue: `${fullName} (${email}) — ${role}`,
        user,
      });
      return { id } as T;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `employeeInvites/${id}`);
    }
  }

  if (path.startsWith('/api/users/') && path.endsWith('/deactivate') && method === 'POST') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const targetId = path.split('/')[3];
    if (targetId === userUid || targetId === user.id) throw new Error('You cannot deactivate your own active Super Admin account.');

    const team = await fetchTeamMembers(user);
    const target = team.find((u) => u.id === targetId || u.uid === targetId);
    if (!target) throw new Error('Employee not found.');

    const leads = await fetchAuthorizedLeads(user, { deleted: true });
    const ownedActiveLeads = leads.filter(
      (l) =>
        l.is_deleted === 0 &&
        l.stage !== 'Booking Done' &&
        l.stage !== 'Dead' &&
        (l.assigned_to === target.id || (l.assigned_to_email || '').toLowerCase() === target.email.toLowerCase())
    );

    const reassignToId = body.reassign_to ? String(body.reassign_to) : null;
    if (ownedActiveLeads.length > 0) {
      const recipient = team.find(
        (u) => (u.id === reassignToId || u.uid === reassignToId) && u.status === 'active' && u.id !== target.id
      );
      if (!recipient) {
        throw new Error('Select an active employee to receive all active leads before deactivation.');
      }

      const acts = await fetchAuthorizedActivities(user);
      for (const l of ownedActiveLeads) {
        await updateDoc(doc(db, 'leads', l.id), {
          assigned_to: recipient.id,
          assigned_to_uid: recipient.uid || null,
          assigned_to_email: recipient.email.toLowerCase(),
          assigned_to_name: recipient.full_name,
          updatedAt: serverTimestamp(),
        });
        await syncMobileLookup({
          id: l.id,
          lead_code: l.lead_code,
          mobile: l.mobile,
          customer_name: l.customer_name,
          property_subtype: l.property_subtype,
          transaction_type: l.transaction_type,
          stage: l.stage,
          assigned_to: recipient.id,
          assigned_to_name: recipient.full_name,
          is_deleted: false,
        });
        const pendingActs = acts.filter((a) => a.lead_id === l.id && a.status === 'Pending');
        for (const a of pendingActs) {
          await updateDoc(doc(db, 'activities', a.id), {
            assigned_to: recipient.id,
            assigned_to_uid: recipient.uid || null,
            assigned_to_email: recipient.email.toLowerCase(),
            assigned_to_name: recipient.full_name,
            updatedAt: serverTimestamp(),
          });
        }
        await writeTimeline(
          l.id,
          'Reassigned',
          `Reassigned from ${target.full_name} to ${recipient.full_name} upon employee deactivation.`,
          user
        );
        await writeAudit({
          entityType: 'lead',
          entityId: l.id,
          leadId: l.id,
          leadCode: l.lead_code,
          leadAssignedToEmail: recipient.email.toLowerCase(),
          actionType: 'Reassigned',
          fieldName: 'assigned_to',
          previousValue: target.full_name,
          newValue: recipient.full_name,
          remarks: 'Bulk reassignment on employee deactivation',
          user,
        });
      }
      await createNotificationDoc({
        userUid: recipient.uid,
        userEmail: recipient.email,
        notifType: 'Lead Reassigned',
        title: `${ownedActiveLeads.length} Lead(s) Reassigned to You`,
        message: `${ownedActiveLeads.length} active lead(s) transferred from deactivated employee ${target.full_name}.`,
      });
    }

    if (target.uid) {
      await updateDoc(doc(db, 'users', target.uid), { status: 'inactive', updatedAt: serverTimestamp() });
      await deleteDoc(doc(db, 'admins', target.uid)).catch(() => {});
    }
    const invId = target.invite_id || (target.is_pending_claim ? target.id : null);
    if (invId) {
      await updateDoc(doc(db, 'employeeInvites', invId), { status: 'inactive', updatedAt: serverTimestamp() }).catch(() => {});
    }
    const dirId = target.invite_id || target.id;
    await updateDoc(doc(db, 'employeeDirectory', dirId), { status: 'inactive', updatedAt: serverTimestamp() }).catch(() => {});

    await writeAudit({
      entityType: 'user',
      entityId: target.id,
      actionType: 'Deactivated',
      fieldName: 'status',
      previousValue: 'active',
      newValue: 'inactive',
      user,
    });
    return { ok: true } as T;
  }

  if (path.startsWith('/api/users/') && method === 'PATCH') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const targetId = path.split('/')[3];
    const team = await fetchTeamMembers(user);
    const target = team.find((u) => u.id === targetId || u.uid === targetId);
    if (!target) throw new Error('Employee not found.');

    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    const dirUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (body.full_name !== undefined && String(body.full_name).trim()) {
      updates.full_name = String(body.full_name).trim().slice(0, 120);
      dirUpdates.full_name = updates.full_name;
    }
    if (body.mobile !== undefined) {
      const m = String(body.mobile).trim();
      if (m && !isValidIndianMobile(m)) throw new Error('Mobile must be a 10-digit Indian mobile.');
      updates.mobile = m;
    }
    if (body.designation !== undefined && String(body.designation).trim()) {
      updates.designation = String(body.designation).trim().slice(0, 100);
      dirUpdates.designation = updates.designation;
    }
    if (body.role === 'super_admin' || body.role === 'sales_executive') {
      updates.role = body.role;
      dirUpdates.role = body.role;
    }
    if (body.status === 'active' || body.status === 'inactive') {
      updates.status = body.status;
      dirUpdates.status = body.status;
    }
    if (body.email !== undefined && String(body.email).trim()) {
      const nextEmail = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) throw new Error('Invalid email format.');
      updates.email = nextEmail;
      dirUpdates.email_key = nextEmail;
    }

    if (target.uid) {
      await updateDoc(doc(db, 'users', target.uid), updates);
      const nextRole = (updates.role as string) || target.role;
      const nextStatus = (updates.status as string) || target.status;
      if (nextRole === 'super_admin' && nextStatus === 'active') {
        await setDoc(doc(db, 'admins', target.uid), {
          uid: target.uid,
          email: String(updates.email || target.email).toLowerCase(),
          grantedBy: userUid,
          createdAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(doc(db, 'admins', target.uid)).catch(() => {});
      }
    }
    const invId = target.invite_id || (target.is_pending_claim ? target.id : null);
    if (invId) {
      await updateDoc(doc(db, 'employeeInvites', invId), updates).catch(() => {});
    }
    const dirId = target.invite_id || target.id;
    await updateDoc(doc(db, 'employeeDirectory', dirId), dirUpdates).catch(() => {});

    await writeAudit({
      entityType: 'user',
      entityId: target.id,
      actionType: 'Updated',
      fieldName: 'profile',
      newValue: String(updates.full_name || target.full_name),
      user,
    });
    return { ok: true } as T;
  }

  // ---- NOTIFICATIONS ----
  if (path === '/api/notifications' && method === 'GET') {
    const team = await fetchTeamMembers(user);
    await evaluateInactivityAndReminders(user, team);
    try {
      const snap =
        user.role === 'super_admin'
          ? await getDocs(query(collection(db, 'notifications'), where('user_email', '==', user.email.toLowerCase())))
          : await getDocs(query(collection(db, 'notifications'), where('user_email', '==', user.email.toLowerCase())));
      const items: NotificationItem[] = snap.docs
        .map((d) => {
          const r = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            user_id: String(r.user_uid || r.user_email || ''),
            lead_id: r.lead_id ? String(r.lead_id) : null,
            lead_code: r.lead_code ? String(r.lead_code) : null,
            activity_id: r.activity_id ? String(r.activity_id) : null,
            notif_type: String(r.notif_type || ''),
            title: String(r.title || ''),
            message: String(r.message || ''),
            is_read: r.is_read === true ? 1 : 0,
            created_at: tsToIso(r.createdAt),
          };
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 60);
      return { notifications: items, unreadCount: items.filter((n) => n.is_read === 0).length } as T;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    }
  }

  if (path === '/api/notifications/read-all' && method === 'POST') {
    const snap = await getDocs(query(collection(db, 'notifications'), where('user_email', '==', user.email.toLowerCase())));
    const b = writeBatch(db);
    snap.docs.forEach((d) => {
      if (!d.data().is_read) {
        b.update(d.ref, { is_read: true, updatedAt: serverTimestamp() });
      }
    });
    await b.commit();
    return { ok: true } as T;
  }

  if (path.startsWith('/api/notifications/') && path.endsWith('/read') && method === 'POST') {
    const notifId = path.split('/')[3];
    await updateDoc(doc(db, 'notifications', notifId), { is_read: true, updatedAt: serverTimestamp() });
    return { ok: true } as T;
  }

  // ---- DUPLICATE CHECK ----
  if (path === '/api/leads/check-duplicate' && method === 'GET') {
    const mobile = params.get('mobile') || '';
    const excludeId = params.get('excludeId') || undefined;
    return { duplicates: await checkMobileDuplicates(mobile, excludeId) } as T;
  }

  // ---- LEADS LIST & CREATE ----
  if (path === '/api/leads' && method === 'GET') {
    const leadsAll = await fetchAuthorizedLeads(user, { deleted: params.get('deleted') === 'true' });
    const filtered = filterAndSortLeads(leadsAll, params, user);
    const total = filtered.length;
    if (params.get('all') === 'true') {
      return { leads: filtered, total, page: 1, pageSize: total } as T;
    }
    const page = Math.max(1, Number(params.get('page') || 1));
    const pageSize = Math.min(100, Math.max(10, Number(params.get('pageSize') || 25)));
    const startIdx = (page - 1) * pageSize;
    return { leads: filtered.slice(startIdx, startIdx + pageSize), total, page, pageSize } as T;
  }

  if (path === '/api/leads' && method === 'POST') {
    const customerName = String(body.customer_name || '').trim();
    const mobile = String(body.mobile || '').trim();
    const altMobile = body.alternate_mobile ? String(body.alternate_mobile).trim().slice(0, 20) : null;
    const whatsapp = body.whatsapp ? String(body.whatsapp).trim().slice(0, 20) : null;
    const email = body.email ? String(body.email).trim().slice(0, 200) : null;
    if (!customerName) throw new Error('Customer Name is mandatory.');
    if (!isValidIndianMobile(mobile)) throw new Error('Mobile Number must be a valid 10-digit Indian mobile starting with 6-9.');
    if (altMobile && !isValidIndianMobile(altMobile)) throw new Error('Alternate Mobile must be a valid 10-digit Indian mobile.');
    if (whatsapp && !isValidIndianMobile(whatsapp)) throw new Error('WhatsApp Number must be a valid 10-digit Indian mobile.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email address format.');

    const leadSource = String(body.lead_source || '').trim().slice(0, 120);
    const propertyType = String(body.property_type || '').trim().slice(0, 120);
    const propertySubtype = String(body.property_subtype || '').trim().slice(0, 120);
    const transactionType = String(body.transaction_type || '').trim().slice(0, 120);
    const localities = Array.isArray(body.localities)
      ? body.localities.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()).slice(0, 30)
      : [];
    if (!leadSource || !propertyType || !propertySubtype || !transactionType) {
      throw new Error('Lead Source, Property Type, Subtype, and Transaction Type are mandatory.');
    }
    if (localities.length === 0) throw new Error('At least one Preferred Locality is mandatory.');

    const budgetFrom = toFiniteNumberOrNull(body.budget_from);
    const budgetTo = toFiniteNumberOrNull(body.budget_to);
    if (budgetFrom !== null && budgetTo !== null && budgetFrom > budgetTo) throw new Error('Budget From cannot exceed Budget To.');

    const minArea = toFiniteNumberOrNull(body.min_area);
    const maxArea = toFiniteNumberOrNull(body.max_area);
    const areaUnit = body.area_unit ? String(body.area_unit).trim().slice(0, 40) : null;
    if (minArea !== null && maxArea !== null && minArea > maxArea) throw new Error('Minimum Area cannot exceed Maximum Area.');
    if ((minArea !== null || maxArea !== null) && !areaUnit) throw new Error('Area Unit is mandatory when area is entered.');

    const [team, masters] = await Promise.all([fetchTeamMembers(user), fetchMasters()]);
    let assignee = user;
    if (user.role === 'super_admin' && body.assigned_to) {
      const found = team.find((u) => (u.id === String(body.assigned_to) || u.uid === String(body.assigned_to)) && u.status === 'active');
      if (!found) throw new Error('Selected assignee must be an active employee.');
      assignee = found;
    }

    const initialStage = (body.stage ? String(body.stage).trim() : 'New Lead').slice(0, 120);
    const stageMeta = masters.find((m) => m.category === 'lead_stage' && m.name === initialStage);
    if (!stageMeta || stageMeta.is_active === 0) throw new Error('Selected initial stage is invalid or inactive.');

    const [leadCode] = await allocateLeadCodes(1, user);
    const leadId = leadCode.replace('-', '_');
    const nowIso = new Date().toISOString();
    const creatorName = (user.full_name || user.email || 'User').trim().slice(0, 120);
    const assigneeId = String(assignee.id || assignee.uid || userUid).slice(0, 128);
    const assigneeName = (assignee.full_name || assignee.email || 'Assignee').trim().slice(0, 120);
    const assigneeEmail = assignee.email.trim().toLowerCase().slice(0, 200);

    try {
      await setDoc(doc(db, 'leads', leadId), {
        id: leadId,
        lead_code: leadCode,
        customer_name: customerName.slice(0, 150),
        mobile,
        alternate_mobile: altMobile,
        whatsapp,
        email,
        company_name: body.company_name ? String(body.company_name).trim().slice(0, 150) : null,
        customer_remarks: body.customer_remarks ? String(body.customer_remarks).trim().slice(0, 2000) : null,
        lead_source: leadSource,
        property_type: propertyType,
        property_subtype: propertySubtype,
        transaction_type: transactionType,
        localities,
        budget_from: budgetFrom,
        budget_to: budgetTo,
        min_area: minArea,
        max_area: maxArea,
        area_unit: areaUnit,
        bhk_config: body.bhk_config ? String(body.bhk_config).trim().slice(0, 60) : null,
        commercial_config: body.commercial_config ? String(body.commercial_config).trim().slice(0, 200) : null,
        furnishing_type: body.furnishing_type ? String(body.furnishing_type).trim().slice(0, 60) : null,
        preferred_floor: body.preferred_floor ? String(body.preferred_floor).trim().slice(0, 60) : null,
        possession_pref: body.possession_pref ? String(body.possession_pref).trim().slice(0, 60) : null,
        required_workstations: toFiniteNumberOrNull(body.required_workstations),
        required_cabins: toFiniteNumberOrNull(body.required_cabins),
        requirement_remarks: body.requirement_remarks ? String(body.requirement_remarks).trim().slice(0, 2000) : null,
        stage: initialStage,
        is_terminal_stage: stageMeta.is_terminal === 1,
        created_by: userUid,
        created_by_name: creatorName,
        assigned_to: assigneeId,
        assigned_to_uid: assignee.uid ? String(assignee.uid).slice(0, 128) : null,
        assigned_to_email: assigneeEmail,
        assigned_to_name: assigneeName,
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        deleted_by_name: null,
        is_inactive: false,
        inactive_since: null,
        last_qualifying_interaction_at: nowIso,
        last_interaction_type: null,
        last_interaction_remarks: null,
        inactivity_notified_15: false,
        inactivity_escalated_22: false,
        booking_date: null,
        booking_project_name: null,
        final_transaction_amount: null,
        brokerage_amount: null,
        brokerage_percentage: null,
        payment_status: null,
        booking_remarks: null,
        dead_reason: null,
        dead_remarks: null,
        dead_by: null,
        dead_by_name: null,
        dead_at: null,
        import_batch_ref: null,
        created_date_iso: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `leads/${leadId}`);
    }

    await syncMobileLookup({
      id: leadId,
      lead_code: leadCode,
      mobile,
      customer_name: customerName,
      property_subtype: propertySubtype,
      transaction_type: transactionType,
      stage: initialStage,
      assigned_to: assigneeId,
      assigned_to_name: assigneeName,
      is_deleted: false,
    });

    await writeTimeline(
      leadId,
      'Lead Created',
      `Lead ${leadCode} created for ${customerName} (${propertySubtype} · ${transactionType}).`,
      user
    );
    await writeAudit({
      entityType: 'lead',
      entityId: leadId,
      leadId,
      leadCode,
      leadAssignedToEmail: assigneeEmail,
      actionType: 'Created',
      fieldName: 'lead_code',
      newValue: leadCode,
      user,
    });

    if (assigneeEmail !== user.email.toLowerCase()) {
      await createNotificationDoc({
        userUid: assignee.uid,
        userEmail: assigneeEmail,
        leadId,
        leadCode,
        notifType: 'New Lead Assigned',
        title: `New Lead Assigned: ${leadCode}`,
        message: `${customerName} (${propertySubtype} in ${localities.join(', ')}) was assigned to you by ${creatorName}.`,
      });
    }

    if (body.first_followup_date && body.first_followup_time) {
      const fType = String(body.first_followup_type || 'Follow-up Call');
      const fDate = String(body.first_followup_date);
      const fTime = String(body.first_followup_time);
      const fIso = new Date(`${fDate}T${fTime}:00`).toISOString();
      const fDesc = body.first_followup_remarks ? String(body.first_followup_remarks).trim() : 'Initial follow-up planned';
      const actId = uidGen('act');
      try {
        await setDoc(doc(db, 'activities', actId), {
          id: actId,
          lead_id: leadId,
          lead_code: leadCode,
          customer_name: customerName.slice(0, 150),
          customer_mobile: mobile,
          lead_stage: initialStage,
          lead_is_deleted: false,
          activity_type: fType,
          scheduled_date: fDate,
          scheduled_time: fTime,
          scheduled_at: fIso,
          assigned_to: assigneeId,
          assigned_to_uid: assignee.uid ? String(assignee.uid).slice(0, 128) : null,
          assigned_to_email: assigneeEmail,
          assigned_to_name: assigneeName,
          description: fDesc.slice(0, 1000),
          status: 'Pending',
          completed_by: null,
          completed_by_name: null,
          completed_at: null,
          completion_remarks: null,
          cancelled_by: null,
          cancelled_by_name: null,
          cancelled_at: null,
          cancel_reason: null,
          reschedule_count: 0,
          previous_schedule_history: [],
          reminded_30: false,
          reminded_15: false,
          reminded_overdue: false,
          created_by: userUid,
          created_by_name: creatorName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `activities/${actId}`);
      }
      await writeTimeline(leadId, 'Activity Scheduled', `${fType} scheduled for ${fDate} ${fTime}: ${fDesc}`, user);
      await maybeAutoSyncStage(leadId, fType, 'scheduled', user, masters);
    }

    try {
      const freshSnap = await getDoc(doc(db, 'leads', leadId));
      return { lead: mapLeadDoc(leadId, freshSnap.data() as Record<string, unknown>) } as T;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `leads/${leadId}`);
    }
  }

  // ---- LEAD DETAIL / EDIT / STAGE / REASSIGN / REOPEN / DELETE / RESTORE ----
  if (path.startsWith('/api/leads/')) {
    const parts = path.split('/');
    const leadId = parts[3];
    const subAction = parts[4];

    // GET /api/leads/:id
    if (!subAction && method === 'GET') {
      try {
        const snap = await getDoc(doc(db, 'leads', leadId));
        if (!snap.exists()) throw new Error('Lead not found.');
        const lead = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);

        const [actsSnap, commsSnap, tlSnap, auditSnap, duplicates] = await Promise.all([
          getDocs(
            user.role === 'super_admin'
              ? query(collection(db, 'activities'), where('lead_id', '==', leadId))
              : query(
                  collection(db, 'activities'),
                  where('lead_id', '==', leadId),
                  where('assigned_to_email', '==', user.email.toLowerCase()),
                  where('lead_is_deleted', '==', false)
                )
          ),
          getDocs(collection(db, 'leads', leadId, 'communications')),
          getDocs(collection(db, 'leads', leadId, 'timeline')),
          getDocs(
            user.role === 'super_admin'
              ? query(collection(db, 'auditLogs'), where('lead_id', '==', leadId))
              : query(
                  collection(db, 'auditLogs'),
                  where('lead_id', '==', leadId),
                  where('lead_assigned_to_email', '==', user.email.toLowerCase())
                )
          ),
          checkMobileDuplicates(lead.mobile, leadId),
        ]);

        const activities = actsSnap.docs
          .map((d) => mapActivityDoc(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

        const communications: CommunicationRecord[] = commsSnap.docs
          .map((d) => {
            const r = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              lead_id: leadId,
              comm_type: String(r.comm_type) as CommunicationRecord['comm_type'],
              description: String(r.description || ''),
              next_action_remarks: r.next_action_remarks ? String(r.next_action_remarks) : null,
              employee_id: String(r.employee_id || ''),
              employee_name: String(r.employee_name || ''),
              created_at: tsToIso(r.createdAt),
            };
          })
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        const timeline: TimelineEvent[] = tlSnap.docs
          .map((d) => {
            const r = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              lead_id: leadId,
              event_type: String(r.event_type || ''),
              description: String(r.description || ''),
              metadata: null,
              employee_id: r.employee_id ? String(r.employee_id) : null,
              employee_name: String(r.employee_name || 'System'),
              created_at: tsToIso(r.createdAt),
            };
          })
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        const auditLogs: AuditLogEntry[] = auditSnap.docs
          .map((d) => {
            const r = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              entity_type: String(r.entity_type || ''),
              entity_id: String(r.entity_id || ''),
              lead_id: r.lead_id ? String(r.lead_id) : null,
              lead_code: r.lead_code ? String(r.lead_code) : null,
              action_type: String(r.action_type || ''),
              field_name: r.field_name ? String(r.field_name) : null,
              previous_value: r.previous_value ? String(r.previous_value) : null,
              new_value: r.new_value ? String(r.new_value) : null,
              remarks: r.remarks ? String(r.remarks) : null,
              employee_id: r.employee_id ? String(r.employee_id) : null,
              employee_name: String(r.employee_name || 'System'),
              created_at: tsToIso(r.createdAt),
            };
          })
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        return { lead, activities, communications, timeline, auditLogs, duplicates } as T;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `leads/${leadId}`);
      }
    }

    // PATCH /api/leads/:id
    if (!subAction && method === 'PATCH') {
      const snap = await getDoc(doc(db, 'leads', leadId));
      if (!snap.exists()) throw new Error('Lead not found.');
      const existing = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);
      if (existing.is_terminal_stage && user.role !== 'super_admin') {
        throw new Error('Booking Done and Dead leads are read-only for Sales Executives.');
      }

      const nextMobile = body.mobile !== undefined ? String(body.mobile).trim() : existing.mobile;
      if (!isValidIndianMobile(nextMobile)) throw new Error('Mobile Number must be a valid 10-digit Indian mobile.');
      const nextBudgetFrom =
        body.budget_from !== undefined ? (body.budget_from === '' || body.budget_from === null ? null : Number(body.budget_from)) : existing.budget_from;
      const nextBudgetTo =
        body.budget_to !== undefined ? (body.budget_to === '' || body.budget_to === null ? null : Number(body.budget_to)) : existing.budget_to;
      if (nextBudgetFrom !== null && nextBudgetTo !== null && nextBudgetFrom > nextBudgetTo) {
        throw new Error('Budget From cannot exceed Budget To.');
      }
      const nextMinArea =
        body.min_area !== undefined ? (body.min_area === '' || body.min_area === null ? null : Number(body.min_area)) : existing.min_area;
      const nextMaxArea =
        body.max_area !== undefined ? (body.max_area === '' || body.max_area === null ? null : Number(body.max_area)) : existing.max_area;
      const nextAreaUnit = body.area_unit !== undefined ? (body.area_unit || null) : existing.area_unit;
      if (nextMinArea !== null && nextMaxArea !== null && nextMinArea > nextMaxArea) throw new Error('Minimum Area cannot exceed Maximum Area.');
      if ((nextMinArea !== null || nextMaxArea !== null) && !nextAreaUnit) throw new Error('Area Unit is mandatory when area is entered.');

      const updates: Record<string, unknown> = {};
      const changed: string[] = [];
      const editableFields = [
        'customer_name', 'mobile', 'alternate_mobile', 'whatsapp', 'email', 'company_name', 'customer_remarks',
        'lead_source', 'property_type', 'property_subtype', 'transaction_type', 'budget_from', 'budget_to',
        'min_area', 'max_area', 'area_unit', 'bhk_config', 'commercial_config', 'furnishing_type',
        'preferred_floor', 'possession_pref', 'required_workstations', 'required_cabins', 'requirement_remarks',
        'booking_date', 'booking_project_name', 'final_transaction_amount', 'brokerage_amount',
        'brokerage_percentage', 'payment_status', 'booking_remarks', 'dead_reason', 'dead_remarks',
      ];

      for (const f of editableFields) {
        if (body[f] === undefined) continue;
        if (
          ['booking_date', 'booking_project_name', 'final_transaction_amount', 'brokerage_amount', 'brokerage_percentage', 'payment_status', 'booking_remarks', 'dead_reason', 'dead_remarks'].includes(f) &&
          user.role !== 'super_admin'
        ) {
          continue;
        }
        let val: string | number | null = body[f] === '' ? null : (body[f] as string | number | null);
        if (['budget_from', 'budget_to', 'min_area', 'max_area', 'final_transaction_amount', 'brokerage_amount', 'brokerage_percentage', 'required_workstations', 'required_cabins'].includes(f) && val !== null) {
          val = Number(val);
        }
        const prevVal = (existing as unknown as Record<string, unknown>)[f];
        const prevStr = prevVal === undefined || prevVal === null ? null : String(prevVal);
        const nextStr = val === null ? null : String(val);
        if (prevStr !== nextStr) {
          updates[f] = val;
          changed.push(f);
          await writeAudit({
            entityType: 'lead',
            entityId: leadId,
            leadId,
            leadCode: existing.lead_code,
            leadAssignedToEmail: existing.assigned_to_email,
            actionType: f.startsWith('booking_') || f.includes('brokerage') ? 'Booking Updated' : f.startsWith('dead_') ? 'Dead Status Updated' : 'Updated',
            fieldName: f,
            previousValue: prevStr,
            newValue: nextStr,
            remarks: body.remarks ? String(body.remarks) : null,
            user,
          });
        }
      }

      if (Array.isArray(body.localities)) {
        const clean = body.localities.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 30);
        if (clean.length === 0) throw new Error('At least one Preferred Locality is mandatory.');
        if (JSON.stringify(clean) !== JSON.stringify(existing.localities)) {
          updates.localities = clean;
          changed.push('localities');
          await writeAudit({
            entityType: 'lead',
            entityId: leadId,
            leadId,
            leadCode: existing.lead_code,
            leadAssignedToEmail: existing.assigned_to_email,
            actionType: 'Updated',
            fieldName: 'localities',
            previousValue: existing.localities.join(', '),
            newValue: clean.join(', '),
            user,
          });
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'leads', leadId), updates);
        if (updates.mobile && updates.mobile !== existing.mobile) {
          await deleteDoc(doc(db, 'mobileLookup', existing.mobile, 'matches', leadId)).catch(() => {});
        }
        await syncMobileLookup({
          id: leadId,
          lead_code: existing.lead_code,
          mobile: nextMobile,
          customer_name: String(updates.customer_name || existing.customer_name),
          property_subtype: String(updates.property_subtype || existing.property_subtype),
          transaction_type: String(updates.transaction_type || existing.transaction_type),
          stage: existing.stage,
          assigned_to: existing.assigned_to,
          assigned_to_name: existing.assigned_to_name || 'Assigned',
          is_deleted: existing.is_deleted === 1,
        });
        await writeTimeline(leadId, 'Lead Updated', `Updated field(s): ${changed.join(', ')}.`, user);
      }

      const fresh = await getDoc(doc(db, 'leads', leadId));
      return { lead: mapLeadDoc(leadId, fresh.data() as Record<string, unknown>) } as T;
    }

    // POST /api/leads/:id/stage
    if (subAction === 'stage' && method === 'POST') {
      const [snap, masters, team] = await Promise.all([getDoc(doc(db, 'leads', leadId)), fetchMasters(), fetchTeamMembers(user)]);
      if (!snap.exists()) throw new Error('Lead not found.');
      const existing = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);
      if (existing.is_terminal_stage) {
        throw new Error('Closed leads (Booking Done / Dead) cannot change stage directly. Super Admin must reopen the lead.');
      }
      const nextStageName = String(body.stage || '');
      const nextMeta = masters.find((m) => m.category === 'lead_stage' && m.name === nextStageName);
      if (!nextMeta || nextMeta.is_active === 0) throw new Error('Selected stage is invalid or inactive.');
      if (nextMeta.name === existing.stage) return { lead: existing } as T;

      const nowIso = new Date().toISOString();
      if (nextMeta.terminal_outcome === 'won' || nextMeta.system_key === 'booking_done') {
        const { booking_date, booking_project_name, final_transaction_amount, brokerage_amount, brokerage_percentage, payment_status, booking_remarks } = body;
        if (
          !booking_date ||
          !booking_project_name ||
          final_transaction_amount === undefined ||
          final_transaction_amount === '' ||
          brokerage_amount === undefined ||
          brokerage_amount === '' ||
          brokerage_percentage === undefined ||
          brokerage_percentage === '' ||
          !['Pending', 'Partially Paid', 'Paid'].includes(String(payment_status))
        ) {
          throw new Error('All mandatory Booking Done fields (Date, Project, Amounts, %, Payment Status) are required.');
        }

        await updateDoc(doc(db, 'leads', leadId), {
          stage: nextMeta.name,
          is_terminal_stage: true,
          is_inactive: false,
          inactive_since: null,
          booking_date: String(booking_date),
          booking_project_name: String(booking_project_name).trim().slice(0, 200),
          final_transaction_amount: Number(final_transaction_amount),
          brokerage_amount: Number(brokerage_amount),
          brokerage_percentage: Number(brokerage_percentage),
          payment_status: String(payment_status),
          booking_remarks: booking_remarks ? String(booking_remarks).trim().slice(0, 2000) : null,
          updatedAt: serverTimestamp(),
        });

        await writeTimeline(
          leadId,
          'Booking Done',
          `Moved from "${existing.stage}" to "${nextMeta.name}" — Project: ${booking_project_name}, Value: INR ${Number(final_transaction_amount).toLocaleString('en-IN')}.`,
          user
        );
        await writeAudit({
          entityType: 'lead',
          entityId: leadId,
          leadId,
          leadCode: existing.lead_code,
          leadAssignedToEmail: existing.assigned_to_email,
          actionType: 'Stage Changed',
          fieldName: 'stage',
          previousValue: existing.stage,
          newValue: nextMeta.name,
          remarks: booking_remarks ? String(booking_remarks) : null,
          user,
        });
        await notifySuperAdmins(team, {
          leadId,
          leadCode: existing.lead_code,
          notifType: 'Booking Done',
          title: `Booking Done: ${existing.lead_code}`,
          message: `${existing.customer_name} booked ${booking_project_name} (INR ${Number(final_transaction_amount).toLocaleString('en-IN')}) by ${user.full_name}.`,
        });
      } else if (nextMeta.terminal_outcome === 'lost' || nextMeta.system_key === 'dead') {
        const { dead_reason, dead_remarks } = body;
        if (!dead_reason || !String(dead_reason).trim()) throw new Error('Dead Reason is mandatory.');
        if (!dead_remarks || !String(dead_remarks).trim()) throw new Error('Remarks are mandatory when moving a lead to Dead.');

        await updateDoc(doc(db, 'leads', leadId), {
          stage: nextMeta.name,
          is_terminal_stage: true,
          is_inactive: false,
          inactive_since: null,
          dead_reason: String(dead_reason).trim().slice(0, 120),
          dead_remarks: String(dead_remarks).trim().slice(0, 2000),
          dead_by: userUid,
          dead_by_name: user.full_name,
          dead_at: nowIso,
          updatedAt: serverTimestamp(),
        });

        await writeTimeline(
          leadId,
          'Marked Dead',
          `Moved from "${existing.stage}" to "${nextMeta.name}" — Reason: ${dead_reason}. Remarks: ${dead_remarks}`,
          user
        );
        await writeAudit({
          entityType: 'lead',
          entityId: leadId,
          leadId,
          leadCode: existing.lead_code,
          leadAssignedToEmail: existing.assigned_to_email,
          actionType: 'Stage Changed',
          fieldName: 'stage',
          previousValue: existing.stage,
          newValue: nextMeta.name,
          remarks: String(dead_remarks),
          user,
        });
        await notifySuperAdmins(team, {
          leadId,
          leadCode: existing.lead_code,
          notifType: 'Dead',
          title: `Lead Marked Dead: ${existing.lead_code}`,
          message: `${existing.customer_name} marked Dead (${dead_reason}) by ${user.full_name}.`,
        });
      } else {
        await updateDoc(doc(db, 'leads', leadId), {
          stage: nextMeta.name,
          is_terminal_stage: false,
          updatedAt: serverTimestamp(),
        });
        await writeTimeline(leadId, 'Stage Changed', `Stage updated from "${existing.stage}" to "${nextMeta.name}".`, user);
        await writeAudit({
          entityType: 'lead',
          entityId: leadId,
          leadId,
          leadCode: existing.lead_code,
          leadAssignedToEmail: existing.assigned_to_email,
          actionType: 'Stage Changed',
          fieldName: 'stage',
          previousValue: existing.stage,
          newValue: nextMeta.name,
          user,
        });
      }

      await syncMobileLookup({
        id: leadId,
        lead_code: existing.lead_code,
        mobile: existing.mobile,
        customer_name: existing.customer_name,
        property_subtype: existing.property_subtype,
        transaction_type: existing.transaction_type,
        stage: nextMeta.name,
        assigned_to: existing.assigned_to,
        assigned_to_name: existing.assigned_to_name || 'Assigned',
        is_deleted: existing.is_deleted === 1,
      });

      const fresh = await getDoc(doc(db, 'leads', leadId));
      return { lead: mapLeadDoc(leadId, fresh.data() as Record<string, unknown>) } as T;
    }

    // POST /api/leads/:id/reassign
    if (subAction === 'reassign' && method === 'POST') {
      if (user.role !== 'super_admin') throw new Error('Super Admin required.');
      const targetId = String(body.assigned_to || '');
      const remarks = String(body.remarks || '').trim();
      if (!targetId) throw new Error('Target employee is required.');
      if (!remarks) throw new Error('Remarks are mandatory when reassigning a lead.');

      const [snap, team, acts] = await Promise.all([
        getDoc(doc(db, 'leads', leadId)),
        fetchTeamMembers(user),
        fetchAuthorizedActivities(user),
      ]);
      if (!snap.exists()) throw new Error('Lead not found.');
      const existing = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);
      const recipient = team.find((u) => (u.id === targetId || u.uid === targetId) && u.status === 'active');
      if (!recipient) throw new Error('Selected employee must be active.');
      if ((existing.assigned_to_email || '').toLowerCase() === recipient.email.toLowerCase()) {
        throw new Error('Lead is already assigned to this employee.');
      }

      const prevName = existing.assigned_to_name || 'Unassigned';
      await updateDoc(doc(db, 'leads', leadId), {
        assigned_to: recipient.id,
        assigned_to_uid: recipient.uid || null,
        assigned_to_email: recipient.email.toLowerCase(),
        assigned_to_name: recipient.full_name,
        updatedAt: serverTimestamp(),
      });

      const pendingActs = acts.filter((a) => a.lead_id === leadId && a.status === 'Pending');
      for (const a of pendingActs) {
        await updateDoc(doc(db, 'activities', a.id), {
          assigned_to: recipient.id,
          assigned_to_uid: recipient.uid || null,
          assigned_to_email: recipient.email.toLowerCase(),
          assigned_to_name: recipient.full_name,
          updatedAt: serverTimestamp(),
        });
      }

      await syncMobileLookup({
        id: leadId,
        lead_code: existing.lead_code,
        mobile: existing.mobile,
        customer_name: existing.customer_name,
        property_subtype: existing.property_subtype,
        transaction_type: existing.transaction_type,
        stage: existing.stage,
        assigned_to: recipient.id,
        assigned_to_name: recipient.full_name,
        is_deleted: existing.is_deleted === 1,
      });

      await writeTimeline(
        leadId,
        'Reassigned',
        `Reassigned from ${prevName} to ${recipient.full_name}. (${pendingActs.length} pending activity transferred). Remarks: ${remarks}`,
        user
      );
      await writeAudit({
        entityType: 'lead',
        entityId: leadId,
        leadId,
        leadCode: existing.lead_code,
        leadAssignedToEmail: recipient.email.toLowerCase(),
        actionType: 'Reassigned',
        fieldName: 'assigned_to',
        previousValue: prevName,
        newValue: recipient.full_name,
        remarks,
        user,
      });
      await createNotificationDoc({
        userUid: recipient.uid,
        userEmail: recipient.email,
        leadId,
        leadCode: existing.lead_code,
        notifType: 'Lead Reassigned',
        title: `Lead Reassigned: ${existing.lead_code}`,
        message: `${existing.customer_name} (${existing.lead_code}) was reassigned to you from ${prevName}. Remarks: ${remarks}`,
      });

      const fresh = await getDoc(doc(db, 'leads', leadId));
      return { lead: mapLeadDoc(leadId, fresh.data() as Record<string, unknown>) } as T;
    }

    // POST /api/leads/:id/reopen
    if (subAction === 'reopen' && method === 'POST') {
      if (user.role !== 'super_admin') throw new Error('Super Admin required.');
      const remarks = String(body.remarks || '').trim();
      if (!remarks) throw new Error('Mandatory remarks are required to reopen a closed lead.');
      const [snap, masters] = await Promise.all([getDoc(doc(db, 'leads', leadId)), fetchMasters()]);
      if (!snap.exists()) throw new Error('Lead not found.');
      const existing = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);
      if (!existing.is_terminal_stage) throw new Error('Lead is not in a closed terminal stage.');

      const targetStage = masters.find((m) => m.category === 'lead_stage' && m.name === String(body.stage || 'Negotiation'));
      if (!targetStage || targetStage.is_terminal === 1 || targetStage.is_active === 0) {
        throw new Error('Select a valid active pipeline stage to reopen into.');
      }

      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, 'leads', leadId), {
        stage: targetStage.name,
        is_terminal_stage: false,
        is_inactive: false,
        inactive_since: null,
        last_qualifying_interaction_at: nowIso,
        inactivity_notified_15: false,
        inactivity_escalated_22: false,
        updatedAt: serverTimestamp(),
      });
      await syncMobileLookup({
        id: leadId,
        lead_code: existing.lead_code,
        mobile: existing.mobile,
        customer_name: existing.customer_name,
        property_subtype: existing.property_subtype,
        transaction_type: existing.transaction_type,
        stage: targetStage.name,
        assigned_to: existing.assigned_to,
        assigned_to_name: existing.assigned_to_name || 'Assigned',
        is_deleted: existing.is_deleted === 1,
      });
      await writeTimeline(
        leadId,
        'Lead Reopened',
        `Closed lead reopened from "${existing.stage}" to "${targetStage.name}". Remarks: ${remarks}`,
        user
      );
      await writeAudit({
        entityType: 'lead',
        entityId: leadId,
        leadId,
        leadCode: existing.lead_code,
        leadAssignedToEmail: existing.assigned_to_email,
        actionType: 'Reopened',
        fieldName: 'stage',
        previousValue: existing.stage,
        newValue: targetStage.name,
        remarks,
        user,
      });
      const fresh = await getDoc(doc(db, 'leads', leadId));
      return { lead: mapLeadDoc(leadId, fresh.data() as Record<string, unknown>) } as T;
    }

    // DELETE /api/leads/:id (Soft Delete)
    if (!subAction && method === 'DELETE') {
      if (user.role !== 'super_admin') throw new Error('Super Admin required.');
      const snap = await getDoc(doc(db, 'leads', leadId));
      if (!snap.exists()) throw new Error('Lead not found.');
      const existing = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, 'leads', leadId), {
        is_deleted: true,
        deleted_at: nowIso,
        deleted_by: userUid,
        deleted_by_name: user.full_name,
        updatedAt: serverTimestamp(),
      });
      // Mark related activities deleted
      const actsSnap = await getDocs(query(collection(db, 'activities'), where('lead_id', '==', leadId)));
      for (const a of actsSnap.docs) {
        await updateDoc(a.ref, { lead_is_deleted: true, updatedAt: serverTimestamp() });
      }
      await syncMobileLookup({
        id: leadId,
        lead_code: existing.lead_code,
        mobile: existing.mobile,
        customer_name: existing.customer_name,
        property_subtype: existing.property_subtype,
        transaction_type: existing.transaction_type,
        stage: existing.stage,
        assigned_to: existing.assigned_to,
        assigned_to_name: existing.assigned_to_name || 'Assigned',
        is_deleted: true,
      });
      await writeTimeline(leadId, 'Soft Deleted', `Lead ${existing.lead_code} moved to Deleted Leads.`, user);
      await writeAudit({
        entityType: 'lead',
        entityId: leadId,
        leadId,
        leadCode: existing.lead_code,
        leadAssignedToEmail: existing.assigned_to_email,
        actionType: 'Deleted',
        fieldName: 'is_deleted',
        previousValue: '0',
        newValue: '1',
        user,
      });
      return { ok: true } as T;
    }

    // POST /api/leads/:id/restore
    if (subAction === 'restore' && method === 'POST') {
      if (user.role !== 'super_admin') throw new Error('Super Admin required.');
      const snap = await getDoc(doc(db, 'leads', leadId));
      if (!snap.exists()) throw new Error('Lead not found.');
      const existing = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);
      await updateDoc(doc(db, 'leads', leadId), {
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        deleted_by_name: null,
        updatedAt: serverTimestamp(),
      });
      const actsSnap = await getDocs(query(collection(db, 'activities'), where('lead_id', '==', leadId)));
      for (const a of actsSnap.docs) {
        await updateDoc(a.ref, { lead_is_deleted: false, updatedAt: serverTimestamp() });
      }
      await syncMobileLookup({
        id: leadId,
        lead_code: existing.lead_code,
        mobile: existing.mobile,
        customer_name: existing.customer_name,
        property_subtype: existing.property_subtype,
        transaction_type: existing.transaction_type,
        stage: existing.stage,
        assigned_to: existing.assigned_to,
        assigned_to_name: existing.assigned_to_name || 'Assigned',
        is_deleted: false,
      });
      await writeTimeline(leadId, 'Restored', `Lead ${existing.lead_code} restored from Deleted Leads.`, user);
      await writeAudit({
        entityType: 'lead',
        entityId: leadId,
        leadId,
        leadCode: existing.lead_code,
        leadAssignedToEmail: existing.assigned_to_email,
        actionType: 'Restored',
        fieldName: 'is_deleted',
        previousValue: '1',
        newValue: '0',
        user,
      });
      return { ok: true } as T;
    }

    // POST /api/leads/:id/activities
    if (subAction === 'activities' && method === 'POST') {
      const [snap, masters] = await Promise.all([getDoc(doc(db, 'leads', leadId)), fetchMasters()]);
      if (!snap.exists()) throw new Error('Lead not found.');
      const existing = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);
      if (existing.is_terminal_stage && user.role !== 'super_admin') {
        throw new Error('Cannot schedule activities on closed leads.');
      }
      const actType = String(body.activity_type || '');
      if (!['Follow-up Call', 'WhatsApp Follow-up', 'Site Visit', 'Meeting', 'Other'].includes(actType)) {
        throw new Error('Valid Activity Type is required.');
      }
      const scheduledDate = String(body.scheduled_date || '');
      const scheduledTime = String(body.scheduled_time || '');
      if (!scheduledDate || !scheduledTime) throw new Error('Activity Date and Time are required.');

      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      const desc = body.description ? String(body.description).trim() : null;
      const actId = uidGen('act');

      await setDoc(doc(db, 'activities', actId), {
        id: actId,
        lead_id: leadId,
        lead_code: existing.lead_code,
        customer_name: existing.customer_name.slice(0, 150),
        customer_mobile: existing.mobile,
        lead_stage: existing.stage,
        lead_is_deleted: existing.is_deleted === 1,
        activity_type: actType,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        scheduled_at: scheduledAt,
        assigned_to: existing.assigned_to,
        assigned_to_uid: existing.assigned_to_uid || null,
        assigned_to_email: existing.assigned_to_email || user.email.toLowerCase(),
        assigned_to_name: existing.assigned_to_name || user.full_name,
        description: desc ? desc.slice(0, 1000) : null,
        status: 'Pending',
        completed_by: null,
        completed_by_name: null,
        completed_at: null,
        completion_remarks: null,
        cancelled_by: null,
        cancelled_by_name: null,
        cancelled_at: null,
        cancel_reason: null,
        reschedule_count: 0,
        previous_schedule_history: [],
        reminded_30: false,
        reminded_15: false,
        reminded_overdue: false,
        created_by: userUid,
        created_by_name: user.full_name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await writeTimeline(
        leadId,
        'Activity Scheduled',
        `${actType} scheduled for ${scheduledDate} ${scheduledTime}${desc ? `: ${desc}` : ''}`,
        user
      );
      await writeAudit({
        entityType: 'activity',
        entityId: actId,
        leadId,
        leadCode: existing.lead_code,
        leadAssignedToEmail: existing.assigned_to_email,
        actionType: 'Created',
        fieldName: 'activity_type',
        newValue: `${actType} (${scheduledDate} ${scheduledTime})`,
        user,
      });
      await maybeAutoSyncStage(leadId, actType, 'scheduled', user, masters);
      return { id: actId } as T;
    }

    // POST /api/leads/:id/communications
    if (subAction === 'communications' && method === 'POST') {
      const snap = await getDoc(doc(db, 'leads', leadId));
      if (!snap.exists()) throw new Error('Lead not found.');
      const existing = mapLeadDoc(snap.id, snap.data() as Record<string, unknown>);

      const commType = String(body.comm_type || '');
      const validTypes = ['Call Completed', 'WhatsApp Message Sent', 'Customer Response Received', 'Discussion Summary', 'Next Action/Follow-up Remarks'];
      if (!validTypes.includes(commType)) throw new Error('Valid communication type is required.');
      const desc = String(body.description || '').trim();
      if (!desc) throw new Error('Communication description is required.');
      const nextAction = body.next_action_remarks ? String(body.next_action_remarks).trim() : null;

      const commId = uidGen('comm');
      await setDoc(doc(db, 'leads', leadId, 'communications', commId), {
        id: commId,
        lead_id: leadId,
        comm_type: commType,
        description: desc.slice(0, 2000),
        next_action_remarks: nextAction ? nextAction.slice(0, 1000) : null,
        employee_id: userUid,
        employee_name: user.full_name,
        createdAt: serverTimestamp(),
      });

      const nowIso = new Date().toISOString();
      if (commType === 'Customer Response Received' || commType === 'Call Completed' || commType === 'WhatsApp Message Sent') {
        await updateDoc(doc(db, 'leads', leadId), {
          is_inactive: false,
          inactive_since: null,
          last_qualifying_interaction_at: nowIso,
          last_interaction_type: commType,
          last_interaction_remarks: desc.slice(0, 1000),
          inactivity_notified_15: false,
          inactivity_escalated_22: false,
          updatedAt: serverTimestamp(),
        });
      }

      await writeTimeline(
        leadId,
        commType,
        `${commType}: ${desc}${nextAction ? ` (Next: ${nextAction})` : ''}`,
        user
      );
      await writeAudit({
        entityType: 'communication',
        entityId: commId,
        leadId,
        leadCode: existing.lead_code,
        leadAssignedToEmail: existing.assigned_to_email,
        actionType: 'Created',
        fieldName: 'comm_type',
        newValue: commType,
        remarks: desc,
        user,
      });
      return { id: commId } as T;
    }
  }

  // ---- ACTIVITIES (LIST, COMPLETE, CANCEL, RESCHEDULE) ----
  if (path === '/api/activities' && method === 'GET') {
    let acts = (await fetchAuthorizedActivities(user)).filter((a) => {
      // Exclude deleted leads for admin view too
      return true;
    });
    const leads = await fetchAuthorizedLeads(user);
    const activeLeadIds = new Set(leads.map((l) => l.id));
    acts = acts.filter((a) => activeLeadIds.has(a.lead_id));

    const empId = params.get('employeeId');
    if (user.role === 'super_admin' && empId && empId !== 'all') {
      acts = acts.filter((a) => a.assigned_to === empId || a.assigned_to_uid === empId);
    }
    const actType = params.get('activityType');
    if (actType && actType !== 'all') acts = acts.filter((a) => a.activity_type === actType);
    const status = params.get('status');
    if (status && status !== 'all') acts = acts.filter((a) => a.status === status);
    const startDate = params.get('startDate');
    if (startDate) acts = acts.filter((a) => a.scheduled_date >= startDate);
    const endDate = params.get('endDate');
    if (endDate) acts = acts.filter((a) => a.scheduled_date <= endDate);

    acts.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return { activities: acts } as T;
  }

  if (path.startsWith('/api/activities/') && method === 'PATCH') {
    const parts = path.split('/');
    const actId = parts[3];
    const action = parts[4];

    const snap = await getDoc(doc(db, 'activities', actId));
    if (!snap.exists()) throw new Error('Activity not found.');
    const raw = snap.data() as Record<string, unknown>;
    const act = mapActivityDoc(snap.id, raw);
    if (act.status !== 'Pending') throw new Error(`Cannot modify an activity that is already ${act.status}.`);
    const nowIso = new Date().toISOString();

    if (action === 'complete') {
      const remarks = body.completion_remarks ? String(body.completion_remarks).trim() : null;
      await updateDoc(doc(db, 'activities', actId), {
        status: 'Completed',
        completed_by: userUid,
        completed_by_name: user.full_name,
        completed_at: nowIso,
        completion_remarks: remarks ? remarks.slice(0, 1000) : null,
        updatedAt: serverTimestamp(),
      });
      if (['Follow-up Call', 'WhatsApp Follow-up', 'Site Visit', 'Meeting'].includes(act.activity_type)) {
        await updateDoc(doc(db, 'leads', act.lead_id), {
          is_inactive: false,
          inactive_since: null,
          last_qualifying_interaction_at: nowIso,
          last_interaction_type: `${act.activity_type} Completed`,
          last_interaction_remarks: (remarks || act.description || '').slice(0, 1000) || null,
          inactivity_notified_15: false,
          inactivity_escalated_22: false,
          updatedAt: serverTimestamp(),
        });
      }
      await writeTimeline(
        act.lead_id,
        'Activity Completed',
        `${act.activity_type} completed by ${user.full_name}${remarks ? ` — ${remarks}` : ''}`,
        user
      );
      await writeAudit({
        entityType: 'activity',
        entityId: actId,
        leadId: act.lead_id,
        leadCode: act.lead_code,
        leadAssignedToEmail: act.assigned_to_email,
        actionType: 'Updated',
        fieldName: 'status',
        previousValue: 'Pending',
        newValue: 'Completed',
        remarks,
        user,
      });
      const masters = await fetchMasters();
      await maybeAutoSyncStage(act.lead_id, act.activity_type, 'completed', user, masters);
      return { ok: true } as T;
    }

    if (action === 'cancel') {
      const reason = body.cancel_reason ? String(body.cancel_reason).trim() : null;
      await updateDoc(doc(db, 'activities', actId), {
        status: 'Cancelled',
        cancelled_by: userUid,
        cancelled_by_name: user.full_name,
        cancelled_at: nowIso,
        cancel_reason: reason ? reason.slice(0, 1000) : null,
        updatedAt: serverTimestamp(),
      });
      await writeTimeline(
        act.lead_id,
        'Activity Cancelled',
        `${act.activity_type} (${act.scheduled_date} ${act.scheduled_time}) cancelled${reason ? ` — ${reason}` : ''}. Stage unchanged.`,
        user
      );
      await writeAudit({
        entityType: 'activity',
        entityId: actId,
        leadId: act.lead_id,
        leadCode: act.lead_code,
        leadAssignedToEmail: act.assigned_to_email,
        actionType: 'Updated',
        fieldName: 'status',
        previousValue: 'Pending',
        newValue: 'Cancelled',
        remarks: reason,
        user,
      });
      return { ok: true } as T;
    }

    if (action === 'reschedule') {
      const scheduledDate = String(body.scheduled_date || '');
      const scheduledTime = String(body.scheduled_time || '');
      if (!scheduledDate || !scheduledTime) throw new Error('New date and time are required for rescheduling.');
      const prevHist = Array.isArray(raw.previous_schedule_history) ? [...(raw.previous_schedule_history as Array<unknown>)] : [];
      prevHist.push({
        scheduled_date: act.scheduled_date,
        scheduled_time: act.scheduled_time,
        rescheduled_at: nowIso,
        rescheduled_by: user.full_name,
      });
      const nextAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      await updateDoc(doc(db, 'activities', actId), {
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        scheduled_at: nextAt,
        description: body.description ? String(body.description).trim().slice(0, 1000) : act.description,
        reschedule_count: act.reschedule_count + 1,
        previous_schedule_history: prevHist.slice(-50),
        reminded_30: false,
        reminded_15: false,
        reminded_overdue: false,
        updatedAt: serverTimestamp(),
      });
      await writeTimeline(
        act.lead_id,
        'Activity Rescheduled',
        `${act.activity_type} rescheduled from ${act.scheduled_date} ${act.scheduled_time} to ${scheduledDate} ${scheduledTime}.`,
        user
      );
      await writeAudit({
        entityType: 'activity',
        entityId: actId,
        leadId: act.lead_id,
        leadCode: act.lead_code,
        leadAssignedToEmail: act.assigned_to_email,
        actionType: 'Updated',
        fieldName: 'scheduled_at',
        previousValue: `${act.scheduled_date} ${act.scheduled_time}`,
        newValue: `${scheduledDate} ${scheduledTime}`,
        remarks: 'Activity rescheduled',
        user,
      });
      return { ok: true } as T;
    }
  }

  // ---- DASHBOARD (PRD Section 10) ----
  if (path === '/api/dashboard' && method === 'GET') {
    const [team, masters, leadsAll, actsAll] = await Promise.all([
      fetchTeamMembers(user),
      fetchMasters(),
      fetchAuthorizedLeads(user),
      fetchAuthorizedActivities(user),
    ]);
    await evaluateInactivityAndReminders(user, team, leadsAll, actsAll);

    const { start, end } = resolveDateRange(
      params.get('datePreset') || 'all_time',
      params.get('customStart') || undefined,
      params.get('customEnd') || undefined
    );
    const empId = params.get('employeeId');
    const empFilter =
      user.role === 'sales_executive'
        ? user
        : empId && empId !== 'all'
        ? team.find((t) => t.id === empId || t.uid === empId) || null
        : null;

    const matchLeadOwner = (l: LeadRecord) =>
      !empFilter || l.assigned_to === empFilter.id || (l.assigned_to_email || '').toLowerCase() === empFilter.email.toLowerCase();
    const matchActOwner = (a: ActivityRecord) =>
      !empFilter || a.assigned_to === empFilter.id || (a.assigned_to_email || '').toLowerCase() === empFilter.email.toLowerCase();
    const matchDate = (iso: string) => (!start || iso >= start) && (!end || iso <= end);

    const nonDeleted = leadsAll.filter((l) => l.is_deleted === 0 && matchLeadOwner(l));
    const dateLeads = nonDeleted.filter((l) => matchDate(l.created_at));

    const totalLeads = dateLeads.length;
    const newLeads = dateLeads.filter((l) => l.stage === 'New Lead').length;
    const activeLeads = dateLeads.filter((l) => l.stage !== 'Booking Done' && l.stage !== 'Dead').length;
    const bookingDone = dateLeads.filter((l) => l.stage === 'Booking Done').length;
    const deadLeads = dateLeads.filter((l) => l.stage === 'Dead').length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const activeLeadIds = new Set(nonDeleted.map((l) => l.id));
    const scopedActs = actsAll.filter((a) => activeLeadIds.has(a.lead_id) && matchActOwner(a));

    const stages = masters
      .filter((m) => m.category === 'lead_stage' && m.is_active === 1)
      .sort((a, b) => a.sort_order - b.sort_order);
    const stageDistribution = stages.map((st) => ({
      name: st.name,
      count: dateLeads.filter((l) => l.stage === st.name).length,
    }));

    const sourceMap = new Map<string, number>();
    for (const l of dateLeads) sourceMap.set(l.lead_source, (sourceMap.get(l.lead_source) || 0) + 1);
    const sourceDistribution = Array.from(sourceMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const todaysActivities = scopedActs
      .filter((a) => a.status === 'Pending' && a.scheduled_date === todayStr)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      .slice(0, 15);
    const overdueActivities = scopedActs
      .filter((a) => a.status === 'Pending' && a.scheduled_at < nowIso)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      .slice(0, 15);
    const upcomingVisitsAndMeetings = scopedActs
      .filter((a) => a.status === 'Pending' && (a.activity_type === 'Site Visit' || a.activity_type === 'Meeting') && a.scheduled_at >= nowIso)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      .slice(0, 8);

    const employeeAllocation =
      user.role === 'super_admin'
        ? team
            .filter((u) => u.status === 'active')
            .map((e) => {
              const eLeads = dateLeads.filter(
                (l) => l.assigned_to === e.id || (l.assigned_to_email || '').toLowerCase() === e.email.toLowerCase()
              );
              return {
                id: e.id,
                full_name: e.full_name,
                designation: e.designation,
                total_leads: eLeads.length,
                active_leads: eLeads.filter((l) => l.stage !== 'Booking Done' && l.stage !== 'Dead').length,
                won_leads: eLeads.filter((l) => l.stage === 'Booking Done').length,
              };
            })
        : [];

    const inactiveLeads = nonDeleted
      .filter((l) => l.is_inactive === 1)
      .sort((a, b) => a.last_qualifying_interaction_at.localeCompare(b.last_qualifying_interaction_at))
      .slice(0, 20)
      .map((l) => ({
        id: l.id,
        lead_code: l.lead_code,
        customer_name: l.customer_name,
        mobile: l.mobile,
        stage: l.stage,
        last_qualifying_interaction_at: l.last_qualifying_interaction_at,
        last_interaction_type: l.last_interaction_type,
        assigned_to_name: l.assigned_to_name || '',
      }));

    const leadById = new Map(leadsAll.map((l) => [l.id, l]));
    let recentActivity: Array<{
      id: string;
      lead_id: string;
      lead_code: string;
      customer_name: string;
      event_type: string;
      description: string;
      employee_name: string;
      created_at: string;
    }> = [];
    if (user.role === 'super_admin') {
      const alSnap = await getDocs(collection(db, 'auditLogs'));
      recentActivity = alSnap.docs
        .map((d) => {
          const r = d.data() as Record<string, unknown>;
          const lid = r.lead_id ? String(r.lead_id) : '';
          const matchedLead = lid ? leadById.get(lid) : undefined;
          const desc = r.field_name
            ? `${String(r.action_type || '')} ${String(r.field_name)}${r.new_value ? ` → ${String(r.new_value)}` : ''}`
            : String(r.action_type || '');
          return {
            id: d.id,
            lead_id: lid,
            lead_code: String(r.lead_code || matchedLead?.lead_code || ''),
            customer_name: matchedLead?.customer_name || String(r.entity_type || 'System'),
            event_type: String(r.action_type || ''),
            description: desc,
            employee_name: String(r.employee_name || 'System'),
            created_at: tsToIso(r.createdAt),
          };
        })
        .filter((x) => Boolean(x.lead_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 12);
    }

    const recentlyUpdatedLeads = [...nonDeleted]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 10);

    return {
      cards: {
        totalLeads,
        newLeads,
        activeLeads,
        bookingDone,
        deadLeads,
      },
      sourceDistribution,
      stageDistribution,
      employeeAllocation,
      todaysActivities,
      overdueActivities,
      upcomingVisitsAndMeetings,
      inactiveLeads,
      recentActivity,
      recentlyUpdatedLeads,
    } as T;
  }

  // ---- REPORTS ----
  if (path.startsWith('/api/reports/') && method === 'GET') {
    const reportType = path.split('/')[3];
    const [team, masters, leadsAll, actsAll, batchesSnap] = await Promise.all([
      fetchTeamMembers(user),
      fetchMasters(),
      fetchAuthorizedLeads(user, { deleted: true }),
      fetchAuthorizedActivities(user),
      user.role === 'super_admin' ? getDocs(collection(db, 'importBatches')) : Promise.resolve(null),
    ]);
    const batches: ImportBatchRecord[] = batchesSnap
      ? batchesSnap.docs.map((d) => {
          const r = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            batch_ref: String(r.batch_ref || ''),
            filename: String(r.filename || ''),
            uploaded_by: String(r.uploaded_by || ''),
            uploaded_by_name: String(r.uploaded_by_name || ''),
            total_count: Number(r.total_count || 0),
            success_count: Number(r.success_count || 0),
            skipped_count: Number(r.skipped_count || 0),
            failed_count: Number(r.failed_count || 0),
            decisions: (r.decisions as ImportBatchRecord['decisions']) || [],
            errors: (r.errors as ImportBatchRecord['errors']) || [],
            created_at: tsToIso(r.createdAt),
          };
        })
      : [];

    return buildReportData(reportType, user, params, leadsAll, actsAll, masters, team, batches) as T;
  }

  // ---- IMPORT PREVIEW / COMMIT / HISTORY ----
  if (path === '/api/import/history' && method === 'GET') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const snap = await getDocs(collection(db, 'importBatches'));
    const batches: ImportBatchRecord[] = snap.docs
      .map((d) => {
        const r = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          batch_ref: String(r.batch_ref || '').split('#')[0],
          filename: String(r.filename || ''),
          uploaded_by: String(r.uploaded_by || ''),
          uploaded_by_name: String(r.uploaded_by_name || ''),
          total_count: Number(r.total_count || 0),
          success_count: Number(r.success_count || 0),
          skipped_count: Number(r.skipped_count || 0),
          failed_count: Number(r.failed_count || 0),
          decisions: (r.decisions as ImportBatchRecord['decisions']) || [],
          errors: (r.errors as ImportBatchRecord['errors']) || [],
          created_at: tsToIso(r.createdAt),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { batches } as T;
  }

  if (path === '/api/import/preview' && method === 'POST') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const parsedRows = await parseSpreadsheetBase64Client(String(body.fileBase64 || ''), String(body.filename || 'import.xlsx'));
    if (parsedRows.length === 0) {
      throw new Error('No data rows found in the uploaded file.');
    }

    const [masters, team] = await Promise.all([fetchMasters(), fetchTeamMembers(user)]);
    const batchRef = body.retryBatchRef
      ? String(body.retryBatchRef).trim()
      : `IMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const rows = await validateAndNormalizeImportRows(parsedRows, masters, team);
    return { batchRef, filename: String(body.filename || 'import.xlsx'), rows } as T;
  }

  if (path === '/api/import/commit' && method === 'POST') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const batchRef = String(body.batchRef || '');
    const filename = String(body.filename || 'import.xlsx');
    const rawRows = Array.isArray(body.rawRows) ? (body.rawRows as Array<Record<string, string>>) : [];
    const decisionsMap = (body.duplicateDecisions || {}) as Record<string, 'skip' | 'separate'>;

    // Duplicate retry guard via fingerprint
    const existingBatches = await getDocs(collection(db, 'importBatches'));
    const fingerprint = `${batchRef}:${rawRows.length}:${rawRows.slice(0, 3).map((r) => r['Mobile']).join(',')}`;
    if (existingBatches.docs.some((d) => d.data().batch_ref === `${batchRef}#${fingerprint}`)) {
      throw new Error('This exact import batch was already committed. Duplicate retry blocked.');
    }

    const [masters, team] = await Promise.all([fetchMasters(), fetchTeamMembers(user)]);
    const validated = await validateAndNormalizeImportRows(rawRows, masters, team);

    const rowsToInsert = validated.filter((row) => {
      if (!row.isValid) return false;
      if (row.duplicates.length > 0 && (decisionsMap[String(row.rowNumber)] || 'skip') === 'skip') return false;
      return true;
    });

    const codes = rowsToInsert.length > 0 ? await allocateLeadCodes(rowsToInsert.length, user) : [];
    let codeCursor = 0;

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const recordedDecisions: ImportBatchRecord['decisions'] = [];
    const errorRows: ImportBatchRecord['errors'] = [];
    const notifyCounts = new Map<string, { uid: string | null; email: string; count: number }>();
    const nowIso = new Date().toISOString();

    for (const row of validated) {
      if (!row.isValid) {
        failedCount++;
        errorRows.push({
          rowNumber: row.rowNumber,
          customerName: String(row.normalized.customer_name || ''),
          mobile: String(row.normalized.mobile || ''),
          errors: row.errors,
          raw: row.raw,
        });
        continue;
      }

      if (row.duplicates.length > 0) {
        const decision = decisionsMap[String(row.rowNumber)] || 'skip';
        recordedDecisions.push({
          rowNumber: row.rowNumber,
          mobile: String(row.normalized.mobile || ''),
          customerName: String(row.normalized.customer_name || ''),
          decision,
          matchedLeadCodes: row.duplicates.map((d) => d.lead_code),
        });
        if (decision === 'skip') {
          skippedCount++;
          continue;
        }
      }

      const n = row.normalized;
      const leadCode = codes[codeCursor++];
      const leadId = leadCode.replace('-', '_');
      const assigneeEmail = String(n.assigned_to_email || '').toLowerCase();
      const assigneeId = String(n.assigned_to || '');
      const assigneeUid = n.assigned_to_uid ? String(n.assigned_to_uid) : null;
      const assigneeName = String(n.assigned_to_name || '');

      await setDoc(doc(db, 'leads', leadId), {
        id: leadId,
        lead_code: leadCode,
        customer_name: String(n.customer_name).slice(0, 150),
        mobile: String(n.mobile),
        alternate_mobile: n.alternate_mobile ? String(n.alternate_mobile) : null,
        whatsapp: n.whatsapp ? String(n.whatsapp) : null,
        email: n.email ? String(n.email) : null,
        company_name: n.company_name ? String(n.company_name).slice(0, 150) : null,
        customer_remarks: null,
        lead_source: String(n.lead_source),
        property_type: String(n.property_type),
        property_subtype: String(n.property_subtype),
        transaction_type: String(n.transaction_type),
        localities: (n.localities as string[]).slice(0, 30),
        budget_from: n.budget_from ?? null,
        budget_to: n.budget_to ?? null,
        min_area: n.min_area ?? null,
        max_area: n.max_area ?? null,
        area_unit: n.area_unit ?? null,
        bhk_config: n.bhk_config ?? null,
        commercial_config: null,
        furnishing_type: null,
        preferred_floor: null,
        possession_pref: null,
        required_workstations: null,
        required_cabins: null,
        requirement_remarks: n.requirement_remarks ? String(n.requirement_remarks).slice(0, 2000) : null,
        stage: 'New Lead',
        is_terminal_stage: false,
        created_by: userUid,
        created_by_name: user.full_name,
        assigned_to: assigneeId,
        assigned_to_uid: assigneeUid,
        assigned_to_email: assigneeEmail,
        assigned_to_name: assigneeName,
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        deleted_by_name: null,
        is_inactive: false,
        inactive_since: null,
        last_qualifying_interaction_at: nowIso,
        last_interaction_type: null,
        last_interaction_remarks: null,
        inactivity_notified_15: false,
        inactivity_escalated_22: false,
        booking_date: null,
        booking_project_name: null,
        final_transaction_amount: null,
        brokerage_amount: null,
        brokerage_percentage: null,
        payment_status: null,
        booking_remarks: null,
        dead_reason: null,
        dead_remarks: null,
        dead_by: null,
        dead_by_name: null,
        dead_at: null,
        import_batch_ref: batchRef,
        created_date_iso: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await syncMobileLookup({
        id: leadId,
        lead_code: leadCode,
        mobile: String(n.mobile),
        customer_name: String(n.customer_name),
        property_subtype: String(n.property_subtype),
        transaction_type: String(n.transaction_type),
        stage: 'New Lead',
        assigned_to: assigneeId,
        assigned_to_name: assigneeName,
        is_deleted: false,
      });

      await writeTimeline(leadId, 'Lead Imported', `Imported via Excel/CSV batch ${batchRef} (${filename}).`, user);
      await writeAudit({
        entityType: 'lead',
        entityId: leadId,
        leadId,
        leadCode,
        leadAssignedToEmail: assigneeEmail,
        actionType: 'Created',
        fieldName: 'import_batch_ref',
        newValue: batchRef,
        remarks: `Imported from ${filename}`,
        user,
      });

      const curNotify = notifyCounts.get(assigneeEmail) || { uid: assigneeUid, email: assigneeEmail, count: 0 };
      curNotify.count += 1;
      notifyCounts.set(assigneeEmail, curNotify);
      successCount++;
    }

    for (const item of notifyCounts.values()) {
      if (item.email !== user.email.toLowerCase()) {
        await createNotificationDoc({
          userUid: item.uid,
          userEmail: item.email,
          notifType: 'New Lead Assigned',
          title: `${item.count} Imported Lead(s) Assigned`,
          message: `${item.count} new lead(s) from import batch ${batchRef} were assigned to you.`,
        });
      }
    }

    const batchId = uidGen('imp');
    await setDoc(doc(db, 'importBatches', batchId), {
      id: batchId,
      batch_ref: `${batchRef}#${fingerprint}`.slice(0, 80),
      filename: filename.slice(0, 200),
      uploaded_by: userUid,
      uploaded_by_name: user.full_name,
      total_count: validated.length,
      success_count: successCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      decisions: recordedDecisions.slice(0, 500),
      errors: errorRows.slice(0, 500),
      createdAt: serverTimestamp(),
    });

    return {
      batchRef,
      total: validated.length,
      successCount,
      skippedCount,
      failedCount,
      errors: errorRows,
    } as T;
  }

  // ---- AUDIT, EXPORT LOGS, LOGIN HISTORY ----
  if (path === '/api/audit-logs' && method === 'GET') {
    const snap =
      user.role === 'super_admin'
        ? await getDocs(collection(db, 'auditLogs'))
        : await getDocs(query(collection(db, 'auditLogs'), where('lead_assigned_to_email', '==', user.email.toLowerCase())));
    const logs: AuditLogEntry[] = snap.docs
      .map((d) => {
        const r = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          entity_type: String(r.entity_type || ''),
          entity_id: String(r.entity_id || ''),
          lead_id: r.lead_id ? String(r.lead_id) : null,
          lead_code: r.lead_code ? String(r.lead_code) : null,
          action_type: String(r.action_type || ''),
          field_name: r.field_name ? String(r.field_name) : null,
          previous_value: r.previous_value ? String(r.previous_value) : null,
          new_value: r.new_value ? String(r.new_value) : null,
          remarks: r.remarks ? String(r.remarks) : null,
          employee_id: r.employee_id ? String(r.employee_id) : null,
          employee_name: String(r.employee_name || 'System'),
          created_at: tsToIso(r.createdAt),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 200);
    return { logs } as T;
  }

  if (path === '/api/export-logs' && method === 'GET') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const snap = await getDocs(collection(db, 'exportLogs'));
    const logs = snap.docs
      .map((d) => {
        const r = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          employee_id: String(r.employee_id || ''),
          employee_name: String(r.employee_name || ''),
          format: String(r.format || 'xlsx'),
          export_mode: String(r.export_mode || 'basic'),
          record_count: Number(r.record_count || 0),
          created_at: tsToIso(r.createdAt),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100);
    return { logs } as T;
  }

  if (path === '/api/login-history' && method === 'GET') {
    if (user.role !== 'super_admin') throw new Error('Super Admin required.');
    const [snap, team] = await Promise.all([getDocs(collection(db, 'loginLogs')), fetchTeamMembers(user)]);
    const byEmail = new Map(team.map((u) => [u.email.toLowerCase(), u.full_name]));
    const history = snap.docs
      .map((d) => {
        const r = d.data() as Record<string, unknown>;
        const email = String(r.email || '').toLowerCase();
        const evType = String(r.event_type || '');
        const details = r.details ? String(r.details) : '';
        return {
          id: d.id,
          user_id: String(r.user_uid || ''),
          email,
          employee_name: byEmail.get(email) || email,
          event_type: evType,
          status: evType.includes('blocked') ? 'blocked' : 'success',
          reason: details,
          details,
          created_at: tsToIso(r.createdAt),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 150);
    return { history } as T;
  }

  throw new Error(`Unsupported CRM operation: ${method} ${path}`);
}

export async function dispatchCrmDownload(
  url: string,
  filename: string,
  options: RequestInit,
  currentUser: UserProfile | null
): Promise<void> {
  if (!currentUser) throw new Error('Authentication required.');
  const { path, params } = parseUrl(url);
  const body = options.body && typeof options.body === 'string' ? (JSON.parse(options.body) as Record<string, unknown>) : {};

  if (path === '/api/import/template') {
    const fmt = params.get('format') === 'csv' ? 'csv' : 'xlsx';
    const blob = await generateImportTemplateBlob(fmt);
    triggerBlobDownload(blob, filename);
    return;
  }

  if (path === '/api/import/error-report') {
    const list = Array.isArray(body.errors) ? (body.errors as Array<Record<string, unknown>>) : [];
    const fmt = body.format === 'csv' ? 'csv' : 'xlsx';
    const headers = [
      'Row #', 'Error Reasons', 'Customer Name', 'Mobile', 'Alternate Mobile', 'WhatsApp', 'Email', 'Company',
      'Lead Source', 'Property Type', 'Property Subtype', 'Transaction Type', 'Localities', 'Budget From',
      'Budget To', 'BHK', 'Min Area', 'Max Area', 'Area Unit', 'Assigned Employee', 'Remarks',
    ];
    const rows = list.map((item) => {
      const raw = (item.raw || {}) as Record<string, string>;
      const errs = Array.isArray(item.errors) ? item.errors.join(' | ') : '';
      return [
        Number(item.rowNumber || 0), errs, raw['Customer Name'] || '', raw['Mobile'] || '', raw['Alternate Mobile'] || '',
        raw['WhatsApp'] || '', raw['Email'] || '', raw['Company'] || '', raw['Lead Source'] || '', raw['Property Type'] || '',
        raw['Property Subtype'] || '', raw['Transaction Type'] || '', raw['Localities'] || '', raw['Budget From'] || '',
        raw['Budget To'] || '', raw['BHK'] || '', raw['Min Area'] || '', raw['Max Area'] || '', raw['Area Unit'] || '',
        raw['Assigned Employee'] || '', raw['Remarks'] || '',
      ];
    });
    const blob = await buildSpreadsheetBlob('Import Errors', headers, rows, fmt);
    triggerBlobDownload(blob, filename);
    return;
  }

  if (path === '/api/export/report') {
    const reportType = params.get('type') || 'lead-source';
    const fmt = params.get('format') === 'csv' ? 'csv' : 'xlsx';
    const payload = await dispatchCrmRequest<{ title: string; columns: string[]; rows: Array<Array<string | number | null>> }>(
      `/api/reports/${reportType}?${params.toString()}`,
      { method: 'GET' },
      currentUser
    );
    const blob = await buildSpreadsheetBlob(payload.title, payload.columns, payload.rows, fmt);
    const logId = uidGen('exp');
    await setDoc(doc(db, 'exportLogs', logId), {
      id: logId,
      employee_id: currentUser.uid || currentUser.id,
      employee_name: currentUser.full_name,
      format: fmt,
      export_mode: `report:${reportType}`,
      record_count: payload.rows.length,
      createdAt: serverTimestamp(),
    });
    triggerBlobDownload(blob, filename);
    return;
  }

  if (path === '/api/export/leads') {
    const fmt = params.get('format') === 'csv' ? 'csv' : 'xlsx';
    const mode = params.get('mode') === 'detailed' ? 'detailed' : 'basic';
    const leadsAll = await fetchAuthorizedLeads(currentUser, { deleted: params.get('deleted') === 'true' });
    const mapped = filterAndSortLeads(leadsAll, params, currentUser);

    let headers: string[] = [];
    let dataRows: Array<Array<string | number | null>> = [];
    if (mode === 'basic') {
      headers = ['Lead ID', 'Customer Name', 'Mobile', 'Email', 'Lead Source', 'Requirement', 'Localities', 'Stage', 'Assigned Employee', 'Creation Date'];
      dataRows = mapped.map((l) => [
        l.lead_code, l.customer_name, l.mobile, l.email || '', l.lead_source,
        [l.bhk_config, l.property_type, l.property_subtype, l.transaction_type].filter(Boolean).join(' · '),
        l.localities.join(', '), l.stage, l.assigned_to_name || '', l.created_at.slice(0, 10),
      ]);
    } else {
      const acts = await fetchAuthorizedActivities(currentUser);
      const actCounts = new Map<string, number>();
      for (const a of acts) actCounts.set(a.lead_id, (actCounts.get(a.lead_id) || 0) + 1);
      headers = [
        'Lead ID', 'Customer Name', 'Mobile', 'Alternate Mobile', 'WhatsApp', 'Email', 'Company', 'Lead Source',
        'Property Type', 'Property Subtype', 'Transaction Type', 'Localities', 'Budget From (INR)', 'Budget To (INR)',
        'Min Area', 'Max Area', 'Area Unit', 'BHK / Config', 'Furnishing', 'Possession', 'Stage', 'Inactive',
        'Assigned To', 'Created By', 'Created Date', 'Booking Date', 'Booking Project', 'Transaction Amount (INR)',
        'Brokerage (INR)', 'Payment Status', 'Dead Reason', 'Dead Remarks', 'Activity Summary',
      ];
      dataRows = mapped.map((l) => [
        l.lead_code, l.customer_name, l.mobile, l.alternate_mobile || '', l.whatsapp || '', l.email || '',
        l.company_name || '', l.lead_source, l.property_type, l.property_subtype, l.transaction_type,
        l.localities.join(', '), l.budget_from, l.budget_to, l.min_area, l.max_area, l.area_unit || '',
        l.bhk_config || l.commercial_config || '', l.furnishing_type || '', l.possession_pref || '', l.stage,
        l.is_inactive ? `Yes (${l.inactive_days}d)` : 'No', l.assigned_to_name || '', l.created_by_name || '',
        l.created_at.slice(0, 10), l.booking_date || '', l.booking_project_name || '', l.final_transaction_amount,
        l.brokerage_amount, l.payment_status || '', l.dead_reason || '', l.dead_remarks || '',
        `${actCounts.get(l.id) || 0} activities`,
      ]);
    }

    const blob = await buildSpreadsheetBlob('SSM CRM Leads', headers, dataRows, fmt);
    const logId = uidGen('exp');
    await setDoc(doc(db, 'exportLogs', logId), {
      id: logId,
      employee_id: currentUser.uid || currentUser.id,
      employee_name: currentUser.full_name,
      format: fmt,
      export_mode: mode,
      record_count: dataRows.length,
      createdAt: serverTimestamp(),
    });
    triggerBlobDownload(blob, filename);
    return;
  }

  throw new Error(`Unsupported download path: ${path}`);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}
