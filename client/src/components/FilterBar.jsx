import { useEffect, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { Button, Input, Select } from './ui';

/** Debounced search input. */
export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);
  useEffect(() => {
    const t = setTimeout(() => text !== (value || '') && onChange(text), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={className}>
      <Input icon={Search} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/**
 * filters: { q, from, to, ...selects }
 * selects: [{ key, placeholder, options }]
 */
export default function FilterBar({ filters, onChange, selects = [], dates = true, searchPlaceholder, children }) {
  const set = (k, v) => onChange({ ...filters, [k]: v, page: 1 });
  const active = Object.entries(filters).some(([k, v]) => k !== 'page' && v);
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-line p-4">
      <SearchInput className="min-w-[220px] flex-1" value={filters.q} onChange={(v) => set('q', v)} placeholder={searchPlaceholder} />
      {selects.map((s) => (
        <div key={s.key} className="w-full sm:w-44">
          <Select value={filters[s.key] || ''} onChange={(e) => set(s.key, e.target.value)} placeholder={s.placeholder} options={s.options} />
        </div>
      ))}
      {dates && (
        <div className="flex items-center gap-2">
          <Input type="date" value={filters.from || ''} onChange={(e) => set('from', e.target.value)} className="w-[150px]" title="From date" />
          <span className="text-xs text-dim">to</span>
          <Input type="date" value={filters.to || ''} onChange={(e) => set('to', e.target.value)} className="w-[150px]" title="To date" />
        </div>
      )}
      {active && (
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => onChange(Object.fromEntries(Object.keys(filters).map((k) => [k, k === 'page' ? 1 : ''])))}>
          Reset
        </Button>
      )}
      {children}
    </div>
  );
}
