# SSM CRM Security Specification (Phase 0)

## 1. Data Invariants
1. **Authenticated & Verified Only**: Every database read or write requires a verified Google Firebase Auth user (`request.auth != null && request.auth.token.email_verified == true`).
2. **Invite-Only Onboarding**: Public registration is forbidden. A user can create `/users/{uid}` only if they are the bootstrapped owner (`shreejispacemanagement@gmail.com`) or possess an active `/employeeInvites/{inviteId}` matching their verified Google email, and their `role` and `status` must strictly match the invite.
3. **PII Isolation**: Employee PII (`/users/{uid}` containing email and mobile) is readable only by the user themselves or a Super Admin. Colleague assignment labels use `/employeeDirectory/{entryId}` (non-PII).
4. **Role & Ownership Enforcement**: Sales Executives can only read, list, and update non-deleted, non-terminal leads assigned to them (`assigned_to_uid == request.auth.uid || assigned_to_email == authEmail()`). They cannot delete leads, reopen closed leads, reassign leads, modify masters, import batches, or view other employees' leads.
5. **Terminal State Locking**: Once a lead reaches `Booking Done` or `Dead` (`is_terminal_stage == true`), Sales Executives cannot update the lead or schedule/modify activities on it; only Super Admins can edit or reopen it.
6. **Sequential Lead IDs & Audit Immutability**: `settings/workspace.lead_seq` increments strictly monotonically by `+1`. Audit logs, login logs, and timeline events are append-only (`update` and `delete` forbidden).
7. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`; `createdAt` is immutable on update.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Lead Read**: Read `/leads/SSM_000001` with `auth: null`.
2. **Unverified Email Admin Spoof**: Write `/leads` with `email: "shreejispacemanagement@gmail.com"` and `email_verified: false`.
3. **Self-Assigned Super Admin on Signup**: Create `/users/{uid}` with `role: "super_admin"` without a matching `super_admin` invite.
4. **Role Privilege Escalation on Profile Update**: Sales Executive updates `/users/{ownUid}` adding `role: "super_admin"` or `status: "active"`.
5. **Shadow Field Injection on Lead**: Create or update `/leads/{id}` with an undocumented ghost field `{ isAdminOverride: true }`.
6. **Cross-Executive Lead Snooping (Get & List)**: Sales Executive A attempts `get(/leads/{leadOwnedByB})` or `list(/leads)` without `where('assigned_to_email', '==', emailA)`.
7. **PII Directory Scrape**: Sales Executive queries `/users` collection or reads `/users/{otherUid}`.
8. **Closed-Lead Tampering**: Sales Executive updates a lead whose `is_terminal_stage == true` (`Booking Done` or `Dead`).
9. **Sales Exec Lead Reassignment or Soft Delete**: Sales Executive updates `assigned_to_email` or `is_deleted: true` on a lead.
10. **Audit Log Tampering**: Any user (including Super Admin) attempts to `update` or `delete` `/auditLogs/{logId}`.
11. **ID Poisoning / Resource Exhaustion**: Write document with 500-char ID or 50-item `localities` array or >2000-char remarks.
12. **Client Timestamp Forgery**: Create or update a document with a backdated `createdAt` or `updatedAt != request.time`.
