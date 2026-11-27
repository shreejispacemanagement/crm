import { Check, MessageCircle, Phone } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import type { LeadRecord } from '../types.ts';

interface LeadContactActionsProps {
  lead: LeadRecord;
  variant?: 'table' | 'kanban' | 'detail';
  onLogged?: () => void | Promise<void>;
  onError?: (message: string) => void;
}

function normalizeDialDigits(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

export const LeadContactActions: React.FC<LeadContactActionsProps> = ({
  lead,
  variant = 'table',
  onLogged,
  onError,
}) => {
  const [loggingType, setLoggingType] = useState<'call' | 'whatsapp' | null>(null);
  const [justLogged, setJustLogged] = useState<'call' | 'whatsapp' | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (lead.is_deleted === 1) return null;

  const callNumber = (lead.mobile || lead.alternate_mobile || '').trim();
  const whatsappNumber = (lead.whatsapp || lead.mobile || '').trim();
  const callDigits = normalizeDialDigits(callNumber);
  const whatsappDigits = normalizeDialDigits(whatsappNumber);

  if (!callDigits && !whatsappDigits) return null;

  const logContact = async (kind: 'call' | 'whatsapp', numberUsed: string) => {
    if (loggingType === kind) return;
    setLoggingType(kind);
    try {
      await apiFetch(`/api/leads/${lead.id}/communications`, {
        method: 'POST',
        body: JSON.stringify({
          comm_type: kind === 'call' ? 'Call Completed' : 'WhatsApp Message Sent',
          description:
            kind === 'call'
              ? `Initiated phone call to ${numberUsed} via CRM Call CTA.`
              : `Opened WhatsApp chat for ${numberUsed} via CRM WhatsApp CTA.`,
        }),
      });
      setJustLogged(kind);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setJustLogged(null), 2200);
      await onLogged?.();
    } catch (err) {
      onError?.((err as Error).message || 'Failed to log communication.');
    } finally {
      setLoggingType(null);
    }
  };

  const isKanban = variant === 'kanban';
  const isDetail = variant === 'detail';

  const callBtnClass = isDetail
    ? 'inline-flex items-center gap-1.5 rounded-lg border border-[#16273A]/20 bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[#16273A] hover:bg-[#E2E8F0] dark:border-[#2A435E] dark:bg-[#1A2C40] dark:text-[#F1F5F9] dark:hover:bg-[#243B55] transition-colors whitespace-nowrap'
    : isKanban
    ? 'inline-flex items-center justify-center rounded-md border border-[#16273A]/15 bg-[#F1F5F9] p-1 text-[#16273A] hover:bg-[#E2E8F0] dark:border-[#2A435E] dark:bg-[#1A2C40] dark:text-[#F1F5F9] dark:hover:bg-[#243B55] transition-colors shrink-0'
    : 'inline-flex items-center gap-1 rounded-md border border-[#16273A]/15 bg-[#F1F5F9] px-2 py-1 text-[11px] font-semibold text-[#16273A] hover:bg-[#E2E8F0] dark:border-[#2A435E] dark:bg-[#1A2C40] dark:text-[#F1F5F9] dark:hover:bg-[#243B55] transition-colors whitespace-nowrap shrink-0';

  const waBtnClass = isDetail
    ? 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/25 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap'
    : isKanban
    ? 'inline-flex items-center justify-center rounded-md border border-emerald-600/25 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition-colors shrink-0'
    : 'inline-flex items-center gap-1 rounded-md border border-emerald-600/25 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap shrink-0';

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      {callDigits && (
        <a
          href={`tel:+${callDigits}`}
          title={`Call ${callNumber} (logs call in CRM)`}
          aria-label={`Call ${lead.customer_name}`}
          onClick={(e) => {
            e.stopPropagation();
            void logContact('call', callNumber);
          }}
          className={callBtnClass}
        >
          {justLogged === 'call' ? (
            <Check className={isDetail ? 'h-3.5 w-3.5 text-emerald-600' : 'h-3 w-3 text-emerald-600'} />
          ) : (
            <Phone className={isDetail ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
          )}
          {!isKanban && <span>{justLogged === 'call' ? 'Logged' : 'Call'}</span>}
        </a>
      )}

      {whatsappDigits && (
        <a
          href={`https://wa.me/${whatsappDigits}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`WhatsApp ${whatsappNumber} (logs WhatsApp in CRM)`}
          aria-label={`WhatsApp ${lead.customer_name}`}
          onClick={(e) => {
            e.stopPropagation();
            void logContact('whatsapp', whatsappNumber);
          }}
          className={waBtnClass}
        >
          {justLogged === 'whatsapp' ? (
            <Check className={isDetail ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
          ) : (
            <MessageCircle className={isDetail ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
          )}
          {!isKanban && <span>{justLogged === 'whatsapp' ? 'Logged' : 'WhatsApp'}</span>}
        </a>
      )}
    </span>
  );
};
