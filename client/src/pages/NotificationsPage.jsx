import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Bell, BellRing, CalendarClock, CheckCheck, Circle, FileSpreadsheet, Info, RefreshCw, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { daysLabel, fmtDate, fmtDateTime, timeAgo } from '../lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageLoader, Tabs } from '../components/ui';

const TYPES = {
  warranty: { icon: ShieldCheck, cls: 'bg-gold/12 text-gold', label: 'Warranty' },
  service: { icon: Wrench, cls: 'bg-info/12 text-info', label: 'Service' },
  invoice_due: { icon: FileSpreadsheet, cls: 'bg-brand/12 text-brand', label: 'Invoice' },
  system: { icon: Info, cls: 'bg-surface-3 text-muted', label: 'Activity' },
};

export function NotificationIcon({ type }) {
  const t = TYPES[type] || TYPES.system;
  return (
    <div className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', t.cls)}>
      <t.icon className="h-4 w-4" />
    </div>
  );
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [type, setType] = useState('');
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', 'list', filter, type],
    queryFn: () => api.get('/notifications', { params: { filter, type: type || undefined } }).then((r) => r.data),
  });
  const { data: upcoming = [] } = useQuery({ queryKey: ['upcoming', 60], queryFn: () => api.get('/notifications/upcoming', { params: { days: 60 } }).then((r) => r.data) });

  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const mark = useMutation({ mutationFn: ({ id, is_read }) => api.put(`/notifications/${id}/read`, { is_read }), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const markAll = useMutation({ mutationFn: () => api.put('/notifications/read-all'), onSuccess: () => { toast.success('All notifications marked as read'); refresh(); } });
  const remove = useMutation({ mutationFn: (id) => api.delete(`/notifications/${id}`), onSuccess: () => { toast.success('Notification removed'); refresh(); } });
  const regen = useMutation({ mutationFn: () => api.post('/notifications/refresh'), onSuccess: () => { toast.success('Reminders checked'); refresh(); qc.invalidateQueries({ queryKey: ['upcoming'] }); } });

  const unread = data.filter((n) => !n.is_read).length;

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Warranty, service and invoice reminders are sent 2 days and 1 day before (and on the day)"
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={regen.isPending} onClick={() => regen.mutate()}>Check now</Button>
            <Button variant="secondary" icon={CheckCheck} onClick={() => markAll.mutate()} disabled={!unread && filter === 'all'}>Mark all read</Button>
          </>
        } />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            <Tabs tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} value={filter} onChange={setFilter} />
            <Tabs tabs={[{ value: '', label: 'Every type' }, ...Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label }))]} value={type} onChange={setType} />
          </div>
          {isLoading ? <PageLoader /> : error ? <ErrorState message={errorMessage(error)} onRetry={refetch} /> : !data.length ? (
            <EmptyState icon={Bell} title="No notifications" message={filter === 'unread' ? "You're all caught up." : 'Reminders and activity will appear here.'} />
          ) : (
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {data.map((n) => (
                  <motion.li key={n.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 30 }} className={clsx('group flex gap-4 px-5 py-4', !n.is_read && 'bg-brand/[0.04]')}>
                    <NotificationIcon type={n.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{n.title}</p>
                        {!n.is_read && <Badge tone="brand">New</Badge>}
                        {n.event_date && <Badge tone="muted">{fmtDate(n.event_date)}</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-dim">
                        <span title={fmtDateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
                        {n.project_id && <Link to={`/projects/${n.project_id}`} onClick={() => !n.is_read && mark.mutate({ id: n.id, is_read: true })} className="font-semibold text-brand hover:text-gold">Open {n.project_code} →</Link>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-1 opacity-60 transition group-hover:opacity-100">
                      <Button variant="ghost" size="icon" title={n.is_read ? 'Mark unread' : 'Mark read'} onClick={() => mark.mutate({ id: n.id, is_read: !n.is_read })}>
                        {n.is_read ? <Circle className="h-4 w-4" /> : <CheckCheck className="h-4 w-4 text-ok" />}
                      </Button>
                      <Button variant="ghost" size="icon" title="Remove" onClick={() => remove.mutate(n.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader icon={CalendarClock} title="Coming up" subtitle="Next 60 days (and overdue services)" />
          {!upcoming.length ? <EmptyState icon={BellRing} title="Nothing scheduled" /> : (
            <ul className="max-h-[640px] divide-y divide-line overflow-y-auto">
              {upcoming.map((u, i) => (
                <li key={i}>
                  <Link to={u.project_id ? `/projects/${u.project_id}` : '/finance/invoices'} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2/70">
                    <NotificationIcon type={u.type} />
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
