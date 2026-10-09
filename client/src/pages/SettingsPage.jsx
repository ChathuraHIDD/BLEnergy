import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, KeyRound, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { rules, useForm } from '../lib/useForm';
import { Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, PageLoader } from '../components/ui';

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['settings', 'company'], queryFn: () => api.get('/settings/company').then((r) => r.data) });
  const company = useForm({ name: '', tagline: '', address: '', phone: '', email: '', website: '', registration: '' });
  const pw = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (data) company.setValues((v) => ({ ...v, ...Object.fromEntries(Object.entries(data).map(([k, x]) => [k, x ?? ''])) }));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCompany = async () => {
    const v = company.values;
    if (!company.check({ name: rules.required(v.name, 'Company name'), address: rules.required(v.address, 'Address'), email: rules.email(v.email) })) return;
    setSaving(true);
    try {
      await api.put('/settings/company', v);
      toast.success('Company details saved – all PDFs now use them');
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      company.serverError(e);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    const v = pw.values;
    const ok = pw.check({
      currentPassword: rules.required(v.currentPassword, 'Current password'),
      newPassword: rules.required(v.newPassword, 'New password')
        || (v.newPassword.length < 8 ? 'New password must be at least 8 characters' : null)
        || (!/[A-Za-z]/.test(v.newPassword) || !/[0-9]/.test(v.newPassword) ? 'Use both letters and numbers' : null),
      confirm: v.confirm !== v.newPassword ? 'Passwords do not match' : null,
    });
    if (!ok) return;
    setSavingPw(true);
    try {
      await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast.success('Password changed successfully');
      pw.setValues({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) {
      pw.serverError(e);
    } finally {
      setSavingPw(false);
    }
  };

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company details printed on every PDF, and your admin account" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={Building2} title="Company profile" subtitle="Shown in the header and footer of all documents" action={<Button size="sm" icon={Save} loading={saving} onClick={saveCompany}>Save</Button>} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Company name" required error={company.errors.name}><Input {...company.bind('name')} /></Field>
            <Field label="Tagline"><Input {...company.bind('tagline')} /></Field>
            <Field label="Address" required error={company.errors.address} className="sm:col-span-2"><Input {...company.bind('address')} /></Field>
            <Field label="Phone"><Input {...company.bind('phone')} placeholder="e.g. +94 11 234 5678" /></Field>
            <Field label="Email" error={company.errors.email}><Input {...company.bind('email')} type="email" /></Field>
            <Field label="Website"><Input {...company.bind('website')} /></Field>
            <Field label="Registration no."><Input {...company.bind('registration')} placeholder="e.g. PV 00000000" /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader icon={KeyRound} title="Change password" subtitle="Admin account" />
          <div className="space-y-4 p-5">
            <Field label="Current password" required error={pw.errors.currentPassword}><Input type="password" autoComplete="current-password" {...pw.bind('currentPassword')} /></Field>
            <Field label="New password" required error={pw.errors.newPassword} hint="At least 8 characters with letters and numbers"><Input type="password" autoComplete="new-password" {...pw.bind('newPassword')} /></Field>
            <Field label="Confirm new password" required error={pw.errors.confirm}><Input type="password" autoComplete="new-password" {...pw.bind('confirm')} /></Field>
            <Button className="w-full" icon={KeyRound} loading={savingPw} onClick={changePassword}>Update password</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
