import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, FolderKanban, HardHat, Mail, MapPin, Pencil, Phone, Plus, Trash2, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, deleteWithCode, errorMessage } from '../../lib/api';
import { fmtDate, lkr } from '../../lib/format';
import { categoryLabel, statusOf } from '../../lib/constants';
import { Badge, Button, Card, CardHeader, ConfirmDialog, DocActions, EmptyState, ErrorState, InfoItem, PageHeader, PageLoader, Row, StatCard, Table } from '../../components/ui';
import TxnTable from '../finance/TxnTable';
import TransactionFormModal from '../finance/TransactionFormModal';
import ContractorFormModal from './ContractorFormModal';

export default function ContractorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [delTxn, setDelTxn] = useState(null);

  const { data: c, isLoading, error, refetch } = useQuery({ queryKey: ['contractor', id], queryFn: () => api.get(`/contractors/${id}`).then((r) => r.data) });
  const refresh = () => ['contractor', 'contractors', 'finance', 'transactions', 'project', 'projects', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const deleteContractor = async (code) => {
    const r = await deleteWithCode(`/contractors/${id}`, code);
    toast.success(r.data.message);
    refresh();
    navigate('/contractors');
  };
  const deletePayment = async (code) => {
    await deleteWithCode(`/transactions/${delTxn.id}`, code);
    toast.success(`${delTxn.code} permanently deleted`);
    refresh();
  };

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <div>
      <PageHeader
        breadcrumb={<Link to="/contractors" className="flex items-center gap-1 hover:text-txt"><ArrowLeft className="h-3.5 w-3.5" /> Contractors</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{c.name}<Badge tone={c.status === 'active' ? 'ok' : 'muted'} dot className="!text-xs">{c.status === 'active' ? 'Active' : 'Inactive'}</Badge></span>}
        subtitle={<span><span className="code">{c.code}</span> · Registered {fmtDate(c.created_at)}</span>}
        actions={
          <>
            <DocActions url={`/contractors/${c.id}/pdf`} size="md" />
            <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>
            <Button icon={Wallet} onClick={() => setPay({ mode: 'contractor', defaults: { contractor_id: c.id, party: c.name } })}>Pay contractor</Button>
            <Button variant="danger" size="icon" onClick={() => setConfirm(true)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={c.project_count} icon={FolderKanban} />
        <StatCard label="Crew members" value={c.crew_count} icon={Users} tone="gold" delay={0.05} />
        <StatCard label="Total paid" value={lkr(c.total_paid)} icon={Wallet} tone="info" delay={0.1} />
        <StatCard label="Payments" value={c.payments.length} icon={HardHat} tone="ok" delay={0.15} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader icon={HardHat} title="Contractor profile" />
          <div className="space-y-4 p-5">
            <InfoItem label="Contractor ID"><span className="code text-sm">{c.code}</span></InfoItem>
            <InfoItem label="Contact number"><a href={`tel:${c.phone}`} className="flex items-center gap-1.5 hover:text-brand"><Phone className="h-3.5 w-3.5 text-dim" />{c.phone}</a></InfoItem>
            <InfoItem label="Company"><span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-dim" />{c.company || 'Independent'}</span></InfoItem>
            <InfoItem label="Crew member count">{String(c.crew_count)}</InfoItem>
            {c.email && <InfoItem label="Email"><span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-dim" />{c.email}</span></InfoItem>}
            {c.specialization && <InfoItem label="Specialization">{c.specialization}</InfoItem>}
            {c.address && <InfoItem label="Address"><span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-dim" />{c.address}</span></InfoItem>}
            {c.notes && <InfoItem label="Notes"><p className="font-normal whitespace-pre-wrap text-muted">{c.notes}</p></InfoItem>}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader icon={FolderKanban} title="Projects done" subtitle={`${c.projects.length} project(s) as wiring contractor`} />
          {!c.projects.length ? <EmptyState icon={FolderKanban} title="No projects yet" message="Assign this contractor in a project's Wiring section." /> : (
            <Table head={['Project', 'Customer', 'Category', 'Status', 'Date', { label: 'Paid', className: 'text-right' }]}>
              {c.projects.map((p, i) => {
                const s = statusOf(p.status);
                return (
                  <Row key={p.id} index={i} onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="td"><p className="code">{p.code}</p><p className="max-w-[200px] truncate font-semibold">{p.title}</p></td>
                    <td className="td text-muted">{p.customer_name}</td>
                    <td className="td text-muted">{categoryLabel(p.category)}</td>
                    <td className="td"><Badge tone={s.tone} dot>{s.label}</Badge></td>
                    <td className="td text-xs text-muted">{fmtDate(p.installation_date || p.start_date || p.created_at)}</td>
                    <td className="td text-right font-semibold">{lkr(p.paid_for_project)}</td>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader icon={Wallet} title="Payment history" subtitle="Click a voucher number to view, download or print"
          action={<Button size="sm" icon={Plus} onClick={() => setPay({ mode: 'contractor', defaults: { contractor_id: c.id, party: c.name } })}>Add payment</Button>} />
        {!c.payments.length ? <EmptyState icon={Wallet} title="No payments recorded" /> : (
          <TxnTable rows={c.payments.map((t) => ({ ...t, contractor_name: c.name }))} showContractor={false} onEdit={(t) => setPay({ txn: t })} onDelete={setDelTxn} />
        )}
      </Card>

      <ContractorFormModal open={edit} onClose={() => setEdit(false)} contractor={c} />
      <TransactionFormModal open={Boolean(pay)} onClose={() => setPay(null)} mode={pay?.mode} txn={pay?.txn} defaults={pay?.defaults} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={deleteContractor} title={`Delete contractor ${c.code}?`}
        message={`${c.name} and all records under them will be removed:`}
        details={[`${c.payments.length} payment record(s) with bills (${lkr(c.total_paid)})`, `Removed as wiring contractor from ${c.projects.length} project(s) – the projects themselves are kept`]} />
      <ConfirmDialog open={Boolean(delTxn)} onClose={() => setDelTxn(null)} onConfirm={deletePayment} title={`Delete ${delTxn?.code}?`} message="This payment and its bills will be removed from all finance records." />
    </div>
  );
}
