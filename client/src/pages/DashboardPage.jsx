import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Bell, CalendarClock, FolderKanban, HardHat, Plus, ShieldCheck, Wallet, Wrench } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { daysLabel, fmtDate, lkr } from '../lib/format';
import { categoryLabel, PROJECT_STATUSES, statusOf } from '../lib/constants';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageLoader } from '../components/ui';
import { BarList, MonthlyBars } from '../components/charts';

function ModuleCard({ to, icon: Icon, title, delay, children, accent }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }} whileHover={{ y: -4 }}>
      <Link to={to} className="card group relative block h-full overflow-hidden p-5 transition-colors hover:border-brand/40">
        <div className={`pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-50 ${accent}`} />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-gradient grid h-11 w-11 place-items-center rounded-xl text-black shadow-lg shadow-brand/20">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-extrabold">{title}</h2>
          </div>
          <ArrowUpRight className="h-5 w-5 text-dim transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
        </div>
        <div className="relative mt-5">{children}</div>
      </Link>
    </motion.div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-dim uppercase">{label}</p>
      <p className={`mt-0.5 text-lg font-extrabold ${tone || ''}`}>{value}</p>
    </div>
  );
}

const STATUS_COLORS = { planning: '#5aa9ff', in_progress: '#f27d1f', completed: '#3ccf86', on_hold: '#f4bb2c', cancelled: '#f45d5d' };

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard').then((r) => r.data) });
  const { data: upcoming = [] } = useQuery({ queryKey: ['upcoming', 30], queryFn: () => api.get('/notifications/upcoming', { params: { days: 30 } }).then((r) => r.data) });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  const { projects: p, contractors: c, finance: f, notifications: n } = data;
  const hour = new Date().getHours();

  return (
    <div>
      <PageHeader
        breadcrumb="Overview"
        title={<>Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, <span className="text-gradient">BatteryLab</span></>}
        subtitle="Here is what is happening across your projects, finance and crews today."
        actions={
          <>
            <Button variant="secondary" icon={HardHat} onClick={() => navigate('/contractors?new=1')}>Add contractor</Button>
            <Button icon={Plus} onClick={() => navigate('/projects/new')}>Create project</Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ModuleCard to="/projects" icon={FolderKanban} title="Projects" delay={0} accent="bg-brand">
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Total" value={p.total} />
            <Metric label="In progress" value={p.in_progress} tone="text-brand" />
            <Metric label="Completed" value={p.completed} tone="text-ok" />
            <Metric label="This month" value={p.this_month} />
          </div>
        </ModuleCard>
        <ModuleCard to="/finance" icon={Wallet} title="Finance" delay={0.06} accent="bg-gold">
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Income (month)" value={lkr(f.income_month, { compact: true })} />
            <Metric label="Expenses (month)" value={lkr(f.expense_month, { compact: true })} />
            <Metric label="Net (all time)" value={lkr(f.net, { compact: true })} tone={f.net >= 0 ? 'text-ok' : 'text-bad'} />
            <Metric label="To collect" value={lkr(f.outstanding, { compact: true })} tone="text-gold" />
          </div>
        </ModuleCard>
        <ModuleCard to="/contractors" icon={HardHat} title="Contractors" delay={0.12} accent="bg-brand-deep">
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Registered" value={c.total} />
            <Metric label="Active" value={c.active} tone="text-ok" />
            <Metric label="Crew members" value={c.crew} />
            <Metric label="Inactive" value={c.total - c.active} />
          </div>
        </ModuleCard>
        <ModuleCard to="/notifications" icon={Bell} title="Notifications" delay={0.18} accent="bg-gold">
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Unread" value={n.unread} tone={n.unread ? 'text-brand' : ''} />
            <Metric label="Total" value={n.total} />
            <Metric label="Warranties (30d)" value={n.warranties} tone="text-gold" />
            <Metric label="Services (30d)" value={n.services} tone="text-info" />
          </div>
        </ModuleCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={Wallet} title="Income vs expenses" subtitle="Last 6 months" action={<Link to="/finance" className="text-sm font-semibold text-brand hover:text-gold">Finance →</Link>} />
          <div className="p-5">
            <MonthlyBars data={data.monthly} />
          </div>
        </Card>
        <Card>
          <CardHeader icon={FolderKanban} title="Projects by status" subtitle={`${p.total} projects · ${lkr(p.contract_value, { compact: true })} contract value`} />
          <div className="p-5">
            <BarList
              format={(v) => v}
              empty="No projects yet"
              items={p.total ? PROJECT_STATUSES.map((s) => ({ label: s.label, value: p[s.value], color: STATUS_COLORS[s.value] })) : []}
            />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={FolderKanban} title="Recent projects" action={<Link to="/projects" className="text-sm font-semibold text-brand hover:text-gold">View all →</Link>} />
          {!data.recentProjects.length ? (
            <EmptyState title="No projects yet" message="Create your first project to start tracking installations, payments and warranties." action={<Button icon={Plus} onClick={() => navigate('/projects/new')}>Create project</Button>} />
          ) : (
            <ul className="divide-y divide-line">
              {data.recentProjects.map((r, i) => {
                const pct = r.contract_value > 0 ? Math.min(100, (r.collected / r.contract_value) * 100) : 0;
                const s = statusOf(r.status);
                return (
                  <motion.li key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <Link to={`/projects/${r.id}`} className="flex flex-wrap items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2/70">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="code">{r.code}</span>
                          <Badge tone={s.tone} dot>{s.label}</Badge>
                        </div>
                        <p className="mt-1 truncate font-semibold">{r.title}</p>
                        <p className="truncate text-xs text-muted">{r.customer_name} · {categoryLabel(r.category)}</p>
                      </div>
                      <div className="w-44">
                        <div className="flex justify-between text-xs text-muted">
                          <span>Collected</span>
                          <span className="font-semibold text-txt">{Math.round(pct)}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-right text-[11px] text-dim">{lkr(r.collected, { compact: true })} / {lkr(r.contract_value, { compact: true })}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-dim" />
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={CalendarClock} title="Upcoming" subtitle="Warranties, services & invoices – next 30 days" />
          {!upcoming.length ? (
            <EmptyState icon={ShieldCheck} title="Nothing due" message="No warranty expiries, service visits or invoice due dates in the next 30 days." />
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {upcoming.map((u, i) => (
                <li key={i}>
                  <Link to={u.project_id ? `/projects/${u.project_id}` : '/finance/invoices'} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2/70">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${u.type === 'warranty' ? 'bg-gold/12 text-gold' : u.type === 'service' ? 'bg-info/12 text-info' : 'bg-brand/12 text-brand'}`}>
                      {u.type === 'warranty' ? <ShieldCheck className="h-4 w-4" /> : u.type === 'service' ? <Wrench className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{u.title}</p>
                      <p className="truncate text-xs text-muted">{u.project_code} · {u.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <Badge tone={u.days_left < 0 ? 'bad' : u.days_left <= 2 ? 'brand' : 'muted'}>{daysLabel(u.days_left)}</Badge>
                      <p className="mt-1 text-[11px] text-dim">{fmtDate(u.event_date)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
