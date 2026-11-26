import { type User, signOut } from 'firebase/auth';
import { LogOut, Moon, Sun } from 'lucide-react';
import React, { useState } from 'react';
import { signInWithGooglePopup } from '../lib/crmAuth.ts';
import { bootstrapFirebaseWorkspace } from '../lib/crmSeed.ts';
import { auth } from '../lib/firebase.ts';
import type { CompanySettings, ThemeMode } from '../types.ts';
import { BrandMark } from './BrandMark.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface AuthScreenProps {
  bootstrapUser: User | null;
  settings: CompanySettings;
  theme: ThemeMode;
  onToggleTheme: () => void;
  sessionNotice: string | null;
  onClearSessionNotice: () => void;
  onBootstrapComplete: () => Promise<void>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  bootstrapUser,
  settings,
  theme,
  onToggleTheme,
  sessionNotice,
  onClearSessionNotice,
  onBootstrapComplete,
}) => {
  const [fullName, setFullName] = useState(bootstrapUser?.displayName || 'Shreeji Admin');
  const [mobile, setMobile] = useState('9825000001');
  const [includeSampleData, setIncludeSampleData] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    onClearSessionNotice();
    setLoading(true);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was closed before completion.');
      } else {
        setError((err as Error).message || 'Google sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bootstrapUser) return;
    if (!/^[6-9][0-9]{9}$/.test(mobile.trim())) {
      setError('Please enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await bootstrapFirebaseWorkspace({
        uid: bootstrapUser.uid,
        email: bootstrapUser.email || '',
        full_name: fullName.trim() || 'Shreeji Admin',
        mobile: mobile.trim(),
        include_sample_data: includeSampleData,
      });
      await onBootstrapComplete();
    } catch (err) {
      setError((err as Error).message || 'Failed to initialize workspace.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    setError(null);
    onClearSessionNotice();
    await signOut(auth);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0C141E]">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E3349] bg-white dark:bg-[#121E2C]">
        <BrandMark settings={settings} />
        <div className="flex items-center gap-3">
          <PWAInstallButton />
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] p-2 text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-[#FBF6EE] dark:hover:bg-[#1A2C40] transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-[#C99B56]" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-8 dark:border-[#1E3349] dark:bg-[#121E2C]">
          <div className="mb-6">
            <div className="flex justify-center mb-5">
              <div className="p-3 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-center">
                <img
                  src={(settings.company_logo || './assets/aistudio/image_b871e6e7.png').replace(/^\/assets\//, './assets/')}
                  alt={settings.company_name || 'Shreeji Space'}
                  referrerPolicy="no-referrer"
                  className="h-16 w-auto object-contain"
                />
              </div>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#16273A] dark:text-white text-balance">
              {bootstrapUser ? 'Initialize Shreeji Space Management CRM' : settings.company_name}
            </h1>
            <p className="mt-1.5 text-sm text-[#525252] dark:text-[#A3A3A3]">
              {bootstrapUser
                ? 'Complete the Super Admin workspace setup for your internal Ahmedabad real estate operations.'
                : 'Internal Lead Management & Sales Operations · Ahmedabad, Gujarat'}
            </p>
          </div>

          {sessionNotice && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {sessionNotice}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-600/30 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          {bootstrapUser ? (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1.5">
                  Verified Super Admin Google Email
                </label>
                <input
                  type="email"
                  readOnly
                  value={bootstrapUser.email || ''}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#525252] dark:border-[#1E3349] dark:bg-[#0F1926] dark:text-[#A3A3A3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1.5">
                    Super Admin Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#16273A] focus:border-[#C99B56] focus:outline-none dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1.5">
                    10-Digit Mobile
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular text-[#16273A] focus:border-[#C99B56] focus:outline-none dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 dark:border-[#1E3349] dark:bg-[#0F1926]">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSampleData}
                    onChange={(e) => setIncludeSampleData(e.target.checked)}
                    className="mt-0.5 accent-[#C99B56]"
                  />
                  <span className="text-xs text-[#262626] dark:text-[#E5E5E5]">
                    <strong>Load Ahmedabad Sample Workspace</strong>
                    <span className="block text-[#737373] dark:text-[#A3A3A3] mt-0.5">
                      Seeds 3 Sales Executive profiles (Aarav Patel, Priya Shah, Rohan Mehta) and 8 realistic leads across stages, site visits, bookings, and inactivity alerts.
                    </span>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#16273A] py-2.5 text-sm font-semibold text-white hover:bg-[#20364F] disabled:opacity-50 dark:bg-[#C99B56] dark:text-[#16273A] dark:hover:bg-[#C99B56] transition-colors"
              >
                {loading ? 'Initializing Workspace...' : 'Initialize Workspace & Launch CRM'}
              </button>

              <button
                type="button"
                onClick={handleSwitchAccount}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#737373] hover:text-[#16273A] dark:hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" /> Use a different Google account
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 rounded-lg bg-[#16273A] py-2.5 px-4 text-sm font-semibold text-white hover:bg-[#20364F] disabled:opacity-50 dark:bg-[#C99B56] dark:text-[#16273A] dark:hover:bg-[#C99B56] transition-colors"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.98h5.27c-.23 1.24-.92 2.29-1.96 2.99v2.48h3.17c1.86-1.71 2.93-4.23 2.93-7.21 0-.65-.06-1.28-.24-1.24z"
                  />
                  <path
                    fill="currentColor"
                    d="M12.18 21.5c2.65 0 4.88-.88 6.51-2.38l-3.17-2.48c-.88.59-2 0.94-3.34.94-2.57 0-4.75-1.73-5.53-4.07H3.38v2.55c1.62 3.22 4.95 5.44 8.8 5.44z"
                  />
                  <path
                    fill="currentColor"
                    d="M6.65 13.51a5.88 5.88 0 0 1 0-3.77V7.19H3.38a9.89 9.89 0 0 0 0 8.87l3.27-2.55z"
                  />
                  <path
                    fill="currentColor"
                    d="M12.18 5.67c1.44 0 2.74.5 3.76 1.47l2.82-2.82C17.05 2.72 14.83 1.75 12.18 1.75c-3.85 0-7.18 2.22-8.8 5.44l3.27 2.55c.78-2.34 2.96-4.07 5.53-4.07z"
                  />
                </svg>
                {loading ? 'Connecting to Google...' : 'Continue with Google'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
