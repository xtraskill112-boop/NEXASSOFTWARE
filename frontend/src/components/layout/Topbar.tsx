import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Sun, TriangleAlert, UserCog, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useLowStockAlerts } from '@/lib/queries';
import { formatNumber, initials, roleLabel } from '@/lib/format';

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [onOutside]);
  return ref;
}

function Notifications() {
  const { can } = useAuth();
  const enabled = can('reports:view');
  const { data, isLoading } = useLowStockAlerts(enabled);
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  if (!enabled) return null;

  const items = data?.data ?? [];
  const count = items.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-3 hover:text-ink"
        aria-label={`Notifications${count ? `, ${count} stock alerts` : ''}`}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-[var(--status-critical)] px-1 text-[10px] leading-4 font-bold text-white ring-2 ring-surface">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-slide-up overflow-hidden shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Stock alerts</p>
            {data && (
              <span className="text-xs text-ink-3">
                {data.summary.outOfStock} out · {data.summary.lowStock} low
              </span>
            )}
          </div>
          <ul className="scrollbar-thin max-h-80 divide-y divide-line overflow-y-auto">
            {isLoading && <li className="px-4 py-6 text-center text-sm text-ink-3">Loading alerts…</li>}
            {!isLoading && count === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">All products are above their reorder levels.</li>}
            {items.slice(0, 8).map((i) => (
              <li key={i.productId}>
                <Link to={`/products?search=${encodeURIComponent(i.sku)}`} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                  {i.status === 'OUT_OF_STOCK' ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--status-critical)]" aria-label="Out of stock" />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" aria-label="Low stock" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{i.name}</p>
                    <p className="text-xs text-ink-3">
                      {i.sku} · {i.status === 'OUT_OF_STOCK' ? 'Out of stock' : `${formatNumber(i.quantity)} left`} · reorder at {formatNumber(i.reorderLevel)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/reports/low-stock" onClick={() => setOpen(false)} className="block border-t border-line bg-surface-2 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
            View full low-stock report
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  if (!user) return null;

  const signOut = async () => {
    setOpen(false);
    const ok = await confirm({ title: 'Sign out?', message: 'You will need to sign in again to access StockSense.', confirmLabel: 'Sign out', tone: 'primary' });
    if (!ok) return;
    await logout();
    toast.info('Signed out', 'You have been signed out securely.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 hover:bg-surface-3" aria-expanded={open} aria-haspopup="menu">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">{initials(user.name)}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-medium text-ink">{user.name}</span>
          <span className="block text-xs text-ink-3">{roleLabel[user.role]}</span>
        </span>
        <ChevronDown className="hidden size-4 text-ink-3 md:block" />
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-60 animate-slide-up overflow-hidden py-1 shadow-xl" role="menu">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-3">{user.email}</p>
          </div>
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            <UserCog className="size-4" /> My profile & password
          </Link>
          <button type="button" role="menuitem" onClick={signOut} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-[var(--status-critical)] hover:bg-surface-2">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { theme, toggle } = useTheme();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
    setQ('');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      <button type="button" onClick={onMenu} className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-3 lg:hidden" aria-label="Open navigation">
        <Menu className="size-5" />
      </button>

      {can('products:view') && (
        <form onSubmit={submit} className="relative hidden max-w-md flex-1 sm:block" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products by name, SKU or category…"
            aria-label="Search products"
            className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-brand-500 focus:bg-surface focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
          />
        </form>
      )}

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={toggle}
          className={clsx('inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-3 hover:text-ink')}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
        <Notifications />
        <div className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
