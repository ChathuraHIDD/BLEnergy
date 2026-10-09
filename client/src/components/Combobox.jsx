import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, ChevronDown, Plus } from 'lucide-react';

/**
 * Text input with suggestions. Typing a value that is not in the list offers to add it,
 * so new brands/types can be created on the fly.
 */
export default function Combobox({ value, onChange, options = [], placeholder, error, allowCreate = true, createLabel = 'Add' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const q = (value || '').trim().toLowerCase();
  const filtered = useMemo(() => options.filter((o) => o.toLowerCase().includes(q)).slice(0, 50), [options, q]);
  const exact = options.some((o) => o.toLowerCase() === q);
  const showCreate = allowCreate && q && !exact;
  const items = [...filtered.map((o) => ({ value: o })), ...(showCreate ? [{ value: value.trim(), create: true }] : [])];

  const pick = (v) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) return setOpen(true);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      pick(items[active].value);
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        className={clsx('input pr-9', error && 'input-error')}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-dim" />
      <AnimatePresence>
        {open && items.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 mt-1.5 max-h-60 w-full overflow-auto rounded-xl border border-line-strong bg-surface-2 p-1 shadow-2xl shadow-black/60"
          >
            {items.map((it, i) => (
              <li
                key={`${it.create ? 'new-' : ''}${it.value}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it.value);
                }}
                onMouseEnter={() => setActive(i)}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm',
                  i === active ? 'bg-brand/15 text-txt' : 'text-muted',
                )}
              >
                {it.create ? (
                  <>
                    <Plus className="h-4 w-4 text-brand" />
                    <span>
                      {createLabel} “<b className="text-txt">{it.value}</b>”
                    </span>
                  </>
                ) : (
                  <>
                    <Check className={clsx('h-4 w-4', it.value.toLowerCase() === q ? 'text-brand' : 'opacity-0')} />
                    {it.value}
                  </>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
