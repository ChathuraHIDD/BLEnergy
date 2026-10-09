import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Download, HardHat, Plus, Printer, Receipt, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { lkr } from '../../lib/format';
import { CONTRACTOR_PAYMENT, PAYMENT_METHODS, PROJECT_PAYMENT } from '../../lib/constants';
import { openDocument } from '../../lib/docs';
import { clean, useUrlFilters } from '../../lib/useUrlFilters';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, StatCard } from '../../components/ui';
import FilterBar from '../../components/FilterBar';
import TxnTable from './TxnTable';
import TransactionFormModal from './TransactionFormModal';

const PRESETS = {
  all: { title: 'All transactions', subtitle: 'Every income and expense record', fixed: {}, actions: ['income', 'expense'] },
  income: { title: 'Income', subtitle: 'All money received', fixed: { kind: 'income' }, actions: ['income'] },
  expense: { title: 'Expenses & bills', subtitle: 'All money paid out, with attached bills', fixed: { kind: 'expense' }, actions: ['expense'] },
  collections: { title: 'Project payment collections', subtitle: 'Customer payments received against projects', fixed: { kind: 'income', category: PROJECT_PAYMENT }, actions: ['collection'] },
  contractor: { title: 'Contractor payments', subtitle: 'Payments made to contractors', fixed: { kind: 'expense', category: CONTRACTOR_PAYMENT }, actions: ['contractor'] },
};
const ACTIONS = {
  income: { label: 'Add income', icon: ArrowDownLeft, variant: 'secondary' },
  expense: { label: 'Add expense / bill', icon: ArrowUpRight, variant: 'secondary' },
  collection: { label: 'Record project payment', icon: Receipt },
  contractor: { label: 'Pay contractor', icon: HardHat },
};
const KEYS = ['q', 'kind', 'category', 'method', 'project_id', 'contractor_id', 'from', 'to'];

export default function TransactionsPage({ preset }) {
  const cfg = PRESETS[preset];
  const qc = useQueryClient();
  const [filters, setFilters] = useUrlFilters(KEYS);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const params = { ...clean(filters), ...cfg.fixed, pageSize: 25 };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transactions', preset, filters],
    queryFn: () => api.get('/transactions', { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const { data: cats } = useQuery({ queryKey: ['txn-categories'], queryFn: () => api.get('/transactions/categories').then((r) => r.data) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects', 'options'], queryFn: () => api.get('/projects/options').then((r) => r.data) });
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors', 'all'], queryFn: () => api.get('/contractors').then((r) => r.data) });

  const del = useMutation({
    mutationFn: (t) => api.delete(`/transactions/${t.id}`),
    onSuccess: () => {
      toast.success('Transaction deleted');
      setToDelete(null);
      ['transactions', 'finance', 'dashboard', 'project', 'contractor', 'invoices'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const selects = useMemo(() => {
    const s = [];
    if (!cfg.fixed.kind) s.push({ key: 'kind', placeholder: 'Income & expense', options: [{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }] });
    if (!cfg.fixed.category && cats) {
      const list = cfg.fixed.kind ? cats[cfg.fixed.kind] : [...new Set([...cats.income, ...cats.expense])];
      s.push({ key: 'category', placeholder: 'All categories', options: list.map((c) => ({ value: c, label: c })) });
    }
    s.push({ key: 'method', placeholder: 'All methods', options: PAYMENT_METHODS });
    if (preset !== 'contractor') s.push({ key: 'project_id', placeholder: 'All projects', options: projects.map((p) => ({ value: String(p.id), label: `${p.code} – ${p.customer_name}` })) });
    if (preset === 'contractor' || preset === 'expense' || preset === 'all') s.push({ key: 'contractor_id', placeholder: 'All contractors', options: contractors.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` })) });
    return s;
  }, [cfg, cats, projects, contractors, preset]);

  const exportParams = { ...clean(filters), ...cfg.fixed, title: cfg.title.replace('&', 'and') };

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => openDocument('/transactions/export/pdf', 'download', exportParams)}>Export PDF</Button>
            <Button variant="gold" icon={Printer} onClick={() => openDocument('/transactions/export/pdf', 'print', exportParams)}>Print</Button>
            {cfg.actions.map((a) => (
              <Button key={a} variant={ACTIONS[a].variant || 'primary'} icon={ACTIONS[a].icon || Plus} onClick={() => setModal({ mode: a })}>{ACTIONS[a].label}</Button>
            ))}
          </>
        }
      />
      {data && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          {cfg.fixed.kind !== 'expense' && <StatCard label="Income (filtered)" value={lkr(data.income)} icon={ArrowDownLeft} tone="ok" />}
          {cfg.fixed.kind !== 'income' && <StatCard label="Expenses (filtered)" value={lkr(data.expense)} icon={ArrowUpRight} tone="bad" delay={0.05} />}
          {!cfg.fixed.kind && <StatCard label="Net" value={lkr(data.income - data.expense)} icon={Scale} tone="gold" delay={0.1} />}
          <StatCard label="Records" value={data.total} icon={Receipt} tone="info" delay={0.1} />
        </div>
      )}
      <Card>
        <FilterBar filters={filters} onChange={setFilters} selects={selects} searchPlaceholder="Search reference, receipt no, project, customer, contractor…" />
        {error ? <ErrorState message={errorMessage(error)} onRetry={refetch} />
          : isLoading ? <div className="space-y-3 p-5">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            : !data.rows.length ? (
              <EmptyState icon={Receipt} title="No transactions found" message={Object.values(clean(filters)).length > 1 ? 'Try changing the filters.' : 'Records you add will appear here.'} />
            ) : (
              <>
                <TxnTable rows={data.rows} showContractor={preset !== 'collections'} showProject={preset !== 'contractor' || true} onEdit={(t) => setModal({ txn: t })} onDelete={setToDelete} />
                <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />
              </>
            )}
      </Card>
      <TransactionFormModal open={Boolean(modal)} onClose={() => setModal(null)} mode={modal?.mode} txn={modal?.txn} />
      <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={() => del.mutate(toDelete)} loading={del.isPending}
        title={`Delete ${toDelete?.code}?`} message="This removes the record and its attached bills from all finance reports. This cannot be undone." />
    </div>
  );
}
