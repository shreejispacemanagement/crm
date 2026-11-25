import { AlertTriangle, RefreshCw } from 'lucide-react';
import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let msg = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(msg) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        msg = `${parsed.error}${parsed.path ? ` (${parsed.operationType || 'operation'} on ${parsed.path})` : ''}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: msg };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8F6F1] p-6 dark:bg-[#111111]">
          <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-white p-6 text-center dark:bg-[#171717]">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-[#171717] dark:text-white">Something went wrong</h2>
            <p className="mt-2 text-xs text-[#525252] dark:text-[#A3A3A3] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#171717] px-4 py-2 text-xs font-semibold text-white dark:bg-[#B58A35] dark:text-[#171717]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
