import { BarChart3, Boxes, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Receipt, ShoppingBag, Shirt, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Shirt, end: false },
  { to: '/inventory', label: 'Inventory', icon: Boxes, end: false },
  { to: '/sales/new', label: 'Record Sale', icon: ShoppingBag, end: true },
  { to: '/sales', label: 'Sales History', icon: Receipt, end: true },
  { to: '/analytics', label: 'Analytics & Trends', icon: BarChart3, end: false },
];

const STORAGE_KEY = 'threadiq.sidebar.collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-16 items-center gap-2.5 px-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-700 font-display text-lg font-semibold text-paper" aria-hidden>
        T
      </span>
      {!collapsed && (
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold">ThreadIQ</p>
          <p className="text-[11px] text-muted">Inventory &amp; trends</p>
        </div>
      )}
    </div>
  );
}

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-1 px-2 py-2">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={collapsed ? label : undefined}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-sage-100 text-sage-800' : 'text-ink-soft hover:bg-sage-50',
              collapsed && 'justify-center px-2',
            )
          }
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden />
          <span className={cn(collapsed && 'sr-only')}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable: the preference just isn't remembered */
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] lg:flex', collapsed ? 'w-16' : 'w-64')}>
        <Brand collapsed={collapsed} />
        <NavItems collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="m-2 flex items-center justify-center gap-2 rounded-lg p-2 text-sm text-muted hover:bg-sage-50"
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden /> : <><PanelLeftClose className="h-5 w-5" aria-hidden /> Collapse</>}
        </button>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="rounded-md p-1.5 hover:bg-sage-100">
            <Menu className="h-6 w-6" aria-hidden />
          </button>
          <span className="font-display text-lg font-semibold">ThreadIQ</span>
          <span className="w-9" />
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
            <div className="relative flex h-full w-72 max-w-[85%] flex-col bg-surface shadow-pop">
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="absolute right-3 top-4 rounded-md p-1 hover:bg-sage-100">
                <X className="h-5 w-5" aria-hidden />
              </button>
              <Brand collapsed={false} />
              <NavItems collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
