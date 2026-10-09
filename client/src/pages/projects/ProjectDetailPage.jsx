import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import {
  ArrowLeft, BatteryCharging, Cable, CalendarCheck, CalendarPlus, CheckCircle2, ClipboardList, Download, Eye, FileSignature, FileSpreadsheet, FileText,
  HardHat, Mail, MapPin, Pencil, Phone, Plus, Printer, Receipt, Save, ShieldCheck, Sun, Trash2, Wallet, Wrench, XCircle, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, deleteWithCode, errorMessage } from '../../lib/api';
import { daysLabel, fmtDate, fmtDateTime, lkr, today } from '../../lib/format';
import { categoryLabel, COMPONENT_TYPES, INVOICE_STATUS, PROJECT_STATUSES, QUOTATION_STATUS, statusOf } from '../../lib/constants';
import { openDocument, openFile } from '../../lib/docs';
import { rules, useForm } from '../../lib/useForm';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, InfoItem, Input, Modal, PageHeader, PageLoader, Row, Select, Table, Tabs, Textarea,
} from '../../components/ui';
import TxnTable from '../finance/TxnTable';
import TransactionFormModal from '../finance/TransactionFormModal';
import InvoiceFormModal from '../finance/InvoiceFormModal';
import QuotationFormModal from '../finance/QuotationFormModal';

const ICONS = { solar_panel: Sun, inverter: Zap, battery: BatteryCharging };

