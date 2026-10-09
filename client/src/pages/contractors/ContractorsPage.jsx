import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, FolderKanban, HardHat, Phone, Plus, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { lkr } from '../../lib/format';
import { clean, useUrlFilters } from '../../lib/useUrlFilters';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import FilterBar from '../../components/FilterBar';
import ContractorFormModal from './ContractorFormModal';

const KEYS = ['q', 'status'];

export default function ContractorsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useUrlFilters(KEYS);
  const [modal, setModal] = useState(false);
  useEffect(() => {
    if (params.get('new')) {
      setModal(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['contractors', filters],
    queryFn: () => api.get('/contractors', { params: clean(filters) }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader breadcrumb="Contractors" title="Contractors" subtitle="Registered wiring and installation contractors"
        actions={<Button icon={Plus} onClick={() => setModal(true)}>Register contractor</Button>} />
      <Card className="mb-5">
        <FilterBar filters={filters} onChange={setFilters} dates={false} searchPlaceholder="Search by name, contractor ID, phone or company…"
          selects={[{ key: 'status', placeholder: 'All statuses', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] }]} />
      </Card>
      {error ? <Card><ErrorState message={errorMessage(error)} onRetry={refetch} /></Card>
        : isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
          : !data.length ? (
            <Card><EmptyState icon={HardHat} title={filters.q || filters.status ? 'No matching contractors' : 'No contractors yet'} message="Register contractors to assign them to projects and track their payments."
              action={<Button icon={Plus} onClick={() => setModal(true)}>Register contractor</Button>} /></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.map((c, i) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                  whileHover={{ y: -4 }}
                  onClick={() => navigate(`/contractors/${c.id}`)}
                  className="card group p-5 text-left transition-colors hover:border-brand/40"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-brand-gradient grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-extrabold text-black">
                      {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="code">{c.code}</span>
                        <Badge tone={c.status === 'active' ? 'ok' : 'muted'} dot>{c.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <p className="mt-1 truncate text-lg font-bold group-hover:text-brand">{c.name}</p>
                      <p className="flex items-center gap-1.5 truncate text-sm text-muted"><Building2 className="h-3.5 w-3.5" />{c.company || 'Independent'}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface-2/60 p-3 text-center">
                    <div><Users className="mx-auto h-4 w-4 text-dim" /><p className="mt-1 font-bold">{c.crew_count}</p><p className="text-[10px] text-dim uppercase">Crew</p></div>
                    <div><FolderKanban className="mx-auto h-4 w-4 text-dim" /><p className="mt-1 font-bold">{c.project_count}</p><p className="text-[10px] text-dim uppercase">Projects</p></div>
                    <div><HardHat className="mx-auto h-4 w-4 text-dim" /><p className="mt-1 truncate font-bold">{lkr(c.total_paid, { compact: true })}</p><p className="text-[10px] text-dim uppercase">Paid</p></div>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-muted"><Phone className="h-3.5 w-3.5" />{c.phone}</p>
                </motion.button>
              ))}
            </div>
          )}
      <ContractorFormModal open={modal} onClose={() => setModal(false)} onSaved={(c) => navigate(`/contractors/${c.id}`)} />
    </div>
  );
}
