import { forwardRef, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { AlertCircle, ChevronDown, Download, Inbox, Loader2, Printer, Trash2, X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../lib/api';
import { openDocument } from '../lib/docs';

// ---------------------------------------------------------------- Button
const variants = {
  primary: 'bg-brand-gradient text-black font-bold shadow-[0_8px_24px_-10px_rgba(242,125,31,0.7)] hover:brightness-110',
  secondary: 'bg-surface-3 text-txt border border-line-strong hover:border-brand/50 hover:bg-surface-2',
  ghost: 'text-muted hover:text-txt hover:bg-surface-3',
  danger: 'bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25',
  gold: 'bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25',
};
const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </motion.button>
  );
});

// ---------------------------------------------------------------- Form fields
export function FieldError({ error }) {
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-bad"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, required, error, hint, children, className }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-brand">*</span>}
        </label>
      )}
      <motion.div animate={error ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
        {children}
      </motion.div>
      {hint && !error && <p className="mt-1.5 text-xs text-dim">{hint}</p>}
      <FieldError error={error} />
    </div>
  );
}

export const Input = forwardRef(function Input({ error, className, icon: Icon, ...props }, ref) {
  if (Icon) {
    return (
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-dim" />
        <input ref={ref} className={clsx('input pl-10', error && 'input-error', className)} {...props} />
      </div>
    );
  }
  return <input ref={ref} className={clsx('input', error && 'input-error', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ error, className, ...props }, ref) {
  return <textarea ref={ref} className={clsx('input min-h-[96px] resize-y leading-relaxed', error && 'input-error', className)} {...props} />;
});

export function Select({ error, className, options = [], placeholder, ...props }) {
  return (
    <div className="relative">
      <select className={clsx('input cursor-pointer appearance-none pr-9', error && 'input-error', !props.value && 'text-dim', className)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-2 text-txt">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-dim" />
    </div>
  );
}

// ---------------------------------------------------------------- Layout bits
export function Card({ className, children, ...props }) {
  return (
    <div className={clsx('card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action, className }) {
  return (
    <div className={clsx('flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-bold">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5 text-xs font-medium text-dim">{breadcrumb}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

const tones = {
  brand: 'bg-brand/12 text-brand border-brand/25',
  gold: 'bg-gold/12 text-gold border-gold/25',
  ok: 'bg-ok/12 text-ok border-ok/25',
  bad: 'bg-bad/12 text-bad border-bad/25',
  warn: 'bg-warn/12 text-warn border-warn/25',
  info: 'bg-info/12 text-info border-info/25',
  muted: 'bg-surface-3 text-muted border-line-strong',
};

export function Badge({ tone = 'muted', children, className, dot }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand', className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-line" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand border-r-gold" />
        </div>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded-lg bg-surface-3', className)} />;
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface-2 text-dim">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-bold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Could not load data"
      message={message}
      action={onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    />
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'brand', delay = 0, onClick }) {
  const toneMap = {
    brand: 'from-brand/20 text-brand',
    gold: 'from-gold/20 text-gold',
    ok: 'from-ok/20 text-ok',
    bad: 'from-bad/20 text-bad',
    info: 'from-info/20 text-info',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      whileHover={onClick ? { y: -3 } : undefined}
      onClick={onClick}
      className={clsx('card relative overflow-hidden p-5', onClick && 'cursor-pointer')}
    >
      <div className={clsx('pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent blur-2xl', toneMap[tone])} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
          <p className="mt-2 truncate text-2xl font-extrabold tracking-tight">{value}</p>
          {sub && <p className="mt-1 truncate text-xs text-dim">{sub}</p>}
        </div>
        {Icon && (
          <div className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3', toneMap[tone].split(' ')[1])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  const id = useId();
  return (
    <div className={clsx('flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={clsx(
            'relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
            value === t.value ? 'text-black' : 'text-muted hover:text-txt',
          )}
        >
          {value === t.value && (
            <motion.span layoutId={`tab-${id}`} className="bg-brand-gradient absolute inset-0 rounded-lg" transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} />
          )}
          <span className="relative flex items-center gap-2">
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
            {t.count !== undefined && (
              <span className={clsx('rounded-full px-1.5 text-[10px]', value === t.value ? 'bg-black/20' : 'bg-surface-3')}>{t.count}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, subtitle, icon: Icon, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            className={clsx('card relative my-8 flex max-h-[calc(100vh-4rem)] w-full flex-col !bg-surface', widths[size])}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className="bg-brand-gradient grid h-10 w-10 place-items-center rounded-xl text-black">
                    <Icon className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold">{title}</h2>
                  {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Permanent-delete confirmation. Requires the company delete code; `onConfirm(code)` must
 * return a promise – a wrong code keeps the dialog open with an inline error.
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, details = [], confirmLabel = 'Delete permanently', requireCode = true }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  useEffect(() => {
    if (open) {
      setCode('');
      setError('');
    }
  }, [open]);

  const fail = (msg) => {
    setError(msg);
    setShake((n) => n + 1);
  };
  const submit = async () => {
    if (requireCode && !code.trim()) return fail('Enter the delete code to continue');
    setBusy(true);
    try {
      await onConfirm(code.trim());
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403 || status === 429) fail(err.response.data?.fields?.delete_code || errorMessage(err));
      else {
        toast.error(errorMessage(err, 'Delete failed'));
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" icon={Trash2} onClick={submit} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <motion.div key={shake} animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.35 }}>
        <div className="flex gap-3 rounded-xl border border-bad/30 bg-bad/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad" />
          <div className="text-sm">
            <p className="font-bold text-bad">This will be permanently deleted</p>
            <p className="mt-1 text-muted">{message}</p>
            {details.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted">
                {details.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
            <p className="mt-2 font-semibold text-txt">This cannot be undone.</p>
          </div>
        </div>
        {requireCode && (
          <div className="mt-4">
            <label className="label">Delete code <span className="text-brand">*</span></label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={12}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Enter the delete code"
              className={clsx('input text-center font-mono text-lg tracking-[0.5em]', error && 'input-error')}
            />
            <FieldError error={error} />
          </div>
        )}
      </motion.div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Documents
export function DocActions({ url, params, size = 'sm', showView = true }) {
  return (
    <div className="flex items-center gap-1.5">
      {showView && (
        <Button size={size} variant="secondary" icon={Eye} onClick={() => openDocument(url, 'view', params)}>
          View
        </Button>
      )}
      <Button size={size} variant="secondary" icon={Download} onClick={() => openDocument(url, 'download', params)}>
        Download
      </Button>
      <Button size={size} variant="gold" icon={Printer} onClick={() => openDocument(url, 'print', params)}>
        Print
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- Table
export function Table({ head, children, className }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-line bg-surface-2/60">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={clsx('th', typeof h === 'object' && h?.className)}>
                {typeof h === 'object' ? h?.label : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick, index = 0, className }) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.4) }}
      onClick={onClick}
      className={clsx('transition-colors hover:bg-surface-2/70', onClick && 'cursor-pointer', className)}
    >
      {children}
    </motion.tr>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-muted">
      <span>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function InfoItem({ label, children, className }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-bold tracking-wider text-dim uppercase">{label}</p>
      <div className="mt-1 text-sm font-semibold break-words">{children || <span className="text-dim">—</span>}</div>
    </div>
  );
}
