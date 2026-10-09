import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Phone, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, deleteWithCode, errorMessage } from '../../lib/api';
import { fmtDate, lkr } from '../../lib/format';
import { categoryLabel, PROJECT_CATEGORIES, PROJECT_STATUSES, statusOf } from '../../lib/constants';
import { clean, useUrlFilters } from '../../lib/useUrlFilters';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Pagination, Row, Skeleton, Table } from '../../components/ui';
import FilterBar from '../../components/FilterBar';

const KEYS = ['q', 'status', 'category', 'from', 'to'];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useUrlFilters(KEYS);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', filters],
    queryFn: () => api.get('/projects', { params: { ...clean(filters), pageSize: 20 } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const anyFilter = KEYS.some((k) => filters[k]);
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState(null);
  const deleteProject = async (code) => {
    const r = await deleteWithCode(`/projects/${toDelete.id}`, code);
    toast.success(r.data.message);
    ['projects', 'project', 'dashboard', 'finance', 'transactions', 'invoices', 'quotations', 'contractors', 'contractor', 'notifications', 'upcoming'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  return (
    <div>
      <PageHeader
        breadcrumb="Projects"
        title="Projects"
        subtitle="All solar, battery backup and full solar installations"
        actions={<Button icon={Plus} onClick={() => navigate('/projects/new')}>Create project</Button>}
      />
      <Card>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          searchPlaceholder="Search by project ID, name, customer, phone, address or date…"
          selects={[
            { key: 'status', placeholder: 'All statuses', options: PROJECT_STATUSES },
            { key: 'category', placeholder: 'All categories', options: PROJECT_CATEGORIES },
          ]}
        />
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-3 p-5">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !data.rows.length ? (
          <EmptyState
            icon={FolderKanban}
            title={anyFilter ? 'No matching projects' : 'No projects yet'}
            message={anyFilter ? 'Try a different search or clear the filters.' : 'Create your first project to get started.'}
            action={!anyFilter && <Button icon={Plus} onClick={() => navigate('/projects/new')}>Create project</Button>}
          />
        ) : (
          <>
            <Table head={['Project', 'Customer', 'Category', 'Status', 'Contractor', { label: 'Contract / Collected', className: 'text-right' }, 'Date', '']}>
              {data.rows.map((p, i) => {
                const s = statusOf(p.status);
                const pct = p.contract_value > 0 ? Math.min(100, (p.collected / p.contract_value) * 100) : 0;
                return (
                  <Row key={p.id} index={i} onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="td">
                      <p className="code">{p.code}</p>
                      <p className="max-w-[220px] truncate font-semibold">{p.title}</p>
                    </td>
                    <td className="td">
                      <p className="font-medium">{p.customer_name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted"><Phone className="h-3 w-3" />{p.customer_phones[0]}</p>
                    </td>
                    <td className="td text-muted">{categoryLabel(p.category)}</td>
                    <td className="td"><Badge tone={s.tone} dot>{s.label}</Badge></td>
                    <td className="td text-muted">{p.contractor_name || '—'}</td>
                    <td className="td text-right">
                      <p className="font-semibold">{lkr(p.contract_value)}</p>
                      <div className="mt-1 ml-auto h-1 w-28 overflow-hidden rounded-full bg-surface-3">
                        <div className="bg-brand-gradient h-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-dim">{lkr(p.collected)} collected</p>
                    </td>
                    <td className="td text-xs text-muted">{fmtDate(p.installation_date || p.start_date || p.created_at)}</td>
                    <td className="td">
                      <Button variant="ghost" size="icon" title="Delete project" className="hover:!bg-bad/15 hover:!text-bad"
                        onClick={(e) => { e.stopPropagation(); setToDelete(p); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </Row>
                );
              })}
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />
          </>
        )}
      </Card>
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={deleteProject}
        title={`Delete project ${toDelete?.code}?`}
        message={`"${toDelete?.title}" for ${toDelete?.customer_name} and everything recorded under it will be removed:`}
        details={['Components, wiring, service dates and service agreement', 'All payments and expenses with their bills', 'All invoices and quotations with files', 'Notifications']}
      />
    </div>
  );
}
