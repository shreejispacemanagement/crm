import React from 'react';
import type { CompanySettings } from '../types.ts';

interface BrandMarkProps {
  settings: CompanySettings;
  compact?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ settings, compact = false }) => {
  if (settings.company_logo) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <img
          src={settings.company_logo}
          alt={settings.company_name}
          referrerPolicy="no-referrer"
          className="h-8 w-8 rounded-lg object-contain bg-white border border-[#E5DEC9] dark:border-[#2E2E2E] shrink-0"
        />
        {!compact && (
          <span className="font-semibold text-sm tracking-tight text-[#171717] dark:text-white truncate">
            {settings.short_name || 'SSM CRM'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#171717] border border-[#B58A35]/60 dark:bg-[#1E1E1E]">
        <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none">
          <path d="M7 22V13L16 6L25 13V22" stroke="#B58A35" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 22V15.5H20V22" stroke="#F3EBDD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 23.5H27" stroke="#B58A35" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      {!compact && (
        <span className="font-semibold text-sm tracking-tight text-[#171717] dark:text-white whitespace-nowrap truncate">
          {settings.short_name || 'SSM CRM'}
        </span>
      )}
    </div>
  );
};
