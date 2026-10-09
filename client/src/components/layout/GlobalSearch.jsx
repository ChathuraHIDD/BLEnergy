import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { FileSpreadsheet, FileText, FolderKanban, HardHat, Receipt, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDate, lkr } from '../../lib/format';
import { Spinner } from '../ui';

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key);
    };
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get('/search', { params: { q: debounced } }).then((r) => r.data),
    enabled: debounced.length >= 2,
  });

  const go = (to) => {
    setOpen(false);
    setQ('');
    navigate(to);
  };

  const groups = data
    ? [
        { title: 'Projects', icon: FolderKanban, items: data.projects.map((p) => ({ key: `p${p.id}`, to: `/projects/${p.id}`, code: p.code, main: p.title, sub: `${p.customer_name}${p.installation_date ? ` · Installed ${fmtDate(p.installation_date)}` : ''}` })) },
        { title: 'Contractors', icon: HardHat, items: data.contractors.map((c) => ({ key: `c${c.id}`, to: `/contractors/${c.id}`, code: c.code, main: c.name, sub: [c.company, c.phone].filter(Boolean).join(' · ') })) },
        { title: 'Payments', icon: Receipt, items: data.transactions.map((t) => ({ key: `t${t.id}`, to: `/finance/transactions?q=${t.code}`, code: t.code, main: `${t.category} · ${lkr(t.amount)}`, sub: `${fmtDate(t.txn_date)}${t.reference ? ` · Ref ${t.reference}` : ''}` })) },
        { title: 'Invoices', icon: FileSpreadsheet, items: data.invoices.map((i) => ({ key: `i${i.id}`, to: `/finance/invoices?q=${i.code}`, code: i.code, main: i.customer_name, sub: fmtDate(i.issue_date) })) },
        { title: 'Quotations', icon: FileText, items: data.quotations.map((x) => ({ key: `q${x.id}`, to: `/finance/quotations?q=${x.code}`, code: x.code, main: x.title, sub: x.customer_name })) },
      ].filter((g) => g.items.length)
    : [];

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-dim" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search projects, customers, phone, dates, receipts…"
        className="input h-11 !rounded-xl pr-16 pl-10"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-line-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-dim sm:block">⌘K</kbd>
      <AnimatePresence>
        {open && debounced.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute z-40 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-2xl border border-line-strong bg-surface-2 p-2 shadow-2xl shadow-black/70"
          >
            {isFetching && !data && (
              <div className="flex justify-center p-6"><Spinner /></div>
            )}
            {data && !groups.length && <p className="p-6 text-center text-sm text-muted">No results for “{debounced}”</p>}
            {groups.map((g) => (
              <div key={g.title} className="mb-1">
                <p className="flex items-center gap-2 px-3 pt-2 pb-1 text-[10px] font-bold tracking-widest text-dim uppercase">
                  <g.icon className="h-3.5 w-3.5" /> {g.title}
                </p>
                {g.items.map((it) => (
                  <button key={it.key} onClick={() => go(it.to)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-brand/10">
                    <span className="code w-32 shrink-0">{it.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{it.main}</span>
                      <span className="block truncate text-xs text-muted">{it.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
