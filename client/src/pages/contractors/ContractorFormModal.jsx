import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HardHat, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { rules, useForm } from '../../lib/useForm';
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui';

const EMPTY = { name: '', phone: '', company: '', crew_count: '', email: '', address: '', specialization: '', notes: '', status: 'active' };

export default function ContractorFormModal({ open, onClose, contractor, onSaved }) {
  const qc = useQueryClient();
  const form = useForm(EMPTY);
  const { values, bind, check, serverError, setValues, setErrors } = form;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setValues(contractor ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, contractor[k] ?? ''])) : EMPTY);
  }, [open, contractor]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    const crew = values.crew_count === '' ? 0 : Number(values.crew_count);
    const ok = check({
      name: rules.required(values.name, 'Name'),
      phone: rules.required(values.phone, 'Contact number') || rules.phone(values.phone),
      crew_count: !Number.isInteger(crew) || crew < 0 ? 'Crew count must be a whole number (0 or more)' : null,
      email: rules.email(values.email),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const { data } = contractor
        ? await api.put(`/contractors/${contractor.id}`, values)
        : await api.post('/contractors', values);
      toast.success(contractor ? 'Contractor updated' : `Contractor ${data.code} registered`);
      qc.invalidateQueries({ queryKey: ['contractors'] });
      qc.invalidateQueries({ queryKey: ['contractor'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onSaved?.(data);
      onClose();
    } catch (err) {
      serverError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={HardHat}
      title={contractor ? `Edit contractor ${contractor.code}` : 'Register contractor'}
      subtitle="A unique contractor ID is generated automatically"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Save} loading={saving} onClick={submit}>{contractor ? 'Save changes' : 'Register contractor'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" required error={form.errors.name}>
          <Input {...bind('name')} placeholder="Contractor full name" autoFocus />
        </Field>
        <Field label="Contact number" required error={form.errors.phone}>
          <Input {...bind('phone')} placeholder="07X XXX XXXX" inputMode="tel" />
        </Field>
        <Field label="Company" hint="Leave blank if independent" error={form.errors.company}>
          <Input {...bind('company')} placeholder="Company name (optional)" />
        </Field>
        <Field label="Crew member count" error={form.errors.crew_count}>
          <Input {...bind('crew_count')} type="number" min="0" step="1" placeholder="0" />
        </Field>
        <Field label="Email" error={form.errors.email}>
          <Input {...bind('email')} type="email" placeholder="Optional" />
        </Field>
        <Field label="Specialization" error={form.errors.specialization}>
          <Input {...bind('specialization')} placeholder="e.g. DC wiring, roof mounting" />
        </Field>
        <Field label="Address" className="sm:col-span-2" error={form.errors.address}>
          <Input {...bind('address')} placeholder="Optional" />
        </Field>
        {contractor && (
          <Field label="Status">
            <Select {...bind('status')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </Field>
        )}
        <Field label="Notes" className="sm:col-span-2" error={form.errors.notes}>
          <Textarea {...bind('notes')} placeholder="Any notes about this contractor" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
