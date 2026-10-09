import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileSpreadsheet, Pencil, Plus, Printer, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, deleteWithCode, errorMessage } from '../../lib/api';
import { fmtDate, lkr } from '../../lib/format';
import { INVOICE_STATUS } from '../../lib/constants';
import { openDocument } from '../../lib/docs';
import { clean, useUrlFilters } from '../../lib/useUrlFilters';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Row, Skeleton, Table } from '../../components/ui';
import FilterBar from '../../components/FilterBar';
import InvoiceFormModal from './InvoiceFormModal';
import TransactionFormModal from './TransactionFormModal';

const KEYS = ['q', 'status', 'from', 'to'];

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useUrlFilters(KEYS);
  const [modal, setModal] = useState(null);
  const [pay, setPay] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['invoices', 'list', filters],
    queryFn: () => api.get('/invoices', { params: clean(filters) }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const edit = async (inv) => {
    try {
      const { data: full } = await api.get(`/invoices/${inv.id}`);
      setModal({ invoice: full });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const deleteItem = async (code) => {
    await deleteWithCode(`/invoices/${toDelete.id}`, code);
    toast.success(`${toDelete.code} permanently deleted`);
    ['invoices', 'finance', 'project', 'notifications'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const totals = data.reduce((a, i) => ({ total: a.total + (i.status === 'cancelled' ? 0 : i.total), paid: a.paid + i.paid, balance: a.balance + (i.status === 'cancelled' ? 0 : Math.max(0, i.balance)) }), { total: 0, paid: 0, balance: 0 });

  return (
    <div>
      <PageHeader title="Invoices" subtitle={`${data.length} invoices · ${lkr(totals.total)} billed · ${lkr(totals.balance)} outstanding`}
        actions={<Button icon={Plus} onClick={() => setModal({})}>Create invoice</Button>} />
      <Card>
        <FilterBar filters={filters} onChange={setFilters} searchPlaceholder="Search invoice no, customer or project…"
          selects={[{ key: 'status', placeholder: 'All statuses', options: Object.entries(INVOICE_STATUS).map(([value, s]) => ({ value, label: s.label })) }]} />
        {error ? <ErrorState message={errorMessage(error)} onRetry={refetch} />
          : isLoading ? <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            : !data.length ? <EmptyState icon={FileSpreadsheet} title="No invoices found" action={<Button icon={Plus} onClick={() => setModal({})}>Create invoice</Button>} />
              : (
                <Table head={['Invoice', 'Customer / Project', 'Issued', 'Due', { label: 'Total', className: 'text-right' }, { label: 'Balance', className: 'text-right' }, 'Status', '']}>
                  {data.map((inv, i) => {
                    const st = INVOICE_STATUS[inv.payment_status];
                    return (
                      <Row key={inv.id} index={i}>
                        <td className="td"><button className="code underline decoration-gold/40 underline-offset-4 hover:decoration-gold" onClick={() => openDocument(`/invoices/${inv.id}/pdf`, 'view')}>{inv.code}</button></td>
                        <td className="td">
                          <p className="font-medium">{inv.customer_name}</p>
                          {inv.project_id && <Link to={`/projects/${inv.project_id}`} className="text-xs text-muted hover:text-brand">{inv.project_code} · {inv.project_title}</Link>}
                        </td>
                        <td className="td text-sm text-muted">{fmtDate(inv.issue_date)}</td>
                        <td className="td text-sm text-muted">{fmtDate(inv.due_date)}</td>
                        <td className="td text-right font-semibold">{lkr(inv.total)}</td>
                        <td className="td text-right font-bold">{lkr(Math.max(0, inv.balance))}</td>
                        <td className="td"><Badge tone={st.tone} dot>{st.label}</Badge></td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            {inv.balance > 0 && inv.status !== 'cancelled' && (
                              <Button variant="ghost" size="icon" title="Record payment" onClick={() => setPay({ mode: inv.project_id ? 'collection' : 'income', defaults: { project_id: inv.project_id, invoice_id: inv.id, amount: inv.balance, party: inv.customer_name } })}><Receipt className="h-4 w-4 text-ok" /></Button>
                            )}
                            <Button variant="ghost" size="icon" title="View" onClick={() => openDocument(`/invoices/${inv.id}/pdf`, 'view')}><Eye className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Download" onClick={() => openDocument(`/invoices/${inv.id}/pdf`, 'download')}><Download className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Print" onClick={() => openDocument(`/invoices/${inv.id}/pdf`, 'print')}><Printer className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => edit(inv)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(inv)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </Row>
                    );
                  })}
                </Table>
              )}
      </Card>
      <InvoiceFormModal open={Boolean(modal)} onClose={() => setModal(null)} invoice={modal?.invoice} />
      <TransactionFormModal open={Boolean(pay)} onClose={() => setPay(null)} mode={pay?.mode} defaults={pay?.defaults} />
      <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={deleteItem}
        title={`Delete ${toDelete?.code}?`} message="The invoice and its line items will be removed. Payments already recorded against it stay on the project as normal payments." />
    </div>
  );
}