function warrantyBadge(expiry) {
  if (!expiry) return <Badge>No date</Badge>;
  const d = dayjs(expiry).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (d < 0) return <Badge tone="bad">Expired</Badge>;
  if (d <= 30) return <Badge tone="brand">{daysLabel(d)}</Badge>;
  if (d <= 180) return <Badge tone="warn">Expires in {Math.round(d / 30)} mo</Badge>;
  return <Badge tone="ok">Active</Badge>;
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [txnModal, setTxnModal] = useState(null); // { mode, txn }
  const [deleteTxn, setDeleteTxn] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [quoteModal, setQuoteModal] = useState(null);

  const { data: p, isLoading, error, refetch } = useQuery({ queryKey: ['project', id], queryFn: () => api.get(`/projects/${id}`).then((r) => r.data) });

  const invalidate = () => ['project', 'projects', 'dashboard', 'finance', 'transactions', 'notifications', 'upcoming', 'contractor'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const deleteProject = async (code) => {
    const r = await deleteWithCode(`/projects/${id}`, code);
    toast.success(r.data.message);
    ['invoices', 'quotations', 'contractors'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    invalidate();
    navigate('/projects');
  };
  const status = useMutation({
    mutationFn: (s) => api.patch(`/projects/${id}/status`, { status: s }),
    onSuccess: () => {
      toast.success('Project status updated');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const deleteTransaction = async (code) => {
    await deleteWithCode(`/transactions/${deleteTxn.id}`, code);
    toast.success(`${deleteTxn.code} permanently deleted`);
    invalidate();
  };

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const s = statusOf(p.status);
  const pct = p.contract_value > 0 ? Math.min(100, (p.collected / p.contract_value) * 100) : 0;
  const pdfUrl = `/projects/${p.id}/pdf`;

  const tabs = [
    { value: 'overview', label: 'Overview', icon: ClipboardList },
    { value: 'components', label: 'Components', icon: Sun, count: p.components.length },
    { value: 'wiring', label: 'Wiring', icon: Cable, count: p.wiring.length },
    { value: 'service', label: 'Service', icon: Wrench, count: p.services.length },
    { value: 'payments', label: 'Payments', icon: Wallet, count: p.transactions.length },
    { value: 'documents', label: 'Invoices & Quotes', icon: FileText, count: p.invoices.length + p.quotations.length },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={<Link to="/projects" className="flex items-center gap-1 hover:text-txt"><ArrowLeft className="h-3.5 w-3.5" /> Projects</Link>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.title}
            <Badge tone={s.tone} dot className="!text-xs">{s.label}</Badge>
          </span>
        }
        subtitle={<span><span className="code">{p.code}</span> · {categoryLabel(p.category)} · Created {fmtDate(p.created_at)}</span>}
        actions={
          <>
            <Button variant="secondary" icon={Eye} onClick={() => openDocument(pdfUrl, 'view')}>Summary</Button>
            <Button variant="secondary" icon={Download} onClick={() => openDocument(pdfUrl, 'download')}>PDF</Button>
            <Button variant="gold" icon={Printer} onClick={() => openDocument(pdfUrl, 'print')}>Print</Button>
            <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/projects/${p.id}/edit`)}>Edit</Button>
            <Button variant="danger" size="icon" onClick={() => setConfirmDelete(true)} title="Delete project"><Trash2 className="h-4 w-4" /></Button>
          </>
        }
      />

      {/* finance strip */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Contract value', value: lkr(p.contract_value), icon: FileSignature, tone: 'text-gold' },
          { label: 'Collected', value: lkr(p.collected), icon: Receipt, tone: 'text-ok', extra: true },
          { label: 'Balance due', value: lkr(p.balance_due), icon: Wallet, tone: p.balance_due > 0 ? 'text-brand' : 'text-ok' },
          { label: 'Project expenses', value: lkr(p.spent), icon: HardHat, tone: 'text-info' },
        ].map((x, i) => (
          <motion.div key={x.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">{x.label}</p>
              <x.icon className={`h-4 w-4 ${x.tone}`} />
            </div>
            <p className="mt-2 text-xl font-extrabold">{x.value}</p>
            {x.extra && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <motion.div className="bg-brand-gradient h-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader icon={Phone} title="Customer" />
              <div className="space-y-4 p-5">
                <InfoItem label="Name">{p.customer_name}</InfoItem>
                <InfoItem label="Address"><span className="flex gap-1.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{p.customer_address}</span></InfoItem>
                <InfoItem label="Contact numbers">
                  <div className="flex flex-col gap-1">
                    {p.customer_phones.map((ph) => <a key={ph} href={`tel:${ph}`} className="flex items-center gap-1.5 hover:text-brand"><Phone className="h-3.5 w-3.5 text-dim" />{ph}</a>)}
                  </div>
                </InfoItem>
                {p.customer_email && <InfoItem label="Email"><a href={`mailto:${p.customer_email}`} className="flex items-center gap-1.5 hover:text-brand"><Mail className="h-3.5 w-3.5 text-dim" />{p.customer_email}</a></InfoItem>}
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader icon={ClipboardList} title="Project information" action={
                <div className="w-44"><Select value={p.status} onChange={(e) => status.mutate(e.target.value)} options={PROJECT_STATUSES} /></div>
              } />
              <div className="grid gap-5 p-5 sm:grid-cols-3">
                <InfoItem label="Project ID"><span className="code text-sm">{p.code}</span></InfoItem>
                <InfoItem label="Category">{categoryLabel(p.category)}</InfoItem>
                <InfoItem label="Status"><Badge tone={s.tone} dot>{s.label}</Badge></InfoItem>
                <InfoItem label="Start date">{p.start_date && fmtDate(p.start_date)}</InfoItem>
                <InfoItem label="Installation date">{p.installation_date && fmtDate(p.installation_date)}</InfoItem>
                <InfoItem label="Wiring contractor">
                  {p.wiring_contractor_id && <Link to={`/contractors/${p.wiring_contractor_id}`} className="hover:text-brand">{p.contractor_name} <span className="code">{p.contractor_code}</span></Link>}
                </InfoItem>
                {p.description && <InfoItem label="Description" className="sm:col-span-3"><p className="font-normal whitespace-pre-wrap text-muted">{p.description}</p></InfoItem>}
              </div>
              <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
                {COMPONENT_TYPES.map((t) => {
                  const Icon = ICONS[t.value];
                  const list = p.components.filter((c) => c.component_type === t.value);
                  return (
                    <button key={t.value} onClick={() => setTab('components')} className="bg-surface p-4 text-left transition hover:bg-surface-2">
                      <Icon className="mb-2 h-5 w-5 text-brand" />
                      <p className="text-xs text-muted">{t.label}</p>
                      <p className="truncate text-sm font-bold">{list.length ? list.map((c) => `${c.brand} ${c.size}${c.quantity > 1 ? ` ×${c.quantity}` : ''}`).join(', ') : '—'}</p>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {tab === 'components' && (
          <Card>
            <CardHeader icon={ShieldCheck} title="System components & warranties" subtitle="Reminders are sent 2 days and 1 day before each warranty expires" action={<Button size="sm" variant="secondary" icon={Pencil} onClick={() => navigate(`/projects/${p.id}/edit`)}>Edit components</Button>} />
            {!p.components.length ? <EmptyState icon={Sun} title="No components recorded" action={<Button icon={Plus} onClick={() => navigate(`/projects/${p.id}/edit`)}>Add components</Button>} /> : (
              <Table head={['Component', 'Brand / Model', 'Size', 'Qty', 'Warranty', 'Expires', 'Status', 'Serial numbers']}>
                {p.components.map((c, i) => {
                  const Icon = ICONS[c.component_type];
                  return (
                    <Row key={c.id} index={i}>
                      <td className="td"><span className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-brand" />{COMPONENT_TYPES.find((t) => t.value === c.component_type).single}</span></td>
                      <td className="td">{c.brand}{c.model && <span className="text-muted"> · {c.model}</span>}</td>
                      <td className="td">{c.size}</td>
                      <td className="td">{c.quantity}</td>
                      <td className="td">{c.warranty_years} yrs</td>
                      <td className="td whitespace-nowrap">{fmtDate(c.warranty_expiry)}</td>
                      <td className="td">{warrantyBadge(c.warranty_expiry)}</td>
                      <td className="td max-w-[200px] truncate text-xs text-muted">{c.serial_numbers || '—'}</td>
                    </Row>
                  );
                })}
              </Table>
            )}
          </Card>
        )}

        {tab === 'wiring' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader icon={HardHat} title="Wiring contractor" />
              <div className="space-y-4 p-5">
                {p.wiring_contractor_id ? (
                  <>
                    <InfoItem label="Name"><Link to={`/contractors/${p.wiring_contractor_id}`} className="hover:text-brand">{p.contractor_name}</Link></InfoItem>
                    <InfoItem label="Contractor ID"><span className="code text-sm">{p.contractor_code}</span></InfoItem>
                    <InfoItem label="Phone">{p.contractor_phone}</InfoItem>
                    <InfoItem label="Company">{p.contractor_company}</InfoItem>
                    <Button size="sm" icon={Wallet} onClick={() => setTxnModal({ mode: 'contractor', defaults: { project_id: p.id, contractor_id: p.wiring_contractor_id } })}>Pay contractor</Button>
                  </>
                ) : <p className="text-sm text-muted">No contractor assigned. Edit the project to assign one.</p>}
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader icon={Cable} title="Wiring materials" />
              {!p.wiring.length ? <EmptyState icon={Cable} title="No wiring recorded" /> : (
                <Table head={['Brand', 'Type', 'Size', 'Length', 'Notes']}>
                  {p.wiring.map((w, i) => (
                    <Row key={w.id} index={i}>
                      <td className="td font-semibold">{w.brand}</td>
                      <td className="td">{w.wire_type}</td>
                      <td className="td">{w.size || '—'}</td>
                      <td className="td">{w.length || '—'}</td>
                      <td className="td text-muted">{w.notes || '—'}</td>
                    </Row>
                  ))}
                </Table>
              )}
              {p.wiring_notes && <p className="border-t border-line p-5 text-sm whitespace-pre-wrap text-muted">{p.wiring_notes}</p>}
            </Card>
          </div>
        )}

        {tab === 'service' && <ServiceTab project={p} onChanged={invalidate} />}

        {tab === 'payments' && (
          <Card>
            <CardHeader
              icon={Wallet}
              title="Payments & expenses"
              subtitle="Click a reference to view, download or print the receipt / voucher"
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={Printer} onClick={() => openDocument('/transactions/export/pdf', 'print', { project_id: p.id, title: `Project Statement ${p.code}` })}>Statement</Button>
                  <Button size="sm" variant="secondary" icon={HardHat} onClick={() => setTxnModal({ mode: 'contractor', defaults: { project_id: p.id, contractor_id: p.wiring_contractor_id } })}>Pay contractor</Button>
                  <Button size="sm" variant="secondary" icon={Receipt} onClick={() => setTxnModal({ mode: 'expense', defaults: { project_id: p.id } })}>Add expense</Button>
                  <Button size="sm" icon={Plus} onClick={() => setTxnModal({ mode: 'collection', defaults: { project_id: p.id, party: p.customer_name } })}>Record payment</Button>
                </div>
              }
            />
            {!p.transactions.length ? <EmptyState icon={Wallet} title="No payments yet" message="Record customer payments and project expenses here." /> : (
              <TxnTable rows={p.transactions.map((t) => ({ ...t, project_code: p.code, customer_name: p.customer_name }))} showProject={false} onEdit={(t) => setTxnModal({ txn: t })} onDelete={setDeleteTxn} />
            )}
          </Card>
        )}

        {tab === 'documents' && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader icon={FileSpreadsheet} title="Invoices" action={<Button size="sm" icon={Plus} onClick={() => setInvoiceModal({ defaults: { project_id: p.id } })}>New invoice</Button>} />
              {!p.invoices.length ? <EmptyState icon={FileSpreadsheet} title="No invoices" /> : (
                <ul className="divide-y divide-line">
                  {p.invoices.map((inv) => {
                    const st = inv.status === 'cancelled' ? INVOICE_STATUS.cancelled : inv.balance <= 0 ? INVOICE_STATUS.paid : inv.due_date && inv.due_date < today() ? INVOICE_STATUS.overdue : inv.paid > 0 ? INVOICE_STATUS.partial : INVOICE_STATUS.unpaid;
                    return (
                      <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2"><span className="code">{inv.code}</span><Badge tone={st.tone}>{st.label}</Badge></p>
                          <p className="text-xs text-muted">Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)} · Balance {lkr(inv.balance)}</p>
                        </div>
                        <p className="font-bold">{lkr(inv.total)}</p>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="Download" onClick={() => openDocument(`/invoices/${inv.id}/pdf`, 'download')}><Download className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Print" onClick={() => openDocument(`/invoices/${inv.id}/pdf`, 'print')}><Printer className="h-4 w-4" /></Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader icon={FileText} title="Quotations" action={<Button size="sm" icon={Plus} onClick={() => setQuoteModal({ defaults: { project_id: p.id } })}>Upload quotation</Button>} />
              {!p.quotations.length ? <EmptyState icon={FileText} title="No quotations" /> : (
                <ul className="divide-y divide-line">
                  {p.quotations.map((q) => (
                    <li key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2"><span className="code">{q.code}</span><Badge tone={QUOTATION_STATUS[q.status].tone}>{QUOTATION_STATUS[q.status].label}</Badge></p>
                        <p className="truncate text-sm font-medium">{q.title}</p>
                        <p className="truncate text-xs text-muted">{fmtDate(q.quote_date)} · {q.file_name}</p>
                      </div>
                      <p className="font-bold">{lkr(q.amount)}</p>
                      {q.file_id && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="Open" onClick={() => openFile(q.file_id)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Download" onClick={() => openFile(q.file_id, true)}><Download className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </motion.div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteProject}
        title={`Delete project ${p.code}?`}
        message={`"${p.title}" for ${p.customer_name} and everything recorded under it will be removed:`}
        details={[
          `${p.components.length} component(s), ${p.wiring.length} wiring item(s), ${p.services.length} service date(s)`,
          `${p.transactions.length} payment / expense record(s) with their bills`,
          `${p.invoices.length} invoice(s) and ${p.quotations.length} quotation(s) with files`,
          'Service agreement and notifications',
        ]}
      />
      <ConfirmDialog
        open={Boolean(deleteTxn)}
        onClose={() => setDeleteTxn(null)}
        onConfirm={deleteTransaction}
        title={`Delete ${deleteTxn?.code}?`}
        message="This record and its attached bills will be removed from all finance records and statements."
      />
      <TransactionFormModal open={Boolean(txnModal)} onClose={() => setTxnModal(null)} mode={txnModal?.mode} txn={txnModal?.txn} defaults={txnModal?.defaults} />
      <InvoiceFormModal open={Boolean(invoiceModal)} onClose={() => setInvoiceModal(null)} defaults={invoiceModal?.defaults} />
      <QuotationFormModal open={Boolean(quoteModal)} onClose={() => setQuoteModal(null)} defaults={quoteModal?.defaults} />
    </div>
  );
}

function ServiceTab({ project: p, onChanged }) {
  const [text, setText] = useState(p.service_agreement || '');
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null); // {service?}
  const [removing, setRemoving] = useState(null);
  useEffect(() => setText(p.service_agreement || ''), [p.service_agreement]);
  const dirty = text !== (p.service_agreement || '');

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/projects/${p.id}/service-agreement`, { service_agreement: text });
      toast.success('Service agreement saved');
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (sv, status) => {
    try {
      await api.put(`/projects/${p.id}/services/${sv.id}`, { ...sv, status });
      toast.success(status === 'completed' ? 'Service marked as completed' : 'Service updated');
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async (code) => {
    await deleteWithCode(`/projects/${p.id}/services/${removing.id}`, code);
    toast.success('Service removed');
    onChanged();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader icon={FileSignature} title="Service agreement" subtitle={p.service_agreement_at ? `Last saved ${fmtDateTime(p.service_agreement_at)}` : 'Not saved yet'}
          action={<Button size="sm" icon={Save} loading={saving} disabled={!dirty} onClick={save}>Save</Button>} />
        <div className="p-5">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} className="min-h-[320px]" placeholder="Type the service agreement terms…" />
          <div className="mt-2 flex justify-between text-xs text-dim">
            <span>{dirty ? <span className="font-semibold text-brand">Unsaved changes</span> : 'All changes saved'}</span>
            <span>{text.length.toLocaleString()} / 20,000</span>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader icon={CalendarCheck} title="Service schedule" subtitle="Notified 2 days and 1 day before each visit" action={<Button size="sm" icon={CalendarPlus} onClick={() => setModal({})}>Add service date</Button>} />
        {!p.services.length ? <EmptyState icon={Wrench} title="No services scheduled" message="Add service visit dates to get reminders." /> : (
          <ul className="divide-y divide-line">
            {p.services.map((sv) => {
              const d = dayjs(sv.service_date).diff(dayjs().startOf('day'), 'day');
              return (
                <li key={sv.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-center leading-tight ${sv.status === 'completed' ? 'bg-ok/12 text-ok' : sv.status === 'cancelled' ? 'bg-surface-3 text-dim' : d < 0 ? 'bg-bad/12 text-bad' : 'bg-brand/12 text-brand'}`}>
                    <div><p className="text-base font-extrabold">{dayjs(sv.service_date).format('DD')}</p><p className="text-[10px] font-bold uppercase">{dayjs(sv.service_date).format('MMM')}</p></div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{sv.title}</p>
                    <p className="text-xs text-muted">{fmtDate(sv.service_date)}{sv.notes ? ` · ${sv.notes}` : ''}</p>
                  </div>
                  {sv.status === 'scheduled' ? <Badge tone={d < 0 ? 'bad' : d <= 2 ? 'brand' : 'info'}>{daysLabel(d)}</Badge> : <Badge tone={sv.status === 'completed' ? 'ok' : 'muted'}>{sv.status === 'completed' ? 'Completed' : 'Cancelled'}</Badge>}
                  <div className="flex gap-1">
                    {sv.status === 'scheduled' && <Button variant="ghost" size="icon" title="Mark completed" onClick={() => setStatus(sv, 'completed')}><CheckCircle2 className="h-4 w-4 text-ok" /></Button>}
                    {sv.status === 'scheduled' && <Button variant="ghost" size="icon" title="Cancel" onClick={() => setStatus(sv, 'cancelled')}><XCircle className="h-4 w-4" /></Button>}
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => setModal({ service: sv })}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Remove" onClick={() => setRemoving(sv)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <ServiceModal open={Boolean(modal)} service={modal?.service} projectId={p.id} onClose={(saved) => { setModal(null); if (saved) onChanged(); }} />
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} title="Remove service?" message={`"${removing?.title}" on ${fmtDate(removing?.service_date)} and its reminders will be removed.`} />
    </div>
  );
}

function ServiceModal({ open, service, projectId, onClose }) {
  const form = useForm({ service_date: '', title: '', notes: '', status: 'scheduled' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    form.setErrors({});
    form.setValues(service ? { service_date: service.service_date, title: service.title, notes: service.notes || '', status: service.status } : { service_date: '', title: '', notes: '', status: 'scheduled' });
  }, [open, service]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = form.values;
    if (!form.check({ service_date: rules.required(v.service_date, 'Service date'), title: rules.required(v.title, 'Service title') })) return;
    setSaving(true);
    try {
      if (service) await api.put(`/projects/${projectId}/services/${service.id}`, v);
      else await api.post(`/projects/${projectId}/services`, v);
      toast.success(service ? 'Service updated' : 'Service scheduled – reminders are set');
      onClose(true);
    } catch (e) {
      form.serverError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={() => onClose(false)} size="sm" icon={CalendarPlus} title={service ? 'Edit service' : 'Schedule service'}
      footer={<><Button variant="secondary" onClick={() => onClose(false)}>Cancel</Button><Button icon={Save} loading={saving} onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Service date" required error={form.errors.service_date}><Input type="date" {...form.bind('service_date')} /></Field>
        <Field label="Service" required error={form.errors.title}><Input {...form.bind('title')} placeholder="e.g. Annual inspection" /></Field>
        <Field label="Notes"><Textarea {...form.bind('notes')} className="min-h-[70px]" /></Field>
        {service && <Field label="Status"><Select {...form.bind('status')} options={[{ value: 'scheduled', label: 'Scheduled' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]} /></Field>}
      </div>
    </Modal>
  );
}
