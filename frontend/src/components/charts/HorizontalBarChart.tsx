import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartTheme } from './useChartTheme';
import { TooltipCard } from './ChartTooltip';

interface Props<T> {
  data: T[];
  categoryKey: keyof T & string;
  valueKey: keyof T & string;
  formatValue: (v: number) => string;
  formatAxis?: (v: number) => string;
  tooltipRows?: (row: T) => { label: string; value: string }[];
  tooltipTitle?: (row: T) => string;
  ariaLabel: string;
  labelWidth?: number;
}

/** Single-series ranked bars: one hue (slot 1), <=24px thick, rounded data-end, value at the tip. */
export function HorizontalBarChart<T extends object>({
  data,
  categoryKey,
  valueKey,
  formatValue,
  formatAxis,
  tooltipRows,
  tooltipTitle,
  ariaLabel,
  labelWidth = 120,
}: Props<T>) {
  const t = useChartTheme();
  const rowHeight = 40;
  const height = Math.max(160, data.length * rowHeight + 36);

  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={t.grid} strokeWidth={1} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => (formatAxis ?? formatValue)(v)}
            tick={{ fill: t.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: t.axis }}
            tickMargin={6}
          />
          <YAxis
            type="category"
            dataKey={categoryKey as never}
            width={labelWidth}
            tick={{ fill: t.ink2, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: t.grid, opacity: 0.45 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]!.payload as T;
              return (
                <TooltipCard
                  title={tooltipTitle ? tooltipTitle(row) : String(row[categoryKey])}
                  rows={tooltipRows ? tooltipRows(row) : [{ label: 'Value', value: formatValue(Number(row[valueKey])) }]}
                />
              );
            }}
          />
          <Bar dataKey={valueKey as never} fill={t.series[0]} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey={valueKey} position="right" formatter={(v: unknown) => formatValue(Number(v))} style={{ fill: t.ink2, fontSize: 11, fontWeight: 500 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
