import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, HardHat, Landmark, Printer, Receipt, Scale, Wallet } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { fmtDate, lkr } from '../../lib/format';
import { openDocument } from '../../lib/docs';
import { Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, PageLoader, StatCard, Tabs } from '../../components/ui';
import { BarList, MonthlyBars, SERIES } from '../../components/charts';
import { RefMenu } from './TxnTable';
import dayjs from 'dayjs';

const RANGES = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'Last 3 months' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

function rangeDates(r, custom) {
  const t = dayjs();
  if (r === 'month') return { from: t.startOf('month').format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') };
  if (r === 'quarter') return { from: t.subtract(3, 'month').format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') };
  if (r === 'year') return { from: t.startOf('year').format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') };
  if (r === 'custom') return custom;
  return {};
}

export default function FinanceOverview() {
  const [range, setRange] = useState('month');
  const [custom, setCustom] = useState({ from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') });
  const dates = rangeDates(range, custom);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['finance', 'overview', dates], queryFn: () => api.get('/finance/overview', { params: dates }).then((r) => r.data) });

  return (
    <div>
      <PageHeader title="Finance" subtitle="Income, expenses, collections and contractor payments in one place"
        actions={<Button variant="gold" icon={Printer} onClick={() => openDocument('/transactions/export/pdf', 'print', { ...dates, title: 'Financial Statement' })}>Print statement</Button>} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs tabs={RANGES} value={range} onChange={setRange} />
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="w-[150px]" />
            <span className="text-xs text-dim">to</span>
            <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="w-[150px]" />
          </div>
        )}
      </div>

      {isLoading ? <PageLoader /> : error ? <ErrorState message={errorMessage(error)} onRetry={refetch} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Income" value={lkr(data.totals.income)} icon={ArrowDownLeft} tone="ok" sub={`${lkr(data.totals.project_collections)} from projects`} />
            <StatCard label="Expenses" value={lkr(data.totals.expense)} icon={ArrowUpRight} tone="bad" delay={0.05} sub={`${lkr(data.totals.contractor_payments)} to contractors`} />
            <StatCard label="Net cash flow" value={lkr(data.totals.net)} icon={Scale} tone={data.totals.net >= 0 ? 'gold' : 'bad'} delay={0.1} sub={`${data.totals.count} transactions`} />
            <StatCard label="To collect (all projects)" value={lkr(data.receivables.outstanding)} icon={Landmark} tone="brand" delay={0.15}
              sub={`${data.receivables.projects_with_balance} projects · ${lkr(data.invoices.unpaid)} invoiced unpaid`} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader icon={Wallet} title="Monthly cash flow" subtitle="Last 12 months" />
              <div className="p-5"><MonthlyBars data={data.monthly} height={300} /></div>
            </Card>
            <Card>
              <CardHeader icon={Receipt} title="Recent transactions" action={<Link to="/finance/transactions" className="text-sm font-semibold text-brand hover:text-gold">All →</Link>} />
              {!data.recent.length ? <EmptyState title="No transactions yet" /> : (
                <ul className="divide-y divide-line">
                  {data.recent.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${t.kind === 'income' ? 'bg-ok/12 text-ok' : 'bg-bad/12 text-bad'}`}>
                        {t.kind === 'income' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <RefMenu txn={t} />
                        <p className="truncate text-xs text-muted">{t.category} · {t.project_code || t.contractor_name || t.party || fmtDate(t.txn_date)}</p>
                      </div>
                      <p className={`text-sm font-bold whitespace-nowrap ${t.kind === 'income' ? 'text-ok' : 'text-bad'}`}>{t.kind === 'income' ? '+' : '−'}{lkr(t.amount, { compact: true })}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader icon={ArrowDownLeft} title="Income by category" subtitle="Selected period" />
              <div className="p-5"><BarList color={SERIES.income} items={data.byCategory.filter((c) => c.kind === 'income').map((c) => ({ label: `${c.category} (${c.count})`, value: c.total }))} empty="No income in this period" /></div>
            </Card>
            <Card>
              <CardHeader icon={ArrowUpRight} title="Expenses by category" subtitle="Selected period" />
              <div className="p-5"><BarList color={SERIES.expense} items={data.byCategory.filter((c) => c.kind === 'expense').map((c) => ({ label: `${c.category} (${c.count})`, value: c.total }))} empty="No expenses in this period" /></div>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { to: '/finance/collections', icon: Receipt, title: 'Project collections', text: 'Record customer payments against projects' },
              { to: '/finance/contractor-payments', icon: HardHat, title: 'Contractor payments', text: 'Pay contractors and print vouchers' },
              { to: '/finance/expenses', icon: ArrowUpRight, title: 'Expenses & bills', text: 'Log bills with attachments' },
              { to: '/finance/invoices', icon: FileSpreadsheet, title: 'Invoices', text: `${data.invoices.overdue} overdue · ${lkr(data.invoices.unpaid, { compact: true })} unpaid` },
            ].map((x) => (
              <Link key={x.to} to={x.to} className="card group flex items-center gap-4 p-4 transition hover:border-brand/40">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/12 text-brand"><x.icon className="h-5 w-5" /></div>
                <div className="min-w-0"><p className="font-bold group-hover:text-brand">{x.title}</p><p className="truncate text-xs text-muted">{x.text}</p></div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
