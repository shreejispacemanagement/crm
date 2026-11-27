export type UserRole = 'super_admin' | 'sales_executive';
export type UserStatus = 'active' | 'inactive';
export type ThemeMode = 'light' | 'dark';
export type LeadViewMode = 'table' | 'kanban';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'custom'
  | 'all_time';

export type MasterCategory =
  | 'lead_source'
  | 'lead_stage'
  | 'property_type'
  | 'property_subtype'
  | 'transaction_type'
  | 'locality'
  | 'bhk_config'
  | 'dead_reason'
  | 'furnishing_type'
  | 'possession_pref';

export interface MasterItem {
  id: string;
  category: MasterCategory;
  name: string;
  parent_value: string | null;
  sort_order: number;
  is_active: number;
  is_terminal: number;
  terminal_outcome: 'won' | 'lost' | null;
  system_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  uid?: string | null;
  email: string;
  full_name: string;
  mobile: string;
  designation: string;
  role: UserRole;
  status: UserStatus;
  profile_photo: string | null;
  theme_preference: ThemeMode;
  lead_view_preference: LeadViewMode;
  page_size_preference: number;
  table_columns_preference: string[] | null;
  active_lead_count?: number;
  invite_id?: string | null;
  is_pending_claim?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanySettings {
  company_name: string;
  short_name: string;
  company_logo: string | null;
  default_table_columns: string[];
  lead_seq?: number;
}

export interface DuplicateMatch {
  id: string;
  lead_code: string;
  customer_name: string;
  mobile: string;
  requirement_summary: string;
  stage: string;
  assigned_to: string | null;
  assigned_to_name: string;
  is_deleted: number;
  created_at: string;
}

export interface LeadRecord {
  id: string;
  lead_code: string;
  customer_name: string;
  mobile: string;
  alternate_mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  company_name: string | null;
  customer_remarks: string | null;
  lead_source: string;
  property_type: string;
  property_subtype: string;
  transaction_type: string;
  localities: string[];
  budget_from: number | null;
  budget_to: number | null;
  min_area: number | null;
  max_area: number | null;
  area_unit: string | null;
  bhk_config: string | null;
  commercial_config: string | null;
  furnishing_type: string | null;
  preferred_floor: string | null;
  possession_pref: string | null;
  required_workstations: number | null;
  required_cabins: number | null;
  requirement_remarks: string | null;
  stage: string;
  is_terminal_stage?: boolean;
  created_by: string;
  created_by_name?: string;
  assigned_to: string;
  assigned_to_uid?: string | null;
  assigned_to_email?: string;
  assigned_to_name?: string;
  is_deleted: number;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name?: string | null;
  is_inactive: number;
  inactive_since: string | null;
  last_qualifying_interaction_at: string;
  last_interaction_type: string | null;
  last_interaction_remarks: string | null;
  inactive_days?: number;
  booking_date: string | null;
  booking_project_name: string | null;
  final_transaction_amount: number | null;
  brokerage_amount: number | null;
  brokerage_percentage: number | null;
  payment_status: 'Pending' | 'Partially Paid' | 'Paid' | null;
  booking_remarks: string | null;
  dead_reason: string | null;
  dead_remarks: string | null;
  dead_by: string | null;
  dead_by_name?: string | null;
  dead_at: string | null;
  import_batch_ref: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityType =
  | 'Follow-up Call'
  | 'WhatsApp Follow-up'
  | 'Site Visit'
  | 'Meeting'
  | 'Other';

export type ActivityStatus = 'Pending' | 'Completed' | 'Cancelled';

export interface ActivityRecord {
  id: string;
  lead_id: string;
  lead_code?: string;
  customer_name?: string;
  customer_mobile?: string;
  lead_stage?: string;
  activity_type: ActivityType;
  scheduled_date: string;
  scheduled_time: string;
  scheduled_at: string;
  assigned_to: string;
  assigned_to_uid?: string | null;
  assigned_to_email?: string;
  assigned_to_name?: string;
  description: string | null;
  status: ActivityStatus;
  is_overdue?: boolean;
  completed_by: string | null;
  completed_by_name?: string | null;
  completed_at: string | null;
  completion_remarks: string | null;
  cancelled_by: string | null;
  cancelled_by_name?: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  reschedule_count: number;
  previous_schedule_json: string | null;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export type CommunicationType =
  | 'Call Completed'
  | 'WhatsApp Message Sent'
  | 'Customer Response Received'
  | 'Discussion Summary'
  | 'Next Action/Follow-up Remarks';

export interface CommunicationRecord {
  id: string;
  lead_id: string;
  comm_type: CommunicationType;
  description: string;
  next_action_remarks: string | null;
  employee_id: string;
  employee_name: string;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  lead_id: string;
  event_type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  employee_id: string | null;
  employee_name: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  lead_id: string | null;
  lead_code?: string | null;
  action_type: string;
  field_name: string | null;
  previous_value: string | null;
  new_value: string | null;
  remarks: string | null;
  employee_id: string | null;
  employee_name: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  lead_id: string | null;
  lead_code?: string | null;
  activity_id: string | null;
  notif_type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

export interface ImportBatchRecord {
  id: string;
  batch_ref: string;
  filename: string;
  uploaded_by: string;
  uploaded_by_name: string;
  total_count: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
  decisions: Array<{
    rowNumber: number;
    mobile: string;
    customerName: string;
    decision: 'skip' | 'separate';
    matchedLeadCodes: string[];
  }>;
  errors: Array<{
    rowNumber: number;
    customerName: string;
    mobile: string;
    errors: string[];
    raw: Record<string, string>;
  }>;
  created_at: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: Record<string, unknown>;
  errors: string[];
  duplicates: DuplicateMatch[];
  isValid: boolean;
}

export const ALL_TABLE_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'lead_code', label: 'Lead ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'requirement', label: 'Property Requirement' },
  { key: 'localities', label: 'Localities' },
  { key: 'budget', label: 'Budget (INR)' },
  { key: 'stage', label: 'Stage' },
  { key: 'lead_source', label: 'Source' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'last_interaction', label: 'Last Interaction' },
  { key: 'created_at', label: 'Created Date' },
];

export const DEFAULT_TABLE_COLUMNS = [
  'lead_code',
  'customer_name',
  'mobile',
  'requirement',
  'localities',
  'budget',
  'stage',
  'assigned_to',
  'created_at',
];

export const AREA_UNITS = ['Sq. Ft.', 'Sq. Yards (Vaar)', 'Sq. Mtr.'] as const;
