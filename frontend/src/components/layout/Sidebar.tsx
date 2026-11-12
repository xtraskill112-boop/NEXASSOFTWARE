import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { Permission } from '@/lib/types';
import { useLowStockAlerts } from '@/lib/queries';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission?: Permission;
  anyOf?: Permission[];
  badge?: 'lowStock';
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-[18px]" />, permission: 'dashboard:view' }],
  },
  {
    title: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: <Package className="size-[18px]" />, permission: 'products:view' },
      { to: '/warehouses', label: 'Warehouses', icon: <Warehouse className="size-[18px]" />, permission: 'warehouses:view' },
      { to: '/inventory/operations', label: 'Stock Operations', icon: <ArrowLeftRight className="size-[18px]" />, anyOf: ['inventory:stock-in', 'inventory:stock-out', 'inventory:transfer'] },
      { to: '/inventory/movements', label: 'Movement History', icon: <History className="size-[18px]" />, permission: 'inventory:view' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/reports/low-stock', label: 'Low-Stock Report', icon: <TriangleAlert className="size-[18px]" />, permission: 'reports:view', badge: 'lowStock' },
      { to: '/audit-logs', label: 'Audit Logs', icon: <ClipboardList className="size-[18px]" />, permission: 'audit:view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'User Management', icon: <Users className="size-[18px]" />, permission: 'users:manage' },
      { to: '/profile', label: 'My Profile', icon: <UserCog className="size-[18px]" /> },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can, user } = useAuth();
  const lowStock = useLowStockAlerts(can('reports:view'));
  const lowCount = lowStock.data?.summary.totalItems ?? 0;

  const visible = (item: NavItem) =>
    (!item.permission || can(item.permission)) && (!item.anyOf || item.anyOf.some((p) => can(p)));

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 text-slate-300 transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-white/5 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/40">
              <Boxes className="size-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight text-white">StockSense</p>
              <p className="text-[11px] text-slate-400">Kaveri Distributors</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden" aria-label="Close navigation">
            <X className="size-5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {sections.map((section) => {
            const items = section.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={section.title}>
                <p className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.08em] text-slate-500 uppercase">{section.title}</p>
                <ul className="space-y-0.5">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          clsx(
                            'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive ? 'bg-white/[0.08] text-white shadow-[inset_2px_0_0_var(--color-brand-400)]' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
                          )
                        }
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge === 'lowStock' && lowCount > 0 && (
                          <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-300 tabular" aria-label={`${lowCount} low-stock products`}>
                            {lowCount}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-4">
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
            <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 text-[11px] leading-tight">
              <p className="truncate text-slate-300">Signed in as {user?.role === 'ADMIN' ? 'Administrator' : user?.role === 'MANAGER' ? 'Manager' : 'Staff'}</p>
              <p className="text-slate-500">Project NX-2026-014</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
