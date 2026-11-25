import { type User, signInWithPopup, signOut } from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { CompanySettings, UserProfile } from '../types.ts';
import { OperationType, auth, db, googleProvider, handleFirestoreError } from './firebase.ts';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'shreejispacemanagement@gmail.com';

export function tsToIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

export function mapUserDoc(docId: string, data: Record<string, unknown>): UserProfile {
  return {
    id: String(data.uid || docId),
    uid: String(data.uid || docId),
    email: String(data.email || ''),
    full_name: String(data.full_name || ''),
    mobile: String(data.mobile || ''),
    designation: String(data.designation || 'Property Consultant'),
    role: data.role === 'super_admin' ? 'super_admin' : 'sales_executive',
    status: data.status === 'inactive' ? 'inactive' : 'active',
    profile_photo: data.profile_photo ? String(data.profile_photo) : null,
    theme_preference: data.theme_preference === 'dark' ? 'dark' : 'light',
    lead_view_preference: data.lead_view_preference === 'kanban' ? 'kanban' : 'table',
    page_size_preference: Number(data.page_size_preference || 25),
    table_columns_preference: Array.isArray(data.table_columns_preference)
      ? (data.table_columns_preference as string[])
      : null,
    invite_id: data.invite_id ? String(data.invite_id) : null,
    created_at: tsToIso(data.createdAt),
    updated_at: tsToIso(data.updatedAt),
  };
}

export function mapSettingsDoc(data: Record<string, unknown> | undefined): CompanySettings {
  if (!data) {
    return {
      company_name: 'Shreeji Space Management CRM',
      short_name: 'SSM CRM',
      company_logo: null,
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
      lead_seq: 0,
    };
  }
  return {
    company_name: String(data.company_name || 'Shreeji Space Management CRM'),
    short_name: String(data.short_name || 'SSM CRM'),
    company_logo: data.company_logo ? String(data.company_logo) : null,
    default_table_columns: Array.isArray(data.default_table_columns) ? (data.default_table_columns as string[]) : [],
    lead_seq: Number(data.lead_seq || 0),
  };
}

let lastLoggedLoginUid: string | null = null;

