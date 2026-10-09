import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { fileSize, fmtDate, lkr } from '../../lib/format';
import { QUOTATION_STATUS } from '../../lib/constants';
import { openFile } from '../../lib/docs';
import { clean, useUrlFilters } from '../../lib/useUrlFilters';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Row, Skeleton, Table } from '../../components/ui';
import FilterBar from '../../components/FilterBar';
import QuotationFormModal from './QuotationFormModal';

const KEYS = ['q', 'status', 'from', 'to'];

export default function QuotationsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useUrlFilters(KEYS);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['quotations', filters],
    queryFn: () => api.get('/quotations', { params: clean(filters) }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const del = useMutation({
    mutationFn: (q) => api.delete(`/quotations/${q.id}`),
    onSuccess: () => {
      toast.success('Quotation deleted');
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['quotations'] });
      qc.invalidateQueries({ queryKey: ['project'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Uploaded quotation documents (PDF / Word)" actions={<Button icon={Upload} onClick={() => setModal({})}>Upload quotation</Button>} />
      <Card>
        <FilterBar filters={filters} onChange={setFilters} searchPlaceholder="Search quotation no, title, customer, file name…"
          selects={[{ key: 'status', placeholder: 'All statuses', options: Object.entries(QUOTATION_STATUS).map(([value, s]) => ({ value, label: s.label })) }]} />
        {error ? <ErrorState message={errorMessage(error)} onRetry={refetch} />
          : isLoading ? <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            : !data.length ? <EmptyState icon={FileText} title="No quotations found" action={<Button icon={Plus} onClick={() => setModal({})}>Upload quotation</Button>} />
              : (
                <Table head={['Quotation', 'Customer / Project', 'Date', 'Valid until', { label: 'Amount', className: 'text-right' }, 'Status', 'File', '']}>
                  {data.map((q, i) => (
                    <Row key={q.id} index={i}>
                      <td className="td"><p className="code">{q.code}</p><p className="max-w-[220px] truncate font-semibold">{q.title}</p></td>
                      <td className="td">
                        <p className="font-medium">{q.customer_name}</p>
                        {q.project_id && <Link to={`/projects/${q.project_id}`} className="text-xs text-muted hover:text-brand">{q.project_code}</Link>}
                      </td>
                      <td className="td text-sm text-muted">{fmtDate(q.quote_date)}</td>
                      <td className="td text-sm text-muted">{fmtDate(q.valid_until)}</td>
                      <td className="td text-right font-semibold">{lkr(q.amount)}</td>
                      <td className="td"><Badge tone={QUOTATION_STATUS[q.status].tone} dot>{QUOTATION_STATUS[q.status].label}</Badge></td>
                      <td className="td">
                        {q.file_id ? (
                          <button onClick={() => openFile(q.file_id)} className="flex max-w-[180px] items-center gap-1.5 text-left text-xs text-muted hover:text-brand">
                            <FileText className="h-4 w-4 shrink-0 text-brand" /><span className="truncate">{q.file_name}</span><span className="shrink-0 text-dim">{fileSize(q.file_size)}</span>
                          </button>
                        ) : '—'}
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          {q.file_id && <Button variant="ghost" size="icon" title="Open" onClick={() => openFile(q.file_id)}><Eye className="h-4 w-4" /></Button>}
                          {q.file_id && <Button variant="ghost" size="icon" title="Download" onClick={() => openFile(q.file_id, true)}><Download className="h-4 w-4" /></Button>}
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => setModal({ quotation: q })}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setToDelete(q)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </Row>
                  ))}
                </Table>
              )}
      </Card>
      <QuotationFormModal open={Boolean(modal)} onClose={() => setModal(null)} quotation={modal?.quotation} />
      <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={() => del.mutate(toDelete)} loading={del.isPending}
        title={`Delete ${toDelete?.code}?`} message="The quotation and its uploaded file will be permanently deleted." />
    </div>
  );
}
