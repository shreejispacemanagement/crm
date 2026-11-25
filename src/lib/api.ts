import type { UserProfile } from '../types.ts';
import { dispatchCrmDownload, dispatchCrmRequest } from './crmService.ts';

let currentCrmUser: UserProfile | null = null;
let onUnauthorizedCallback: ((reason?: string) => void) | null = null;

export function setCurrentCrmUser(user: UserProfile | null) {
  currentCrmUser = user;
}

export function getCurrentCrmUser(): UserProfile | null {
  return currentCrmUser;
}

export function setOnUnauthorized(cb: (reason?: string) => void) {
  onUnauthorizedCallback = cb;
}

export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  if (!currentCrmUser) {
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback('Authentication required.');
    }
    throw new Error('Authentication required.');
  }
  try {
    return await dispatchCrmRequest<T>(url, options, currentCrmUser);
  } catch (err) {
    const msg = (err as Error).message || 'Request failed';
    if (msg === 'Authentication required.' && onUnauthorizedCallback) {
      onUnauthorizedCallback(msg);
    }
    throw err;
  }
}

export async function apiDownload(url: string, filename: string, options: RequestInit = {}): Promise<void> {
  if (!currentCrmUser) {
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback('Authentication required.');
    }
    throw new Error('Authentication required.');
  }
  await dispatchCrmDownload(url, filename, options, currentCrmUser);
}

export function formatINR(amount: number | null | undefined, compact = false): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  if (compact) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2).replace(/\.00$/, '')} L`;
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatBudgetRange(from: number | null, to: number | null): string {
  if (from === null && to === null) return '—';
  if (from !== null && to !== null) return `${formatINR(from, true)} – ${formatINR(to, true)}`;
  if (from !== null) return `From ${formatINR(from, true)}`;
  return `Up to ${formatINR(to, true)}`;
}

export function formatAmountInWords(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '';
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(num) || num <= 0) return '';

  if (num >= 10000000) {
    const cr = num / 10000000;
    const formatted = cr % 1 === 0 ? cr.toString() : cr.toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} ${cr === 1 ? 'Crore' : 'Crores'}`;
  }
  if (num >= 100000) {
    const lakh = num / 100000;
    const formatted = lakh % 1 === 0 ? lakh.toString() : lakh.toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} ${lakh === 1 ? 'Lakh' : 'Lakhs'}`;
  }
  if (num >= 1000) {
    const th = num / 1000;
    const formatted = th % 1 === 0 ? th.toString() : th.toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} Thousand`;
  }
  return num.toLocaleString('en-IN');
}

export interface BudgetOption {
  value: number;
  label: string;
}

export function generateBudgetOptions(transactionType: string): BudgetOption[] {
  const isRent = String(transactionType).trim().toLowerCase() === 'rent';
  const options: BudgetOption[] = [];

  if (isRent) {
    // Rent: 30,000 to 20 Lakh
    // In thousands: 30,000 to 1,00,000 with gap of 10,000
    for (let v = 30000; v <= 100000; v += 10000) {
      options.push({
        value: v,
        label: `₹${v.toLocaleString('en-IN')} (${formatAmountInWords(v)})`,
      });
    }
    // In lakhs: 1,50,000 to 20,00,000 with gap of 50k
    for (let v = 150000; v <= 2000000; v += 50000) {
      options.push({
        value: v,
        label: `₹${v.toLocaleString('en-IN')} (${formatAmountInWords(v)})`,
      });
    }
  } else {
    // Sale: 30 Lakh to 20 Crore
    // In lakhs: 30 Lakh to 1 Crore with gap of 5 Lakhs
    for (let v = 3000000; v <= 10000000; v += 500000) {
      options.push({
        value: v,
        label: `₹${v.toLocaleString('en-IN')} (${formatAmountInWords(v)})`,
      });
    }
    // In crores: 1.25 Crore to 20 Crore with gap of 25 Lakhs
    for (let v = 12500000; v <= 200000000; v += 2500000) {
      options.push({
        value: v,
        label: `₹${v.toLocaleString('en-IN')} (${formatAmountInWords(v)})`,
      });
    }
  }

  return options;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
