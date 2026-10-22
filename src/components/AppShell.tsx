import { LayoutDashboard, ListChecks, LogOut, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { DISCLAIMER } from '../lib/constants';
import { Logo } from './Logo';

// Only routes that exist are listed. Each new module adds its entry here.
const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/quiz', label: 'Quizzes', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function initials(name: string, email?: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return (email ?? '?').charAt(0).toUpperCase();
  return (parts[0].charAt(0) + (parts[1]?.charAt(0) ?? '')).toUpperCase();
}

export function AppShell() {
  const { profile, user, signOut } = useAuth();
  const name = profile?.display_name?.trim() || 'Learner';
  const avatar = initials(profile?.display_name ?? '', user?.email);

  return (
    <div className="min-h-dvh bg-[#d6e2d9] lg:p-5">
      <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col overflow-hidden bg-canvas lg:min-h-[calc(100dvh-2.5rem)] lg:flex-row lg:rounded-4xl lg:shadow-card">
        {/* Phone and tablet header */}
        <header className="on-dark flex items-center justify-between bg-forest px-5 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden">
          <Logo onDark />
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-full bg-forest-600 text-sm font-bold text-white ring-2 ring-lime"
            >
              {avatar}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Log out"
              className="grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        {/* Desktop sidebar: the active item is canvas-coloured so it merges into the content area */}
        <aside className="on-dark hidden w-64 shrink-0 flex-col bg-forest text-white lg:flex">
          <div className="px-6 pt-7">
            <Logo onDark />
          </div>
          <div className="mx-4 mt-6 rounded-3xl bg-white/5 px-4 pb-5 pt-6 text-center">
            <div
              aria-hidden
              className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-forest-600 text-2xl font-bold ring-4 ring-lime"
            >
              {avatar}
            </div>
            <p className="mt-4 truncate text-sm font-bold uppercase tracking-wide">{name}</p>
            <p className="truncate text-xs text-white/70">{user?.email}</p>
          </div>
          <nav aria-label="Main" className="mt-8 flex-1">
            <ul className="space-y-1 pl-5">
              {NAV.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-l-full py-3 pl-5 pr-4 text-[13px] font-semibold uppercase tracking-wide transition-colors ${
                        isActive ? 'bg-canvas text-forest' : 'text-white/85 hover:bg-white/10'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            onClick={() => void signOut()}
            className="m-5 flex items-center gap-3 rounded-full px-5 py-3 text-[13px] font-semibold uppercase tracking-wide text-white/85 hover:bg-white/10"
          >
            <LogOut className="h-5 w-5" aria-hidden />
            Log out
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 p-5 pb-6 sm:p-8">
            <Outlet />
          </main>
          <footer className="px-5 pb-28 text-xs leading-relaxed text-muted sm:px-8 lg:pb-6">{DISCLAIMER}</footer>
        </div>
      </div>

      {/* Phone bottom navigation */}
      <nav
        aria-label="Main"
        className="on-dark fixed inset-x-0 bottom-0 z-20 flex bg-forest pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-3 text-xs font-semibold ${
                isActive ? 'text-lime' : 'text-white/80'
              }`
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
