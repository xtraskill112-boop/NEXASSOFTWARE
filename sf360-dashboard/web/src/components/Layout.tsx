import { NavLink, Outlet } from "react-router";
import { LayoutDashboard, PackagePlus, List, Truck, Undo2, Settings, LogOut, Upload, FlaskConical } from "lucide-react";
import { useAuth, useAppInfo } from "../auth";
import { cx } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/orders", label: "Orders", icon: List },
  { to: "/new", label: "New", icon: PackagePlus },
  { to: "/pickups", label: "Pickups", icon: Truck },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/bulk", label: "Bulk upload", icon: Upload, desktopOnly: true },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  const info = useAppInfo();
  const { logout } = useAuth();
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <p className="text-lg font-semibold text-ink">SF360 Dashboard</p>
          <p className="truncate text-xs text-ink-3" title={info.email}>
            {info.email}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx("flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium", isActive ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-subtle")
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <button type="button" onClick={() => void logout()} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-ink-2 hover:bg-subtle">
            <LogOut className="size-4" aria-hidden /> Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {info.env === "staging" && (
          <div className="no-print flex items-center justify-center gap-2 bg-warn-soft px-4 py-1.5 text-center text-xs font-medium text-warn">
            <FlaskConical className="size-3.5" aria-hidden />
            TEST MODE — connected to Shadowfax staging. Orders here are not real.
          </div>
        )}
        <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
          <p className="font-semibold">SF360 Dashboard</p>
          <button type="button" onClick={() => void logout()} className="rounded-md p-2 text-ink-3 hover:bg-subtle" aria-label="Log out">
            <LogOut className="size-5" />
          </button>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        {NAV.filter((n) => !n.desktopOnly).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive ? "text-brand" : "text-ink-3")}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
