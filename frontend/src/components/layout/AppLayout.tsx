import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { StandaloneBanner } from './StandaloneBanner';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-full">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-h-full flex-col lg:pl-64">
        <StandaloneBanner />
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-ink-3 sm:px-6">
          StockSense Inventory Management v{import.meta.env.VITE_APP_VERSION} · Kaveri Distributors Pvt. Ltd. · NX-2026-014
        </footer>
      </div>
    </div>
  );
}
