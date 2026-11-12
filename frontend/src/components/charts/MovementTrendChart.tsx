import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import clsx from 'clsx';
import type { DashboardSummary } from '@/lib/types';
import { formatAxisNumber, formatNumber, formatShortDate } from '@/lib/format';
import { useChartTheme } from './useChartTheme';
import { Legend, TooltipCard } from './ChartTooltip';

type Row = DashboardSummary['movementTrend'][number];

const SERIES = [
  { key: 'stockIn', label: 'Stock in' },
  { key: 'stockOut', label: 'Stock out' },
  { key: 'transfer', label: 'Transfers' },
] as const;

export function MovementTrendChart({ data }: { data: Row[] }) {
  const t = useChartTheme();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const colors = { stockIn: t.series[0], stockOut: t.series[1], transfer: t.series[2] };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Legend items={SERIES.map((s) => ({ color: colors[s.key], label: s.label }))} />
        <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Display as">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', view === v ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink')}
            >
              {v === 'chart' ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
              {v === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <div className="h-72" role="img" aria-label="Units moved per day over the last 14 days by movement type">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={t.grid} strokeWidth={1} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fill: t.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: t.axis }}
                minTickGap={24}
                tickMargin={8}
              />
              <YAxis tickFormatter={(v: number) => formatAxisNumber(v)} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: t.axis, strokeWidth: 1 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <TooltipCard
                      title={formatShortDate(String(label))}
                      rows={SERIES.map((s) => ({ color: colors[s.key], label: s.label, value: `${formatNumber(Number((payload[0]!.payload as Row)[s.key]))} units` }))}
                    />
                  ) : null
                }
              />
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={colors[s.key]}
                  strokeWidth={2}
                  fill={colors[s.key]}
                  fillOpacity={0.1}
                  dot={false}
                  activeDot={{ r: 4, fill: colors[s.key], stroke: t.surface, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="scrollbar-thin max-h-72 overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-[11px] tracking-wider text-ink-3 uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-right font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((r) => (
                <tr key={r.date} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-2">{formatShortDate(r.date)}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right text-ink tabular">
                      {formatNumber(r[s.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
