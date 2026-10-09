import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, FileText, Receipt, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, toFormData } from '../../lib/api';
import { fileSize, lkr, today } from '../../lib/format';
import { CONTRACTOR_PAYMENT, PAYMENT_METHODS, PROJECT_PAYMENT } from '../../lib/constants';
import { openFile } from '../../lib/docs';
import { rules, useForm } from '../../lib/useForm';
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import Combobox from '../../components/Combobox';
import FileDrop from '../../components/FileDrop';

const BILL_TYPES = [
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
];

const blank = (preset = {}) => ({
  kind: 'income', category: '', amount: '', txn_date: today(), payment_method: 'cash', reference: '', party: '',
  project_id: '', contractor_id: '', invoice_id: '', description: '', ...preset,
});

/**
 * mode: 'collection' (project payment), 'contractor' (contractor payment), 'income', 'expense' or undefined (free)
 * defaults: values to prefill, e.g. { project_id }
 */
export default function TransactionFormModal({ open, onClose, txn, mode, defaults = {} }) {
  const qc = useQueryClient();
  const form = useForm(blank());
  const { values: v, setValue, setValues, bind, check, serverError, setErrors, errors } = form;
  const [files, setFiles] = useState([]);
  const [removeIds, setRemoveIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const { data: cats = { income: [], expense: [] } } = useQuery({ queryKey: ['txn-categories'], queryFn: () => api.get('/transactions/categories').then((r) => r.data), enabled: open });
  const { data: projects = [] } = useQuery({ queryKey: ['projects', 'options'], queryFn: () => api.get('/projects/options').then((r) => r.data), enabled: open });
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors', 'all'], queryFn: () => api.get('/contractors').then((r) => r.data), enabled: open });
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', 'for', v.project_id],
    queryFn: () => api.get('/invoices', { params: v.project_id ? { project_id: v.project_id } : {} }).then((r) => r.data),
    enabled: open && v.kind === 'income',
  });
  const { data: projectInfo } = useQuery({
    queryKey: ['project', v.project_id],
    queryFn: () => api.get(`/projects/${v.project_id}`).then((r) => r.data),
    enabled: open && Boolean(v.project_id),
  });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFiles([]);
    setRemoveIds([]);
    if (txn) {
      setValues({
        kind: txn.kind, category: txn.category, amount: String(txn.amount), txn_date: txn.txn_date, payment_method: txn.payment_method,
        reference: txn.reference || '', party: txn.party || '', project_id: txn.project_id ? String(txn.project_id) : '',
        contractor_id: txn.contractor_id ? String(txn.contractor_id) : '', invoice_id: txn.invoice_id ? String(txn.invoice_id) : '',
        description: txn.description || '',
      });
    } else {
      const preset =
        mode === 'collection' ? { kind: 'income', category: PROJECT_PAYMENT }
          : mode === 'contractor' ? { kind: 'expense', category: CONTRACTOR_PAYMENT }
            : mode === 'expense' ? { kind: 'expense' }
              : { kind: 'income' };
      setValues(blank({ ...preset, ...Object.fromEntries(Object.entries(defaults).map(([k, x]) => [k, x == null ? '' : String(x)])) }));
    }
  }, [open, txn]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCollection = v.category === PROJECT_PAYMENT;
  const isContractorPay = v.category === CONTRACTOR_PAYMENT;
  const lockedKind = Boolean(txn) || ['collection', 'contractor', 'income', 'expense'].includes(mode);

  // Balance remaining on the selected project (excluding this transaction when editing)
  const projectBalance = useMemo(() => {
    if (!projectInfo || !isCollection || !projectInfo.contract_value) return null;
    const own = txn && txn.project_id === projectInfo.id && txn.kind === 'income' ? txn.amount : 0;
    return projectInfo.contract_value - projectInfo.collected + own;
  }, [projectInfo, isCollection, txn]);

  const selectedInvoice = invoices.find((i) => String(i.id) === v.invoice_id);
  const invoiceBalance = selectedInvoice ? selectedInvoice.balance + (txn?.invoice_id === selectedInvoice.id ? txn.amount : 0) : null;

  const submit = async () => {
    const amount = Number(v.amount);
    const ok = check({
      category: rules.required(v.category, 'Category'),
      amount: rules.money(v.amount, 'Amount', { positive: true })
        || (projectBalance !== null && amount > projectBalance + 0.001 ? (projectBalance <= 0 ? 'This project is already fully paid' : `Amount exceeds the project balance of ${lkr(projectBalance)}`) : null)
        || (invoiceBalance !== null && amount > invoiceBalance + 0.001 ? `Amount exceeds the invoice balance of ${lkr(invoiceBalance)}` : null),
      txn_date: rules.required(v.txn_date, 'Date'),
      payment_method: rules.required(v.payment_method, 'Payment method'),
      project_id: isCollection && !v.project_id ? 'Select the project this payment is for' : null,
      contractor_id: isContractorPay && !v.contractor_id ? 'Select the contractor being paid' : null,
      reference: ['bank_transfer', 'cheque'].includes(v.payment_method) && !v.reference.trim() ? `Enter the ${v.payment_method === 'cheque' ? 'cheque number' : 'bank reference'}` : null,
    });
    if (!ok) return;
    setSaving(true);
    try {
      const body = toFormData({ ...v, invoice_id: v.kind === 'income' ? v.invoice_id : '', remove_file_ids: removeIds }, { files });
      const { data } = txn ? await api.put(`/transactions/${txn.id}`, body) : await api.post('/transactions', body);
      toast.success(txn ? `${data.code} updated` : `${data.kind === 'income' ? 'Receipt' : 'Voucher'} ${data.code} recorded`);
      ['transactions', 'finance', 'dashboard', 'project', 'projects', 'contractor', 'contractors', 'invoices', 'notifications', 'txn-categories'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose(data);
    } catch (err) {
      serverError(err);
    } finally {
      setSaving(false);
    }
  };

  const title = txn ? `Edit ${txn.code}` : mode === 'collection' ? 'Record project payment' : mode === 'contractor' ? 'Pay contractor' : v.kind === 'income' ? 'Add income' : 'Add expense';
  const existingFiles = (txn?.files || []).filter((f) => !removeIds.includes(f.id));

  return (
    <Modal
      open={open}
      onClose={() => onClose()}
      size="lg"
      icon={Receipt}
      title={title}
      subtitle={txn ? 'Changes are reflected on receipts and statements' : 'A receipt / voucher number is generated automatically'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose()}>Cancel</Button>
          <Button icon={Save} loading={saving} onClick={submit}>{txn ? 'Save changes' : 'Save'}</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {!lockedKind && (
          <div className="grid grid-cols-2 gap-2 md:col-span-2">
            {[
              { k: 'income', label: 'Income', icon: ArrowDownLeft, cls: 'border-ok/50 bg-ok/10 text-ok' },
              { k: 'expense', label: 'Expense', icon: ArrowUpRight, cls: 'border-bad/50 bg-bad/10 text-bad' },
            ].map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setValues((s) => ({ ...s, kind: o.k, category: '', invoice_id: '' }))}
                className={clsx('flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-bold transition', v.kind === o.k ? o.cls : 'border-line text-muted hover:text-txt')}
              >
                <o.icon className="h-4 w-4" /> {o.label}
              </button>
            ))}
          </div>
        )}

        <Field label="Category" required error={errors.category}>
          {mode === 'collection' || mode === 'contractor' ? (
            <Input value={v.category} disabled />
          ) : (
            <Combobox value={v.category} onChange={(x) => setValue('category', x)} options={cats[v.kind] || []} placeholder="Select or type a category" error={errors.category} createLabel="Use category" />
          )}
        </Field>
        <Field label="Amount (LKR)" required error={errors.amount} hint={
          projectBalance !== null ? `Project balance: ${lkr(projectBalance)}` : invoiceBalance !== null ? `Invoice balance: ${lkr(invoiceBalance)}` : v.amount ? lkr(v.amount) : undefined
        }>
          <Input {...bind('amount')} type="number" min="0" step="0.01" placeholder="0.00" />
        </Field>
        <Field label="Date" required error={errors.txn_date}>
          <Input {...bind('txn_date')} type="date" />
        </Field>
        <Field label="Payment method" required error={errors.payment_method}>
          <Select {...bind('payment_method')} options={PAYMENT_METHODS} />
        </Field>
        <Field label="Reference" error={errors.reference} hint="Bank reference, cheque number or slip number">
          <Input {...bind('reference')} placeholder={v.payment_method === 'cheque' ? 'Cheque number' : 'Reference number'} />
        </Field>
        <Field label={v.kind === 'income' ? 'Received from' : 'Paid to'} error={errors.party}>
          <Input {...bind('party')} placeholder={isCollection ? 'Defaults to the customer' : 'Name (optional)'} />
        </Field>

        <Field label="Project" required={isCollection} error={errors.project_id}>
          <Select
            value={v.project_id}
            error={errors.project_id}
            onChange={(e) => {
              setValues((s) => ({ ...s, project_id: e.target.value, invoice_id: '' }));
              setErrors((x) => ({ ...x, project_id: undefined }));
            }}
            placeholder={isCollection ? 'Select project' : 'Not linked to a project'}
            options={projects.map((p) => ({ value: String(p.id), label: `${p.code} – ${p.title} (${p.customer_name})` }))}
          />
        </Field>
        {v.kind === 'expense' ? (
          <Field label="Contractor" required={isContractorPay} error={errors.contractor_id}>
            <Select {...bind('contractor_id')} placeholder={isContractorPay ? 'Select contractor' : 'Not linked to a contractor'} options={contractors.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` }))} />
          </Field>
        ) : (
          <Field label="Invoice" error={errors.invoice_id} hint="Optional – links this payment to an invoice">
            <Select
              {...bind('invoice_id')}
              placeholder="Not linked to an invoice"
              options={invoices
                .filter((i) => i.payment_status !== 'cancelled' && (i.balance > 0 || String(i.id) === v.invoice_id))
                .map((i) => ({ value: String(i.id), label: `${i.code} – ${i.customer_name} (bal. ${lkr(i.balance)})` }))}
            />
          </Field>
        )}

        <Field label="Description" className="md:col-span-2">
          <Textarea {...bind('description')} className="min-h-[70px]" placeholder="What is this for?" />
        </Field>

        <div className="md:col-span-2">
          <label className="label">Bills / attachments</label>
          {existingFiles.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {existingFiles.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-brand" />
                  <button type="button" className="flex-1 truncate text-left hover:text-brand" onClick={() => openFile(f.id)}>{f.name}</button>
                  <span className="text-xs text-dim">{fileSize(f.size)}</span>
                  <button type="button" onClick={() => setRemoveIds((r) => [...r, f.id])} className="text-dim hover:text-bad"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <FileDrop files={files} onChange={setFiles} multiple types={BILL_TYPES} accept=".pdf,.doc,.docx,image/*" hint="PDF, Word or image · up to 4 MB in total" />
        </div>
      </div>
    </Modal>
  );
}
