import React from 'react';
import type { CompanySettings } from '../types.ts';

interface BrandMarkProps {
  settings: CompanySettings;
  compact?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ settings, compact = false }) => {
  const rawLogo = settings.company_logo || './assets/aistudio/image_b871e6e7.png';
  const logoSrc = rawLogo.startsWith('/assets/') ? `.${rawLogo}` : rawLogo;

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-white p-1 border border-[#E2E8F0] dark:border-[#1E3349] flex items-center justify-center overflow-hidden shadow-xs">
        <img
          src={logoSrc}
          alt={settings.company_name || 'Shreeji Space'}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
      </div>
      {!compact && (
        <div className="flex flex-col min-w-0 leading-tight">
          <span className="font-bold text-xs tracking-wider text-[#16273A] dark:text-white uppercase truncate">
            {settings.short_name || 'Shreeji Space'}
          </span>
          <span className="text-[10px] font-semibold text-[#C99B56] tracking-wide truncate">
            Management CRM
          </span>
        </div>
      )}
    </div>
  );
};
