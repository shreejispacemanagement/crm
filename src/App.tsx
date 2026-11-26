import { type User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  BarChart3,
  Bell,
  Calendar,
  Database,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AuditLogsView,
  DeletedLeadsView,
  MastersView,
  ProfileSettingsView,
  UsersView,
} from './components/AdminViews.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { BrandMark } from './components/BrandMark.tsx';
import { CalendarView } from './components/CalendarView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { ImportView } from './components/ImportView.tsx';
import { LeadDetailView } from './components/LeadDetailView.tsx';
import { LeadFormModal } from './components/LeadFormModal.tsx';
import { LeadsView } from './components/LeadsView.tsx';
import { OnlineOnlyBanner, PWAInstallButton } from './components/PWAInstallButton.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { apiFetch, formatDateTime, setCurrentCrmUser, setOnUnauthorized } from './lib/api.ts';
import { mapUserDoc, resolveFirebaseSession, signOutFirebase } from './lib/crmAuth.ts';
import { auth, db } from './lib/firebase.ts';
import type { CompanySettings, MasterItem, NotificationItem, ThemeMode, UserProfile } from './types.ts';

type NavSection =
  | 'dashboard'
  | 'leads'
  | 'calendar'
  | 'reports'
  | 'import'
  | 'masters'
  | 'users'
  | 'deleted'
  | 'audit'
  | 'profile';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export default function App() {
  const [bootLoading, setBootLoading] = useState(true);
  const [bootstrapFirebaseUser, setBootstrapFirebaseUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: 'Shreeji Space Management CRM',
    short_name: 'Shreeji Space',
    company_logo: './assets/aistudio/image_b871e6e7.png',
    default_table_columns: [],
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // App Data
  const [masters, setMasters] = useState<MasterItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Navigation & UI State
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [initialReportKey, setInitialReportKey] = useState<string | undefined>(undefined);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const inactivityTimerRef = useRef<number | null>(null);
  const activeUserRef = useRef<UserProfile | null>(null);
  activeUserRef.current = user;

  // Sync dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleLogout = useCallback(async (notice?: string) => {
    const current = activeUserRef.current;
    try {
      await signOutFirebase(current);
    } catch {
      // ignore if already signed out
    }
    setCurrentCrmUser(null);
    setUser(null);
    setBootstrapFirebaseUser(null);
    setSelectedLeadId(null);
    setActiveNav('dashboard');
    if (notice) setSessionNotice(notice);
  }, []);

  useEffect(() => {
    setOnUnauthorized((reason) => {
      setCurrentCrmUser(null);
      setUser(null);
      setBootstrapFirebaseUser(null);
      setSelectedLeadId(null);
      setSessionNotice(reason || 'Session expired due to inactivity. Please log in again.');
    });
  }, []);

  // 30-Minute Inactivity Timeout (PRD Section 20)
  useEffect(() => {
    if (!user) return;
    const resetTimer = () => {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = window.setTimeout(() => {
        handleLogout('Session expired after 30 minutes of inactivity. Please sign in again.');
      }, INACTIVITY_TIMEOUT_MS);
    };
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
    };
  }, [user, handleLogout]);

  // Firebase Auth Session Listener
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;
      if (!fbUser) {
        setCurrentCrmUser(null);
        setUser(null);
        setBootstrapFirebaseUser(null);
        setBootLoading(false);
        return;
      }

      try {
        const res = await resolveFirebaseSession(fbUser);
        if (!active) return;
        if (res.state === 'needs_bootstrap') {
          setCurrentCrmUser(null);
          setUser(null);
          setSettings(res.settings);
          setBootstrapFirebaseUser(res.firebaseUser);
          setSessionNotice(null);
        } else {
          setBootstrapFirebaseUser(null);
          setSettings(res.settings);
          setCurrentCrmUser(res.user);
          setUser(res.user);
          setTheme(res.user.theme_preference || 'light');
          setSessionNotice(null);
        }
      } catch (err) {
        if (!active) return;
        setCurrentCrmUser(null);
        setUser(null);
        setBootstrapFirebaseUser(null);
        setSessionNotice((err as Error).message || 'Unable to sign in.');
      } finally {
        if (active) setBootLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Live User Document Watch for Deactivation / Profile Sync
  const userUid = user?.uid || user?.id || null;
  useEffect(() => {
    if (!userUid) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', userUid),
      (snap) => {
        if (!snap.exists()) {
          handleLogout('Your account has been removed by Super Admin.');
          return;
        }
        const updated = mapUserDoc(snap.id, snap.data() as Record<string, unknown>);
        if (updated.status !== 'active') {
          handleLogout('Your account has been deactivated by Super Admin.');
          return;
        }
        setCurrentCrmUser(updated);
        setUser(updated);
        setTheme(updated.theme_preference || 'light');
      },
      () => {
        // ignore transient listener error on signout
      }
    );
    return () => unsubscribe();
  }, [userUid, handleLogout]);

  const loadWorkspaceMeta = useCallback(async () => {
    if (!activeUserRef.current) return;
    const [mRes, uRes, nRes, meRes] = await Promise.all([
      apiFetch<{ masters: MasterItem[] }>('/api/masters'),
      apiFetch<{ users: UserProfile[] }>('/api/users'),
      apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications'),
      apiFetch<{ user: UserProfile; settings: CompanySettings }>('/api/auth/me'),
    ]);
    setMasters(mRes.masters);
    setUsers(uRes.users);
    setNotifications(nRes.notifications);
    setUnreadCount(nRes.unreadCount);
    setSettings(meRes.settings);
  }, []);

  useEffect(() => {
    if (userUid) {
      loadWorkspaceMeta();
      const interval = window.setInterval(() => {
        if (!activeUserRef.current) return;
        apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications')
          .then((n) => {
            setNotifications(n.notifications);
            setUnreadCount(n.unreadCount);
          })
          .catch(() => {});
      }, 30000);
      return () => window.clearInterval(interval);
    }
  }, [userUid, loadWorkspaceMeta]);

  const handleToggleTheme = async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (user) {
      try {
        const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
          method: 'PATCH',
          body: JSON.stringify({ theme_preference: next }),
        });
        setCurrentCrmUser(res.user);
        setUser(res.user);
      } catch {
        // ignore
      }
    }
  };

  const openLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    setActiveNav('leads');
    setShowNotifPanel(false);
    setMobileMenuOpen(false);
  };

  const markNotifRead = async (n: NotificationItem) => {
    if (n.is_read === 0) {
      await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.lead_id) {
      openLead(n.lead_id);
    }
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((x) => ({ ...x, is_read: 1 })));
    setUnreadCount(0);
  };

  if (bootLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0C141E]">
        <div className="text-xs font-medium text-[#737373]">Loading Shreeji Space Management CRM...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          bootstrapUser={bootstrapFirebaseUser}
          settings={settings}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          sessionNotice={sessionNotice}
          onClearSessionNotice={() => setSessionNotice(null)}
          onBootstrapComplete={async () => {
            if (!auth.currentUser) return;
            const res = await resolveFirebaseSession(auth.currentUser, true);
            if (res.state === 'ready') {
              setBootstrapFirebaseUser(null);
              setSettings(res.settings);
              setCurrentCrmUser(res.user);
              setUser(res.user);
              setTheme(res.user.theme_preference || 'light');
              setSessionNotice(null);
            }
          }}
        />
        <OnlineOnlyBanner />
      </>
    );
  }

  const isAdmin = user.role === 'super_admin';

  const navItems: Array<{ key: NavSection; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: 'leads', label: 'Leads', icon: <Users className="h-4 w-4" /> },
    { key: 'calendar', label: 'Calendar', icon: <Calendar className="h-4 w-4" /> },
    { key: 'reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'import', label: 'Excel/CSV Import', icon: <FileSpreadsheet className="h-4 w-4" />, adminOnly: true },
    { key: 'masters', label: 'Masters', icon: <Database className="h-4 w-4" />, adminOnly: true },
    { key: 'users', label: 'Team & Roles', icon: <Users className="h-4 w-4" />, adminOnly: true },
    { key: 'deleted', label: 'Deleted Leads', icon: <Trash2 className="h-4 w-4" />, adminOnly: true },
    { key: 'audit', label: 'Audit & Logs', icon: <History className="h-4 w-4" /> },
    { key: 'profile', label: 'Profile & Settings', icon: <Settings className="h-4 w-4" /> },
  ];

  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  const navigateTo = (section: NavSection) => {
    setActiveNav(section);
    setSelectedLeadId(null);
    setMobileMenuOpen(false);
    if (section !== 'reports') setInitialReportKey(undefined);
  };

  const currentTitle = selectedLeadId
    ? 'Lead Details'
    : visibleNav.find((n) => n.key === activeNav)?.label || 'Dashboard';

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#16273A] dark:bg-[#0C141E] dark:text-[#F1F5F9]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#E2E8F0] bg-white dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="flex h-16 items-center px-5 border-b border-[#E2E8F0] dark:border-[#1E3349]">
          <BrandMark settings={settings} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const active = activeNav === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigateTo(item.key)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                    : 'text-[#404040] hover:bg-[#FBF6EE]/70 dark:text-[#D4D4D4] dark:hover:bg-[#1A2C40]'
                }`}
              >
                <span className={active ? 'text-[#C99B56] dark:text-[#16273A]' : 'text-[#737373]'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#E2E8F0] p-4 dark:border-[#1E3349]">
          <div className="flex items-center gap-2.5">
            {user.profile_photo ? (
              <img
                src={user.profile_photo}
                alt={user.full_name}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full object-cover border border-[#E2E8F0]"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FBF6EE] text-xs font-bold text-[#16273A]">
                {user.full_name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#16273A] dark:text-white truncate">{user.full_name}</div>
              <div className="text-[11px] text-[#737373] truncate">
                {isAdmin ? 'Super Admin' : 'Sales Executive'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleLogout()}
              title="Sign Out"
              className="rounded-lg p-1.5 text-[#737373] hover:bg-[#FBF6EE] hover:text-[#16273A] dark:hover:bg-[#1A2C40] dark:hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 w-64 max-w-[80vw] bg-white dark:bg-[#121E2C] flex flex-col h-full border-r border-[#E2E8F0] dark:border-[#1E3349]">
            <div className="flex h-16 items-center justify-between px-4 border-b border-[#E2E8F0] dark:border-[#1E3349]">
              <BrandMark settings={settings} />
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-[#737373]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {visibleNav.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateTo(item.key)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium ${
                    activeNav === item.key
                      ? 'bg-[#16273A] text-white dark:bg-[#C99B56] dark:text-[#16273A]'
                      : 'text-[#404040] dark:text-[#D4D4D4]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-[#E2E8F0] dark:border-[#1E3349]">
              <button
                type="button"
                onClick={() => handleLogout()}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] py-2 text-xs font-medium dark:border-[#1E3349]"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out ({user.full_name})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white/95 backdrop-blur px-4 sm:px-6 dark:border-[#1E3349] dark:bg-[#121E2C]/95">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg border border-[#E2E8F0] p-1.5 text-[#16273A] dark:border-[#1E3349] dark:text-white"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-xs text-[#737373] dark:text-[#A3A3A3] truncate">
              <span>{settings.short_name || 'SSM CRM'}</span>
              <span className="mx-1.5">/</span>
              <span className="font-semibold text-[#16273A] dark:text-white">{currentTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton />

            {/* Notification Bell (PRD 13) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                className="relative inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] p-2 text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-white dark:hover:bg-[#1A2C40]"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C99B56] px-1 text-[10px] font-bold font-mono-tabular text-[#16273A]">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifPanel && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[#E2E8F0] bg-white shadow-xl z-40 dark:border-[#1E3349] dark:bg-[#121E2C]">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E3349]">
                    <span className="text-xs font-semibold text-[#16273A] dark:text-white">
                      In-App Notifications ({unreadCount} unread)
                    </span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-[11px] font-semibold text-[#C99B56] hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-[#E2E8F0]/60 dark:divide-[#1E3349]">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#737373]">No notifications yet.</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => markNotifRead(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-[#FBF6EE]/40 dark:hover:bg-[#1A2C40] ${
                            n.is_read === 0 ? 'bg-[#FBF6EE]/30 dark:bg-[#2A2318]/50' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-semibold text-[#C99B56]">{n.notif_type}</span>
                            <span className="font-mono-tabular text-[#737373]">{formatDateTime(n.created_at)}</span>
                          </div>
                          <div className="mt-0.5 text-xs font-medium text-[#16273A] dark:text-white">{n.title}</div>
                          <div className="mt-0.5 text-[11px] text-[#525252] dark:text-[#A3A3A3]">{n.message}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleToggleTheme}
              className="inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] p-2 text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-white dark:hover:bg-[#1A2C40]"
              aria-label="Toggle Light/Dark mode"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-[#C99B56]" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowCreateLead(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#16273A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#20364F] dark:bg-[#C99B56] dark:text-[#16273A] whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> New Lead
            </button>
          </div>
        </header>

        {/* Active View Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeNav === 'dashboard' && (
            <DashboardView
              user={user}
              onOpenLead={openLead}
              onCreateLead={() => setShowCreateLead(true)}
              onOpenInactiveReport={() => {
                setInitialReportKey('inactive-leads');
                setActiveNav('reports');
              }}
            />
          )}

          {activeNav === 'leads' && !selectedLeadId && (
            <LeadsView
              user={user}
              users={users}
              masters={masters}
              settings={settings}
              onUserUpdated={(updated) => {
                setCurrentCrmUser(updated);
                setUser(updated);
              }}
              onSettingsUpdated={setSettings}
              onOpenLead={openLead}
              onCreateLead={() => setShowCreateLead(true)}
              refreshSignal={refreshSignal}
            />
          )}

          {activeNav === 'leads' && selectedLeadId && (
            <LeadDetailView
              leadId={selectedLeadId}
              user={user}
              users={users}
              masters={masters}
              onBack={() => setSelectedLeadId(null)}
              onOpenLead={openLead}
              onMutated={() => {
                setRefreshSignal((s) => s + 1);
                loadWorkspaceMeta();
              }}
            />
          )}

          {activeNav === 'calendar' && <CalendarView user={user} users={users} onOpenLead={openLead} />}

          {activeNav === 'reports' && (
            <ReportsView user={user} users={users} initialReport={initialReportKey} />
          )}

          {activeNav === 'import' && isAdmin && (
            <ImportView
              onImported={() => {
                setRefreshSignal((s) => s + 1);
                loadWorkspaceMeta();
              }}
            />
          )}

          {activeNav === 'masters' && isAdmin && (
            <MastersView masters={masters} onRefresh={loadWorkspaceMeta} />
          )}

          {activeNav === 'users' && isAdmin && (
            <UsersView currentUser={user} users={users} onRefresh={loadWorkspaceMeta} />
          )}

          {activeNav === 'deleted' && isAdmin && (
            <DeletedLeadsView
              onOpenLead={openLead}
              onRestored={() => {
                setRefreshSignal((s) => s + 1);
                loadWorkspaceMeta();
              }}
            />
          )}

          {activeNav === 'audit' && <AuditLogsView user={user} onOpenLead={openLead} />}

          {activeNav === 'profile' && (
            <ProfileSettingsView
              user={user}
              settings={settings}
              onUserUpdated={(updated) => {
                setCurrentCrmUser(updated);
                setUser(updated);
              }}
              onSettingsUpdated={setSettings}
            />
          )}
        </main>
      </div>

      {showCreateLead && (
        <LeadFormModal
          currentUser={user}
          users={users}
          masters={masters}
          onClose={() => setShowCreateLead(false)}
          onCreated={(leadId) => {
            setShowCreateLead(false);
            setRefreshSignal((s) => s + 1);
            loadWorkspaceMeta();
            openLead(leadId);
          }}
          onOpenExistingLead={(leadId) => {
            setShowCreateLead(false);
            openLead(leadId);
          }}
        />
      )}

      <OnlineOnlyBanner />
    </div>
  );
}
