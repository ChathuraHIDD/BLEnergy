import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Download, Eye, Paperclip, Pencil, Printer, Trash2 } from 'lucide-react';
import { fmtDate, lkr } from '../../lib/format';
import { methodLabel } from '../../lib/constants';
import { openDocument, openFile } from '../../lib/docs';
import { Button, Row, Table } from '../../components/ui';

/** Clicking a reference opens View / Download / Print for its receipt or voucher. */
export function RefMenu({ txn }) {
  const [pos, setPos] = useState(null);
  const open = Boolean(pos);
  const setOpen = (o) => setPos(o ? (() => { const r = btn.current.getBoundingClientRect(); return { top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 200) }; })() : null);
  const ref = useRef(null);
  const btn = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && !btn.current.contains(e.target) && setPos(null);
    const hide = () => setPos(null);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open]);
  const url = `/transactions/${txn.id}/pdf`;
  const act = (mode) => {
    setOpen(false);
    openDocument(url, mode);
  };
  return (
    <div className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button ref={btn} onClick={() => setOpen(!open)} className="code rounded-md px-1.5 py-0.5 underline decoration-gold/40 underline-offset-4 transition hover:bg-gold/10 hover:decoration-gold">
        {txn.code}
      </button>
      {createPortal(<AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            className="z-[60] w-48 rounded-xl border border-line-strong bg-surface-2 p-1 shadow-2xl shadow-black/70"
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold tracking-widest text-dim uppercase">{txn.kind === 'income' ? 'Receipt' : 'Payment voucher'}</p>
            {[
              ['view', Eye, 'View'],
              ['download', Download, 'Download PDF'],
              ['print', Printer, 'Print'],
            ].map(([m, Icon, l]) => (
              <button key={m} onClick={() => act(m)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-brand/10 hover:text-txt">
                <Icon className="h-4 w-4 text-brand" /> {l}
              </button>
            ))}
            {txn.files?.map((f) => (
              <button key={f.id} onClick={() => { setOpen(false); openFile(f.id); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-brand/10 hover:text-txt">
                <Paperclip className="h-4 w-4 shrink-0 text-gold" /> <span className="truncate">{f.name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}

export default function TxnTable({ rows, onEdit, onDelete, showProject = true, showContractor = true }) {
  const head = ['Reference', 'Date', 'Category', showProject && 'Project', showContractor && 'Contractor / Party', 'Method', { label: 'Amount', className: 'text-right' }, ''].filter(Boolean);
  return (
    <Table head={head}>
      {rows.map((t, i) => (
        <Row key={t.id} index={i}>
          <td className="td">
            <RefMenu txn={t} />
            {t.reference && <p className="mt-0.5 text-[11px] text-dim">Ref: {t.reference}</p>}
          </td>
          <td className="td text-sm whitespace-nowrap text-muted">{fmtDate(t.txn_date)}</td>
          <td className="td">
            <span className="flex items-center gap-2">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${t.kind === 'income' ? 'bg-ok/12 text-ok' : 'bg-bad/12 text-bad'}`}>
                {t.kind === 'income' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
              </span>
              <span className="font-medium">{t.category}</span>
              {t.files?.length > 0 && <Paperclip className="h-3.5 w-3.5 text-gold" title={`${t.files.length} attachment(s)`} />}
            </span>
            {t.description && <p className="mt-0.5 max-w-[260px] truncate pl-8 text-xs text-dim">{t.description}</p>}
          </td>
          {showProject && (
            <td className="td">
              {t.project_id ? (
                <Link to={`/projects/${t.project_id}`} className="hover:text-brand">
                  <p className="code">{t.project_code}</p>
                  <p className="max-w-[180px] truncate text-xs text-muted">{t.customer_name}</p>
                </Link>
              ) : <span className="text-dim">—</span>}
              {t.invoice_code && <p className="text-[11px] text-dim">Inv {t.invoice_code}</p>}
            </td>
          )}
          {showContractor && (
            <td className="td text-sm">
              {t.contractor_id ? <Link to={`/contractors/${t.contractor_id}`} className="font-medium hover:text-brand">{t.contractor_name}</Link> : <span className="text-muted">{t.party || '—'}</span>}
            </td>
          )}
          <td className="td text-sm text-muted">{methodLabel(t.payment_method)}</td>
          <td className={`td text-right font-bold whitespace-nowrap ${t.kind === 'income' ? 'text-ok' : 'text-bad'}`}>
            {t.kind === 'income' ? '+' : '−'} {lkr(t.amount)}
          </td>
          <td className="td">
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" title="Print" onClick={() => openDocument(`/transactions/${t.id}/pdf`, 'print')}><Printer className="h-4 w-4" /></Button>
              {onEdit && <Button variant="ghost" size="icon" title="Edit" onClick={() => onEdit(t)}><Pencil className="h-4 w-4" /></Button>}
              {onDelete && <Button variant="ghost" size="icon" title="Delete" onClick={() => onDelete(t)} className="hover:!text-bad"><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </td>
        </Row>
      ))}
    </Table>
  );
}
