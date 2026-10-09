import { motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { lkr } from '../lib/format';

// Validated (dark surface #131110): lightness band, CVD + normal-vision separation, contrast.
export const SERIES = { income: '#d9670f', expense: '#3d7fd6' };

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.income }} />Income</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.expense }} />Expenses</span>
    </div>
  );
}

function MonthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-xs shadow-xl shadow-black/60">
      <p className="mb-1.5 font-bold text-txt">{label}</p>
      {['income', 'expense'].map((k) => (
        <p key={k} className="flex items-center justify-between gap-6 text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: SERIES[k] }} />{k === 'income' ? 'Income' : 'Expenses'}</span>
          <span className="font-semibold text-txt">{lkr(row[k])}</span>
        </p>
      ))}
      <p className="mt-1.5 flex justify-between gap-6 border-t border-line pt-1.5 text-muted">
        Net <span className="font-bold text-txt">{lkr(row.income - row.expense)}</span>
      </p>
    </div>
  );
}

/** Grouped monthly income vs expense bars (single y-axis). */
export function MonthlyBars({ data, height = 260 }) {
  return (
    <div>
      <div className="mb-3 flex justify-end"><Legend /></div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#2c2722" strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#3a332b' }} tick={{ fill: '#a59b8d', fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: '#6f675d', fontSize: 11 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : v)} />
            <Tooltip content={<MonthTooltip />} cursor={{ fill: 'rgba(242,125,31,0.06)' }} />
            <Bar dataKey="income" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expense" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal labelled bar list – magnitude in one hue, values in text ink. */
export function BarList({ items, color = SERIES.income, format = lkr, empty = 'No data yet' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={it.label} title={`${it.label}: ${format(it.value)}`}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-muted">{it.label}</span>
            <span className="shrink-0 font-semibold">{format(it.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full rounded-full"
              style={{ background: it.color || color }}
              initial={{ width: 0 }}
              animate={{ width: `${(it.value / max) * 100}%` }}
              transition={{ delay: i * 0.05, duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