async function writeLoginLog(
  uid: string,
  email: string,
  eventType: 'login_success' | 'login_blocked_inactive' | 'login_blocked_uninvited' | 'logout',
  details: string
): Promise<void> {
  const id = `login_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await setDoc(doc(db, 'loginLogs', id), {
      id,
      user_uid: uid,
      email: email.toLowerCase(),
      event_type: eventType,
      details: details.slice(0, 300),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Best-effort log (non-blocking if user isn't active yet)
  }
}

export async function signInWithGooglePopup(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export type SessionResolution =
  | { state: 'ready'; user: UserProfile; settings: CompanySettings }
  | { state: 'needs_bootstrap'; firebaseUser: User; settings: CompanySettings };

export async function resolveFirebaseSession(firebaseUser: User, isExplicitSignIn = false): Promise<SessionResolution> {
  const uid = firebaseUser.uid;
  const email = (firebaseUser.email || '').trim().toLowerCase();

  if (!email || !firebaseUser.emailVerified) {
    await signOut(auth);
    throw new Error('A verified Google email address is required to access SSM CRM.');
  }

  let settingsSnap;
  try {
    settingsSnap = await getDoc(doc(db, 'settings', 'workspace'));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'settings/workspace');
  }
  const settings = mapSettingsDoc(settingsSnap.exists() ? (settingsSnap.data() as Record<string, unknown>) : undefined);

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }

  if (userSnap.exists()) {
    const profile = mapUserDoc(uid, userSnap.data() as Record<string, unknown>);
    if (profile.status !== 'active') {
      await writeLoginLog(uid, email, 'login_blocked_inactive', 'Blocked inactive employee login attempt.');
      await signOut(auth);
      throw new Error('Your account is deactivated. Contact your Super Admin for access.');
    }
    if (profile.role === 'super_admin') {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', uid));
        if (!adminSnap.exists()) {
          await setDoc(doc(db, 'admins', uid), {
            uid,
            email,
            grantedBy: uid,
            createdAt: serverTimestamp(),
          });
        }
      } catch {
        // ignore if already present
      }
    }
    if (isExplicitSignIn || lastLoggedLoginUid !== uid) {
      lastLoggedLoginUid = uid;
      await writeLoginLog(uid, email, 'login_success', 'Signed in via Google Authentication.');
    }
    return { state: 'ready', user: profile, settings };
  }

  // First-run workspace check
  if (!settingsSnap.exists()) {
    if (email === BOOTSTRAPPED_ADMIN_EMAIL) {
      return { state: 'needs_bootstrap', firebaseUser, settings };
    }
    await signOut(auth);
    throw new Error(
      `Workspace is not initialized yet. Please ask the primary Super Admin (${BOOTSTRAPPED_ADMIN_EMAIL}) to sign in first.`
    );
  }

  // Workspace exists: look up employee invite by verified email
  let invDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
  try {
    const q = query(collection(db, 'employeeInvites'), where('email', '==', email));
    const snap = await getDocs(q);
    invDocs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'employeeInvites');
  }

  const activeInvite = invDocs.find((d) => d.data.status === 'active');
  if (activeInvite) {
    const inv = activeInvite.data;
    const role = inv.role === 'super_admin' ? 'super_admin' : 'sales_executive';
    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        email,
        full_name: String(inv.full_name || firebaseUser.displayName || email).slice(0, 120),
        mobile: String(inv.mobile || '').slice(0, 20),
        designation: String(inv.designation || 'Property Consultant').slice(0, 100),
        role,
        status: 'active',
        profile_photo: firebaseUser.photoURL || null,
        theme_preference: 'light',
        lead_view_preference: 'table',
        page_size_preference: 25,
        table_columns_preference: null,
        invite_id: activeInvite.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const b = writeBatch(db);
      if (role === 'super_admin') {
        b.set(doc(db, 'admins', uid), {
          uid,
          email,
          grantedBy: String(inv.createdBy || uid),
          createdAt: serverTimestamp(),
        });
      }
      if (!inv.claimed_uid) {
        b.update(doc(db, 'employeeInvites', activeInvite.id), {
          claimed_uid: uid,
          updatedAt: serverTimestamp(),
        });
      }
      b.update(doc(db, 'employeeDirectory', activeInvite.id), {
        uid,
        updatedAt: serverTimestamp(),
      });
      await b.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }

    const freshSnap = await getDoc(doc(db, 'users', uid));
    const profile = mapUserDoc(uid, freshSnap.data() as Record<string, unknown>);
    lastLoggedLoginUid = uid;
    await writeLoginLog(uid, email, 'login_success', 'First Google sign-in; claimed employee invitation.');
    return { state: 'ready', user: profile, settings };
  }

  // Fallback for bootstrapped admin if settings exist without their user doc
  if (email === BOOTSTRAPPED_ADMIN_EMAIL) {
    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        email,
        full_name: (firebaseUser.displayName || 'Shreeji Admin').slice(0, 120),
        mobile: '',
        designation: 'Principal Consultant & Admin',
        role: 'super_admin',
        status: 'active',
        profile_photo: firebaseUser.photoURL || null,
        theme_preference: 'light',
        lead_view_preference: 'table',
        page_size_preference: 25,
        table_columns_preference: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'admins', uid), {
        uid,
        email,
        grantedBy: uid,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'employeeDirectory', uid), {
        id: uid,
        uid,
        email_key: email,
        full_name: (firebaseUser.displayName || 'Shreeji Admin').slice(0, 120),
        designation: 'Principal Consultant & Admin',
        role: 'super_admin',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
    const freshSnap = await getDoc(doc(db, 'users', uid));
    const profile = mapUserDoc(uid, freshSnap.data() as Record<string, unknown>);
    lastLoggedLoginUid = uid;
    await writeLoginLog(uid, email, 'login_success', 'Signed in as bootstrapped Super Admin.');
    return { state: 'ready', user: profile, settings };
  }

  const inactiveInvite = invDocs.find((d) => d.data.status === 'inactive');
  await writeLoginLog(
    uid,
    email,
    inactiveInvite ? 'login_blocked_inactive' : 'login_blocked_uninvited',
    inactiveInvite ? 'Invited employee account is inactive.' : 'Uninvited Google account attempted sign-in.'
  );
  await signOut(auth);
  throw new Error(
    inactiveInvite
      ? 'Your employee account is deactivated. Contact your Super Admin.'
      : `Access restricted. "${email}" is not invited to SSM CRM. Ask your Super Admin to add your email under Team & Roles.`
  );
}

export async function signOutFirebase(user: UserProfile | null): Promise<void> {
  if (user) {
    await writeLoginLog(user.uid || user.id, user.email, 'logout', 'User signed out.');
  }
  lastLoggedLoginUid = null;
  await signOut(auth);
}
