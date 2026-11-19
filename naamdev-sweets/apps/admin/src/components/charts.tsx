"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@naamdev/shared";

/* Single-series charts in the validated brand hue (see globals.css .viz-root tokens). */
const compactINR = (paise: number) => {
  const r = paise / 100;
  return r >= 1e7 ? `₹${(r / 1e7).toFixed(1)}Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)}L` : r >= 1e3 ? `₹${(r / 1e3).toFixed(1)}k` : `₹${Math.round(r)}`;
};

function Tip({ active, payload, label, money }: { active?: boolean; payload?: { value: number }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-elevated px-3 py-2 text-xs shadow-lift">
      <p className="font-semibold text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink tabular-nums">{money ? formatINR(payload[0]!.value) : payload[0]!.value.toLocaleString("en-IN")}</p>
    </div>
  );
}

const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function RevenueArea({ data }: { data: { date: string; revenuePaise: number }[] }) {
  return (
    <div className="viz-root h-64 w-full" role="img" aria-label="Daily revenue, last 30 days">
      <ResponsiveContainer>
        <AreaChart data={data.map((d) => ({ ...d, label: day(d.date) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--viz-series)" stopOpacity={0.28} />
              <stop offset="1" stopColor="var(--viz-series)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--viz-axis)", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tickFormatter={compactINR} domain={[0, (max: number) => Math.max(max, 100000)]} tick={{ fill: "var(--viz-axis)", fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip content={<Tip money />} cursor={{ stroke: "var(--viz-axis)", strokeDasharray: "4 4" }} />
          <Area type="monotone" dataKey="revenuePaise" stroke="var(--viz-series)" strokeWidth={2} fill="url(#revFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--nd-surface)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OrdersBars({ data }: { data: { date: string; orders: number }[] }) {
  return (
    <div className="viz-root h-56 w-full" role="img" aria-label="Orders per day, last 30 days">
      <ResponsiveContainer>
        <BarChart data={data.map((d) => ({ ...d, label: day(d.date) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--viz-axis)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(max, 5)]} tick={{ fill: "var(--viz-axis)", fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--viz-grid)", opacity: 0.5 }} />
          <Bar dataKey="orders" fill="var(--viz-series)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBars({ data }: { data: { category: string; revenuePaise: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenuePaise));
  return (
    <ul className="space-y-3" aria-label="Revenue by category, last 30 days">
      {data.map((d) => (
        <li key={d.category} className="group">
          <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold text-ink-soft">{d.category}</span><span className="font-bold tabular-nums text-ink">{formatINR(d.revenuePaise)}</span></div>
          <div className="viz-root h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(d.revenuePaise / max) * 100}%`, background: "var(--viz-series)" }} /></div>
        </li>
      ))}
    </ul>
  );
}
