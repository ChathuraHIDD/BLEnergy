import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { FileSpreadsheet, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { api } from '../../lib/api';
import { lkr, today } from '../../lib/format';
import { rules, useForm } from '../../lib/useForm';
import { Button, Field, FieldError, Input, Modal, Select, Textarea } from '../../components/ui';

const newItem = () => ({ description: '', quantity: '1', unit_price: '' });
const blank = () => ({
  project_id: '', customer_name: '', customer_address: '', customer_phone: '', issue_date: today(),
  due_date: dayjs().add(14, 'day').format('YYYY-MM-DD'), discount: '', tax_rate: '', notes: '', status: 'issued', items: [newItem()],
});

export default function InvoiceFormModal({ open, onClose, invoice, defaults = {} }) {
  const qc = useQueryClient();
  const form = useForm(blank());
  const { values: v, setValue, setValues, bind, check, serverError, errors, setErrors } = form;
  const [saving, setSaving] = useState(false);
  const { data: projects = [] } = useQuery({ queryKey: ['projects', 'options'], queryFn: () => api.get('/projects/options').then((r) => r.data), enabled: open });

  const fromProject = (pid, base) => {
    const p = projects.find((x) => String(x.id) === String(pid));
    if (!p) return base;
    return { ...base, project_id: String(p.id), customer_name: p.customer_name, customer_address: p.customer_address, customer_phone: p.customer_phones?.[0] || '' };
  };

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (invoice) {
      setValues({
        project_id: invoice.project_id ? String(invoice.project_id) : '', customer_name: invoice.customer_name,
        customer_address: invoice.customer_address || '', customer_phone: invoice.customer_phone || '',
        issue_date: invoice.issue_date, due_date: invoice.due_date || '', discount: invoice.discount ? String(invoice.discount) : '',
        tax_rate: invoice.tax_rate ? String(invoice.tax_rate) : '', notes: invoice.notes || '', status: invoice.status,
        items: invoice.items.map((i) => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price) })),
      });
    } else {
      setValues(fromProject(defaults.project_id, blank()));
    }
  }, [open, invoice, projects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setItem = (i, k, val) => {
    setValue('items', v.items.map((it, j) => (j === i ? { ...it, [k]: val } : it)));
    setErrors((e) => ({ ...e, [`items.${i}.${k}`]: undefined, items: undefined }));
  };

  const subtotal = v.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const discount = Number(v.discount) || 0;
  const tax = ((subtotal - discount) * (Number(v.tax_rate) || 0)) / 100;
  const total = subtotal - discount + tax;

  const submit = async () => {
    const e = {
      customer_name: rules.required(v.customer_name, 'Customer name'),
      issue_date: rules.required(v.issue_date, 'Issue date'),
      due_date: v.due_date && v.due_date < v.issue_date ? 'Due date cannot be before the issue date' : null,
      discount: rules.money(v.discount, 'Discount', { required: false }) || (discount > subtotal ? 'Discount cannot be more than the subtotal' : null),
      tax_rate: rules.money(v.tax_rate, 'Tax rate', { required: false }) || (Number(v.tax_rate) > 100 ? 'Tax rate cannot exceed 100%' : null),
      items: v.items.length ? null : 'Add at least one line item',
    };
    v.items.forEach((it, i) => {
      e[`items.${i}.description`] = rules.required(it.description, 'Description');
      e[`items.${i}.quantity`] = rules.money(it.quantity, 'Qty', { positive: true });
      e[`items.${i}.unit_price`] = rules.money(it.unit_price, 'Price');
    });
    if (!check(e)) return;
    setSaving(true);
    try {
      const payload = { ...v, discount: v.discount || 0, tax_rate: v.tax_rate || 0 };
      const { data } = invoice ? await api.put(`/invoices/${invoice.id}`, payload) : await api.post('/invoices', payload);
      toast.success(invoice ? `Invoice ${data.code} updated` : `Invoice ${data.code} created`);
      ['invoices', 'finance', 'project', 'notifications', 'upcoming'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose(data);
    } catch (err) {
      serverError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => onClose()}
      size="xl"
      icon={FileSpreadsheet}
      title={invoice ? `Edit invoice ${invoice.code}` : 'Create invoice'}
      subtitle="Invoice number is generated automatically"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose()}>Cancel</Button>
          <Button icon={Save} loading={saving} onClick={submit}>{invoice ? 'Save changes' : 'Create invoice'}</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Project" className="md:col-span-3" hint="Selecting a project fills in the customer details">
          <Select
            value={v.project_id}
            onChange={(e) => setValues((s) => (e.target.value ? fromProject(e.target.value, s) : { ...s, project_id: '' }))}
            placeholder="Not linked to a project"
            options={projects.map((p) => ({ value: String(p.id), label: `${p.code} – ${p.title} (${p.customer_name})` }))}
          />
        </Field>
        <Field label="Customer name" required error={errors.customer_name}><Input {...bind('customer_name')} /></Field>
        <Field label="Phone"><Input {...bind('customer_phone')} /></Field>
        <Field label="Address"><Input {...bind('customer_address')} /></Field>
        <Field label="Issue date" required error={errors.issue_date}><Input type="date" {...bind('issue_date')} /></Field>
        <Field label="Due date" error={errors.due_date} hint="Reminder 2 days and 1 day before"><Input type="date" {...bind('due_date')} /></Field>
        {invoice ? (
          <Field label="Status"><Select {...bind('status')} options={[{ value: 'issued', label: 'Issued' }, { value: 'cancelled', label: 'Cancelled' }]} /></Field>
        ) : <div />}
      </div>

      <div className="mt-6">
        <label className="label">Line items <span className="text-brand">*</span></label>
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="hidden grid-cols-[1fr_100px_160px_150px_44px] gap-3 bg-surface-2 px-4 py-2.5 text-[11px] font-bold tracking-wider text-dim uppercase md:grid">
            <span>Description</span><span>Qty</span><span>Unit price</span><span className="text-right">Amount</span><span />
          </div>
          <AnimatePresence initial={false}>
            {v.items.map((it, i) => (
              <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="border-t border-line first:border-t-0">
                <div className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_100px_160px_150px_44px] md:items-start">
                  <div>
                    <Input value={it.description} error={errors[`items.${i}.description`]} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="Item or service" />
                    <FieldError error={errors[`items.${i}.description`]} />
                  </div>
                  <div>
                    <Input type="number" min="0" step="0.01" value={it.quantity} error={errors[`items.${i}.quantity`]} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
                    <FieldError error={errors[`items.${i}.quantity`]} />
                  </div>
                  <div>
                    <Input type="number" min="0" step="0.01" value={it.unit_price} error={errors[`items.${i}.unit_price`]} onChange={(e) => setItem(i, 'unit_price', e.target.value)} placeholder="0.00" />
                    <FieldError error={errors[`items.${i}.unit_price`]} />
                  </div>
                  <p className="pt-2.5 text-right text-sm font-bold">{lkr((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</p>
                  <Button variant="ghost" size="icon" disabled={v.items.length === 1} onClick={() => setValue('items', v.items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <FieldError error={errors.items} />
        <Button variant="secondary" size="sm" icon={Plus} className="mt-3" onClick={() => setValue('items', [...v.items, newItem()])}>Add line</Button>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Discount (LKR)" error={errors.discount}><Input type="number" min="0" step="0.01" {...bind('discount')} placeholder="0.00" /></Field>
            <Field label="Tax rate (%)" error={errors.tax_rate}><Input type="number" min="0" max="100" step="0.01" {...bind('tax_rate')} placeholder="0" /></Field>
          </div>
          <Field label="Notes"><Textarea {...bind('notes')} className="min-h-[70px]" placeholder="Payment terms, bank details…" /></Field>
        </div>
        <div className="space-y-2 self-end rounded-2xl border border-line bg-surface-2 p-5 text-sm">
          <p className="flex justify-between text-muted">Subtotal <span className="font-semibold text-txt">{lkr(subtotal)}</span></p>
          {discount > 0 && <p className="flex justify-between text-muted">Discount <span className="font-semibold text-txt">- {lkr(discount)}</span></p>}
          {tax > 0 && <p className="flex justify-between text-muted">Tax ({v.tax_rate}%) <span className="font-semibold text-txt">{lkr(tax)}</span></p>}
          <p className="flex justify-between border-t border-line pt-3 text-base font-extrabold">Total <span className="text-gradient">{lkr(total)}</span></p>
        </div>
      </div>
    </Modal>
  );
}
