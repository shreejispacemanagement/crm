import { Download, WifiOff } from 'lucide-react';
import React, { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#B58A35]/40 bg-[#F3EBDD] px-3 py-1.5 text-xs font-semibold text-[#171717] hover:bg-[#B58A35]/20 dark:border-[#B58A35]/40 dark:bg-[#221F1A] dark:text-[#F3EBDD] whitespace-nowrap shrink-0 transition-colors"
      >
        <Download className="h-3.5 w-3.5 text-[#B58A35]" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] px-3 py-1.5 text-xs font-medium text-[#171717] hover:bg-[#F3EBDD] dark:border-[#2E2E2E] dark:text-[#F3EBDD] dark:hover:bg-[#242424] whitespace-nowrap shrink-0 transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-[#B58A35]" />
          Install App
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[#E5DEC9] bg-white p-6 dark:border-[#2A2A2A] dark:bg-[#171717]">
              <h3 className="text-base font-semibold text-[#171717] dark:text-white">Install SSM CRM on iOS</h3>
              <p className="mt-2 text-sm text-[#525252] dark:text-[#A3A3A3]">
                1. Tap the <strong>Share</strong> button in the Safari toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-[#171717] py-2 text-sm font-medium text-white hover:bg-[#2E2E2E] dark:bg-[#B58A35] dark:text-[#171717]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OnlineOnlyBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="h-4 w-4" />
      <span>Internet connection lost. SSM CRM requires an active connection.</span>
    </div>
  );
};
