import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, toFormData } from '../../lib/api';
import { lkr, today } from '../../lib/format';
import { QUOTATION_STATUS } from '../../lib/constants';
import { rules, useForm } from '../../lib/useForm';
import { Button, Field, FieldError, Input, Modal, Select, Textarea } from '../../components/ui';
import FileDrop from '../../components/FileDrop';

const DOC_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const blank = () => ({ project_id: '', customer_name: '', title: '', amount: '', quote_date: today(), valid_until: '', status: 'sent', notes: '' });

export default function QuotationFormModal({ open, onClose, quotation, defaults = {} }) {
  const qc = useQueryClient();
  const form = useForm(blank());
  const { values: v, setValues, bind, check, serverError, errors, setErrors } = form;
  const [file, setFile] = useState([]);
  const [saving, setSaving] = useState(false);
  const { data: projects = [] } = useQuery({ queryKey: ['projects', 'options'], queryFn: () => api.get('/projects/options').then((r) => r.data), enabled: open });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFile([]);
    if (quotation) {
      setValues({
        project_id: quotation.project_id ? String(quotation.project_id) : '', customer_name: quotation.customer_name, title: quotation.title,
        amount: String(quotation.amount), quote_date: quotation.quote_date, valid_until: quotation.valid_until || '', status: quotation.status, notes: quotation.notes || '',
      });
    } else {
      const p = projects.find((x) => String(x.id) === String(defaults.project_id));
      setValues({ ...blank(), ...(p ? { project_id: String(p.id), customer_name: p.customer_name, title: p.title } : {}) });
    }
  }, [open, quotation, projects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const ok = check({
      customer_name: rules.required(v.customer_name, 'Customer name'),
      title: rules.required(v.title, 'Title'),
      amount: rules.money(v.amount, 'Amount'),
      quote_date: rules.required(v.quote_date, 'Quotation date'),
      valid_until: v.valid_until && v.valid_until < v.quote_date ? 'Valid-until date cannot be before the quotation date' : null,
      file: !quotation && !file.length ? 'Attach the quotation (PDF or Word)' : null,
    });
    if (!ok) return;
    setSaving(true);
    try {
      const body = toFormData(v, { file });
      const { data } = quotation ? await api.put(`/quotations/${quotation.id}`, body) : await api.post('/quotations', body);
      toast.success(quotation ? `Quotation ${data.code} updated` : `Quotation ${data.code} uploaded`);
      ['quotations', 'project'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
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
      icon={FileText}
      title={quotation ? `Edit quotation ${quotation.code}` : 'Upload quotation'}
      subtitle="PDF or Word documents up to 4 MB"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose()}>Cancel</Button>
          <Button icon={Save} loading={saving} onClick={submit}>{quotation ? 'Save changes' : 'Upload'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" className="sm:col-span-2" hint="Optional – link to an existing project">
          <Select
            value={v.project_id}
            onChange={(e) => {
              const p = projects.find((x) => String(x.id) === e.target.value);
              setValues((s) => ({ ...s, project_id: e.target.value, ...(p ? { customer_name: s.customer_name || p.customer_name, title: s.title || p.title } : {}) }));
            }}
            placeholder="Not linked to a project"
            options={projects.map((p) => ({ value: String(p.id), label: `${p.code} – ${p.title} (${p.customer_name})` }))}
          />
        </Field>
        <Field label="Customer name" required error={errors.customer_name}><Input {...bind('customer_name')} /></Field>
        <Field label="Title" required error={errors.title}><Input {...bind('title')} placeholder="e.g. 5kW on-grid system" /></Field>
        <Field label="Quoted amount (LKR)" required error={errors.amount} hint={v.amount ? lkr(v.amount) : undefined}><Input type="number" min="0" step="0.01" {...bind('amount')} /></Field>
        <Field label="Status"><Select {...bind('status')} options={Object.entries(QUOTATION_STATUS).map(([value, s]) => ({ value, label: s.label }))} /></Field>
        <Field label="Quotation date" required error={errors.quote_date}><Input type="date" {...bind('quote_date')} /></Field>
        <Field label="Valid until" error={errors.valid_until}><Input type="date" {...bind('valid_until')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea {...bind('notes')} className="min-h-[70px]" /></Field>
        <div className="sm:col-span-2">
          <label className="label">Quotation file {!quotation && <span className="text-brand">*</span>}</label>
          {quotation?.file_name && !file.length && <p className="mb-2 text-xs text-muted">Current file: <b className="text-txt">{quotation.file_name}</b> – upload a new one to replace it</p>}
          <FileDrop files={file} onChange={(f) => { setFile(f); setErrors((e) => ({ ...e, file: undefined })); }} types={DOC_TYPES} accept=".pdf,.doc,.docx" error={errors.file} hint="PDF, DOC or DOCX" />
          <FieldError error={errors.file} />
        </div>
      </div>
    </Modal>
  );
}
