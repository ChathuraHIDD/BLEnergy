import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import dayjs from 'dayjs';
import clsx from 'clsx';
import {
  AlertCircle, ArrowLeft, ShieldCheck, BatteryCharging, Cable, CalendarPlus, FileSignature, Phone, Plus, Save, Sun, Trash2, UserRound, Wrench, Zap, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { fmtDate, lkr } from '../../lib/format';
import { COMPONENT_TYPES, parseSize, PROJECT_CATEGORIES, PROJECT_STATUSES } from '../../lib/constants';
import { rules } from '../../lib/useForm';
import { Button, Card, CardHeader, ErrorState, Field, FieldError, Input, PageHeader, PageLoader, Select, Tabs, Textarea } from '../../components/ui';
import Combobox from '../../components/Combobox';
import ContractorFormModal from '../contractors/ContractorFormModal';

const ICONS = { solar_panel: Sun, inverter: Zap, battery: BatteryCharging };
const newComponent = (type) => ({ brand: '', model: '', size: '', unit: COMPONENT_TYPES.find((t) => t.value === type).units[0], quantity: 1, warranty_years: '', serial_numbers: '' });
const newWire = () => ({ brand: '', wire_type: '', size: '', length: '', notes: '' });
const newService = () => ({ service_date: '', title: '', notes: '' });

const EMPTY = {
  customer_name: '', customer_address: '', customer_phones: [''], customer_email: '',
  title: '', category: '', status: 'planning', start_date: '', installation_date: '', contract_value: '', description: '',
  wiring_contractor_id: '', wiring_notes: '', service_agreement: '',
  components: { solar_panel: [], inverter: [], battery: [] },
  wiring: [],
  services: [],
};

function addYears(base, years) {
  if (!base || years === '' || Number.isNaN(Number(years))) return '';
  return dayjs(base).add(Math.round(Number(years) * 12), 'month').format('YYYY-MM-DD');
}

function Section({ n, icon: Icon, title, subtitle, children, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="bg-brand-gradient grid h-8 w-8 place-items-center rounded-lg text-sm font-extrabold text-black">{n}</div>
          <Icon className="h-5 w-5 text-brand" />
          <div>
            <h2 className="font-bold">{title}</h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="p-5">{children}</div>
      </Card>
    </motion.div>
  );
}

export default function ProjectFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [tab, setTab] = useState('solar_panel');
  const [saving, setSaving] = useState(false);
  const [contractorModal, setContractorModal] = useState(false);

  const existing = useQuery({ queryKey: ['project', id], queryFn: () => api.get(`/projects/${id}`).then((r) => r.data), enabled: isEdit });
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors', 'all'], queryFn: () => api.get('/contractors').then((r) => r.data) });
  const { data: catalog = {} } = useQuery({ queryKey: ['catalog'], queryFn: () => api.get('/catalog').then((r) => r.data) });

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    const comps = { solar_panel: [], inverter: [], battery: [] };
    p.components.forEach((c) => comps[c.component_type].push({
      brand: c.brand, model: c.model || '', ...(({ num, unit }) => ({ size: num, unit }))(parseSize(c.size, c.component_type)),
      quantity: c.quantity, warranty_years: String(c.warranty_years), serial_numbers: c.serial_numbers || '',
    }));
    setV({
      customer_name: p.customer_name, customer_address: p.customer_address,
      customer_phones: p.customer_phones.length ? p.customer_phones : [''], customer_email: p.customer_email || '',
      title: p.title, category: p.category, status: p.status, start_date: p.start_date || '', installation_date: p.installation_date || '',
      contract_value: String(p.contract_value || ''), description: p.description || '',
      wiring_contractor_id: p.wiring_contractor_id ? String(p.wiring_contractor_id) : '', wiring_notes: p.wiring_notes || '',
      service_agreement: p.service_agreement || '',
      components: comps,
      wiring: p.wiring.map((w) => ({ brand: w.brand, wire_type: w.wire_type, size: w.size || '', length: w.length || '', notes: w.notes || '' })),
      services: [],
    });
  }, [existing.data]);

  const set = (key, value) => {
    setV((s) => ({ ...s, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const bind = (key) => ({ value: v[key], onChange: (e) => set(key, e.target.value), error: errors[key] });

  const setPhone = (i, value) => set('customer_phones', v.customer_phones.map((p, j) => (j === i ? value : p)));
  const setComp = (type, i, key, value) => {
    setV((s) => ({ ...s, components: { ...s.components, [type]: s.components[type].map((c, j) => (j === i ? { ...c, [key]: value } : c)) } }));
    setErrors((e) => ({ ...e, [`${type}.${i}.${key}`]: undefined }));
  };
  const setRow = (list, i, key, value) => {
    setV((s) => ({ ...s, [list]: s[list].map((c, j) => (j === i ? { ...c, [key]: value } : c)) }));
    setErrors((e) => ({ ...e, [`${list}.${i}.${key}`]: undefined }));
  };

  const baseDate = v.installation_date || v.start_date || dayjs().format('YYYY-MM-DD');

  const validate = () => {
    const e = {};
    e.customer_name = rules.required(v.customer_name, 'Customer name');
    e.customer_address = rules.required(v.customer_address, 'Address');
    const filled = v.customer_phones.filter((p) => p.trim());
    if (!filled.length) e['customer_phones.0'] = 'At least one contact number is required';
    v.customer_phones.forEach((p, i) => {
      if (p.trim()) e[`customer_phones.${i}`] = e[`customer_phones.${i}`] || rules.phone(p);
    });
    const digits = filled.map((p) => p.replace(/\D/g, ''));
    digits.forEach((d, i) => {
      if (digits.indexOf(d) !== i) e[`customer_phones.${v.customer_phones.indexOf(filled[i])}`] = 'Duplicate contact number';
    });
    e.customer_email = rules.email(v.customer_email);
    e.title = rules.required(v.title, 'Project name');
    e.category = v.category ? null : 'Select a project category';
    e.contract_value = rules.money(v.contract_value, 'Contract value', { required: false });
    if (v.start_date && v.installation_date && v.installation_date < v.start_date) e.installation_date = 'Installation date cannot be before the start date';

    COMPONENT_TYPES.forEach(({ value: type }) => {
      v.components[type].forEach((c, i) => {
        const k = `${type}.${i}`;
        e[`${k}.brand`] = rules.required(c.brand, 'Brand');
        e[`${k}.size`] = rules.required(c.size, 'Size') || (!(Number(c.size) > 0) ? 'Enter the size as a number greater than 0' : null);
        const q = Number(c.quantity);
        e[`${k}.quantity`] = !Number.isInteger(q) || q < 1 ? 'Quantity must be 1 or more' : null;
        const w = Number(c.warranty_years);
        e[`${k}.warranty_years`] = c.warranty_years === '' ? 'Warranty is required' : Number.isNaN(w) || w < 0 || w > 99 ? 'Enter 0–99 years' : null;
      });
    });
    v.wiring.forEach((w, i) => {
      e[`wiring.${i}.brand`] = rules.required(w.brand, 'Brand');
      e[`wiring.${i}.wire_type`] = rules.required(w.wire_type, 'Wire type');
    });
    v.services.forEach((s, i) => {
      e[`services.${i}.service_date`] = rules.required(s.service_date, 'Service date');
      e[`services.${i}.title`] = rules.required(s.title, 'Service title');
    });
    const clean = Object.fromEntries(Object.entries(e).filter(([, x]) => x));
    setErrors(clean);
    return clean;
  };

  const tabHasError = (t) => Object.keys(errors).some((k) => errors[k] && k.startsWith(`${t}.`) || (t === 'wiring' && k === 'wiring_contractor_id') || (t === 'agreement' && k.startsWith('services.')));

  const submit = async () => {
    const errs = validate();
    const keys = Object.keys(errs);
    if (keys.length) {
      toast.error(keys.length === 1 ? Object.values(errs)[0] : `Please fix ${keys.length} highlighted fields`);
      const firstTab = ['solar_panel', 'inverter', 'battery', 'wiring', 'services'].find((t) => keys.some((k) => k.startsWith(`${t}.`)));
      if (firstTab && !keys.some((k) => !k.includes('.') || k.startsWith('customer_phones'))) setTab(firstTab === 'services' ? 'agreement' : firstTab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const payload = {
      ...v,
      customer_phones: v.customer_phones.map((p) => p.trim()).filter(Boolean),
      contract_value: v.contract_value === '' ? 0 : v.contract_value,
      // Size is stored with its unit ("10 kWh"); warranty expiry is always calculated by the server from the years.
      components: COMPONENT_TYPES.flatMap(({ value: type }) => v.components[type].map(({ unit, ...c }) => ({ ...c, size: `${Number(c.size)} ${unit}`, component_type: type }))),
      services: isEdit ? undefined : v.services,
    };
    setSaving(true);
    try {
      const { data } = isEdit ? await api.put(`/projects/${id}`, payload) : await api.post('/projects', payload);
      toast.success(isEdit ? 'Project updated successfully' : `Project ${data.code} created successfully`);
      ['projects', 'project', 'dashboard', 'catalog', 'notifications', 'upcoming', 'contractors', 'contractor'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      navigate(`/projects/${data.id}`);
    } catch (err) {
      const f = fieldErrors(err);
      if (Object.keys(f).length) setErrors(f);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const contractorOptions = useMemo(
    () => contractors.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})${c.company ? ` – ${c.company}` : ''}${c.status === 'inactive' ? ' [inactive]' : ''}` })),
    [contractors],
  );

  if (isEdit && existing.isLoading) return <PageLoader />;
  if (isEdit && existing.error) return <ErrorState message={errorMessage(existing.error)} onRetry={existing.refetch} />;

  const tabs = [
    ...COMPONENT_TYPES.map((t) => ({ value: t.value, label: t.label, icon: ICONS[t.value], count: v.components[t.value].length })),
    { value: 'wiring', label: 'Wiring', icon: Cable, count: v.wiring.length },
    { value: 'agreement', label: 'Service Agreement', icon: FileSignature },
  ].map((t) => ({ ...t, label: tabHasError(t.value) ? <span className="flex items-center gap-1.5">{t.label}<AlertCircle className="h-3.5 w-3.5 text-bad" /></span> : t.label }));

  const totalValue = Number(v.contract_value || 0);
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <div className="pb-24">
      <PageHeader
        breadcrumb={<button onClick={() => navigate(-1)} className="flex items-center gap-1 hover:text-txt"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
        title={isEdit ? `Edit project ${existing.data?.code}` : 'Create project'}
        subtitle={isEdit ? existing.data?.title : 'A unique project ID will be generated when you save'}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Section n={1} icon={UserRound} title="Customer details" subtitle="Who is this installation for?">
          <div className="grid gap-4">
            <Field label="Customer name" required error={errors.customer_name}>
              <Input {...bind('customer_name')} placeholder="Full name" />
            </Field>
            <Field label="Address" required error={errors.customer_address}>
              <Textarea {...bind('customer_address')} className="min-h-[72px]" placeholder="Installation address" />
            </Field>
            <div>
              <label className="label">Contact numbers <span className="text-brand">*</span></label>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {v.customer_phones.map((p, i) => (
                    <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input icon={Phone} value={p} error={errors[`customer_phones.${i}`]} inputMode="tel" placeholder={i === 0 ? 'Primary number' : 'Additional number'}
                            onChange={(e) => { setPhone(i, e.target.value); setErrors((x) => ({ ...x, [`customer_phones.${i}`]: undefined, customer_phones: undefined })); }} />
                        </div>
                        {v.customer_phones.length > 1 && (
                          <Button variant="ghost" size="icon" type="button" className="h-[42px] w-[42px]" onClick={() => set('customer_phones', v.customer_phones.filter((_, j) => j !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FieldError error={errors[`customer_phones.${i}`]} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                <FieldError error={errors.customer_phones} />
                {v.customer_phones.length < 5 && (
                  <button type="button" onClick={() => set('customer_phones', [...v.customer_phones, ''])} className="flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold">
                    <Plus className="h-4 w-4" /> Add another number
                  </button>
                )}
              </div>
            </div>
            <Field label="Email" error={errors.customer_email}>
              <Input {...bind('customer_email')} type="email" placeholder="Optional" />
            </Field>
          </div>
        </Section>

        <Section n={2} icon={ClipboardList} title="Project details" subtitle="Category, schedule and contract value" delay={0.05}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name" required error={errors.title} className="sm:col-span-2">
              <Input {...bind('title')} placeholder="e.g. 10kW Hybrid Solar – Silva Residence" />
            </Field>
            <Field label="Category" required error={errors.category}>
              <Select {...bind('category')} placeholder="Select category" options={PROJECT_CATEGORIES} />
            </Field>
            <Field label="Status" error={errors.status}>
              <Select {...bind('status')} options={PROJECT_STATUSES} />
            </Field>
            <Field label="Start date" error={errors.start_date}>
              <Input {...bind('start_date')} type="date" />
            </Field>
            <Field label="Installation date" error={errors.installation_date} hint="Warranty periods start from this date">
              <Input {...bind('installation_date')} type="date" />
            </Field>
            <Field label="Contract value (LKR)" error={errors.contract_value} className="sm:col-span-2" hint={totalValue > 0 ? lkr(totalValue) : 'Used to track payment collection and balance due'}>
              <Input {...bind('contract_value')} type="number" min="0" step="0.01" placeholder="0.00" />
            </Field>
            <Field label="Description / notes" className="sm:col-span-2" error={errors.description}>
              <Textarea {...bind('description')} className="min-h-[72px]" placeholder="Optional" />
            </Field>
          </div>
        </Section>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6">
        <Card>
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <div className="bg-brand-gradient grid h-8 w-8 place-items-center rounded-lg text-sm font-extrabold text-black">3</div>
            <Wrench className="h-5 w-5 text-brand" />
            <div>
              <h2 className="font-bold">Project type</h2>
              <p className="text-xs text-muted">Solar panels, inverter, battery, wiring and service agreement</p>
            </div>
          </div>
          <div className="p-5">
            <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
                {COMPONENT_TYPES.some((t) => t.value === tab) && (
                  <ComponentRows
                    type={COMPONENT_TYPES.find((t) => t.value === tab)}
                    rows={v.components[tab]}
                    errors={errors}
                    brands={catalog[tab] || []}
                    baseDate={baseDate}
                    onChange={(i, k, val) => setComp(tab, i, k, val)}
                    onAdd={() => setV((s) => ({ ...s, components: { ...s.components, [tab]: [...s.components[tab], newComponent(tab)] } }))}
                    onRemove={(i) => setV((s) => ({ ...s, components: { ...s.components, [tab]: s.components[tab].filter((_, j) => j !== i) } }))}
                  />
                )}

                {tab === 'wiring' && (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                      <Field label="Wiring contractor" error={errors.wiring_contractor_id} hint="Only registered contractors are listed">
                        <Select {...bind('wiring_contractor_id')} placeholder="Select a registered contractor" options={contractorOptions} />
                      </Field>
                      <Button variant="secondary" icon={Plus} type="button" onClick={() => setContractorModal(true)} className="md:mb-[22px]">Register new</Button>
                    </div>
                    <AnimatePresence initial={false}>
                      {v.wiring.map((w, i) => (
                        <motion.div key={i} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-2xl border border-line bg-surface-2/60 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="flex items-center gap-2 text-sm font-bold"><Cable className="h-4 w-4 text-brand" /> Wiring item {i + 1}</p>
                            <Button variant="ghost" size="sm" icon={Trash2} type="button" onClick={() => set('wiring', v.wiring.filter((_, j) => j !== i))}>Remove</Button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <Field label="Brand" required error={errors[`wiring.${i}.brand`]}>
                              <Combobox value={w.brand} onChange={(x) => setRow('wiring', i, 'brand', x)} options={catalog.wiring_brand || []} placeholder="Type or pick a brand" error={errors[`wiring.${i}.brand`]} createLabel="Add brand" />
                            </Field>
                            <Field label="Type" required error={errors[`wiring.${i}.wire_type`]}>
                              <Combobox value={w.wire_type} onChange={(x) => setRow('wiring', i, 'wire_type', x)} options={catalog.wire_type || []} placeholder="e.g. DC Solar Cable" error={errors[`wiring.${i}.wire_type`]} createLabel="Add type" />
                            </Field>
                            <Field label="Size"><Input value={w.size} onChange={(e) => setRow('wiring', i, 'size', e.target.value)} placeholder="e.g. 6mm²" /></Field>
                            <Field label="Length"><Input value={w.length} onChange={(e) => setRow('wiring', i, 'length', e.target.value)} placeholder="e.g. 50m" /></Field>
                            <Field label="Notes"><Input value={w.notes} onChange={(e) => setRow('wiring', i, 'notes', e.target.value)} placeholder="Optional" /></Field>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <Button variant="secondary" icon={Plus} type="button" onClick={() => set('wiring', [...v.wiring, newWire()])}>Add wiring item</Button>
                    <Field label="Wiring notes">
                      <Textarea {...bind('wiring_notes')} className="min-h-[72px]" placeholder="Optional notes about the wiring work" />
                    </Field>
                  </div>
                )}

                {tab === 'agreement' && (
                  <div className="space-y-5">
                    <Field label="Service agreement" hint={`${v.service_agreement.length.toLocaleString()} / 20,000 characters`}>
                      <Textarea {...bind('service_agreement')} maxLength={20000} className="min-h-[200px]" placeholder="Type the service agreement terms – service frequency, what's covered, response times, exclusions…" />
                    </Field>
                    {!isEdit && (
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold">Scheduled service dates</p>
                            <p className="text-xs text-muted">You'll be notified 2 days and 1 day before each visit</p>
                          </div>
                          <Button variant="secondary" size="sm" icon={CalendarPlus} type="button" onClick={() => set('services', [...v.services, newService()])}>Add service date</Button>
                        </div>
                        <AnimatePresence initial={false}>
                          {v.services.map((s, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="mb-3 grid gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 sm:grid-cols-[180px_1fr_1fr_auto] sm:items-start">
                              <Field label="Date" required error={errors[`services.${i}.service_date`]}>
                                <Input type="date" value={s.service_date} error={errors[`services.${i}.service_date`]} onChange={(e) => setRow('services', i, 'service_date', e.target.value)} />
                              </Field>
                              <Field label="Service" required error={errors[`services.${i}.title`]}>
                                <Input value={s.title} error={errors[`services.${i}.title`]} onChange={(e) => setRow('services', i, 'title', e.target.value)} placeholder="e.g. 6-month panel cleaning" />
                              </Field>
                              <Field label="Notes"><Input value={s.notes} onChange={(e) => setRow('services', i, 'notes', e.target.value)} placeholder="Optional" /></Field>
                              <Button variant="ghost" size="icon" type="button" className="sm:mt-6" onClick={() => set('services', v.services.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                    {isEdit && <p className="text-xs text-muted">Service dates are managed from the project page → Service tab.</p>}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </Card>
      </motion.div>

      {/* sticky save bar */}
      <div className="fixed right-0 bottom-0 left-0 z-20 border-t border-line bg-base/90 backdrop-blur-xl lg:left-64">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <p className="hidden text-sm text-muted sm:block">
            {COMPONENT_TYPES.reduce((n, t) => n + v.components[t.value].length, 0)} components · {v.wiring.length} wiring items
            {errorCount > 0 && <span className="ml-3 font-semibold text-bad">{errorCount} field(s) need attention</span>}
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>Cancel</Button>
            <Button icon={Save} loading={saving} onClick={submit}>{isEdit ? 'Save changes' : 'Create project'}</Button>
          </div>
        </div>
      </div>

      <ContractorFormModal
        open={contractorModal}
        onClose={() => setContractorModal(false)}
        onSaved={(c) => {
          qc.invalidateQueries({ queryKey: ['contractors', 'all'] });
          set('wiring_contractor_id', String(c.id));
        }}
      />
    </div>
  );
}

function ComponentRows({ type, rows, errors, brands, baseDate, onChange, onAdd, onRemove }) {
  const Icon = ICONS[type.value];
  const err = (i, k) => errors[`${type.value}.${i}.${k}`];
  return (
    <div className="space-y-4">
      {!rows.length && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong py-10 text-center">
          <Icon className="mb-3 h-8 w-8 text-dim" />
          <p className="font-semibold">No {type.label.toLowerCase()} added</p>
          <p className="mt-1 text-sm text-muted">Add brand, size and warranty details</p>
        </div>
      )}
      <AnimatePresence initial={false}>
        {rows.map((c, i) => {
          const expiry = addYears(baseDate, c.warranty_years);
          return (
            <motion.div key={i} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-2xl border border-line bg-surface-2/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 text-brand" /> {type.single} {i + 1}</p>
                <Button variant="ghost" size="sm" icon={Trash2} type="button" onClick={() => onRemove(i)}>Remove</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Brand" required error={err(i, 'brand')}>
                  <Combobox value={c.brand} onChange={(x) => onChange(i, 'brand', x)} options={brands} placeholder="Type or pick a brand" error={err(i, 'brand')} createLabel="Add brand" />
                </Field>
                <Field label="Model"><Input value={c.model} onChange={(e) => onChange(i, 'model', e.target.value)} placeholder="Optional" /></Field>
                <Field label="Size" required error={err(i, 'size')}>
                  <div className="flex">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={c.size}
                      onChange={(e) => onChange(i, 'size', e.target.value)}
                      placeholder={type.sizeHint}
                      className={clsx('input !rounded-r-none', err(i, 'size') && 'input-error')}
                    />
                    {type.units.length > 1 ? (
                      <select
                        value={c.unit}
                        onChange={(e) => onChange(i, 'unit', e.target.value)}
                        className="cursor-pointer rounded-r-xl border border-l-0 border-line bg-surface-3 px-3 text-sm font-bold text-gold outline-none focus:border-brand/70"
                      >
                        {type.units.map((u) => <option key={u} value={u} className="bg-surface-2 text-txt">{u}</option>)}
                      </select>
                    ) : (
                      <span className="grid place-items-center rounded-r-xl border border-l-0 border-line bg-surface-3 px-3.5 text-sm font-bold text-gold">{type.units[0]}</span>
                    )}
                  </div>
                </Field>
                <Field label="Quantity" required error={err(i, 'quantity')}>
                  <Input type="number" min="1" step="1" value={c.quantity} error={err(i, 'quantity')} onChange={(e) => onChange(i, 'quantity', e.target.value)} />
                </Field>
                <Field label="Warranty (years)" required error={err(i, 'warranty_years')}>
                  <Input type="number" min="0" max="99" step="0.5" value={c.warranty_years} error={err(i, 'warranty_years')} onChange={(e) => onChange(i, 'warranty_years', e.target.value)} placeholder="e.g. 10" />
                </Field>
                <Field label="Warranty expiry" hint={`Calculated from ${fmtDate(baseDate)}`}>
                  <div className={clsx('flex h-[42px] items-center gap-2 rounded-xl border px-3.5 text-sm font-bold', expiry ? 'border-gold/30 bg-gold/10 text-gold' : 'border-line bg-surface-2 text-dim')}>
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    {expiry ? fmtDate(expiry) : 'Enter warranty years'}
                  </div>
                </Field>
                <Field label="Serial numbers" className="sm:col-span-2">
                  <Input value={c.serial_numbers} onChange={(e) => onChange(i, 'serial_numbers', e.target.value)} placeholder="Optional, comma separated" />
                </Field>
              </div>
              <div className={clsx('mt-3 flex items-center gap-2 text-xs', expiry ? 'text-gold' : 'text-dim')}>
                <AlertCircle className="h-3.5 w-3.5" />
                {expiry ? `Warranty reminder will be sent 2 days and 1 day before ${fmtDate(expiry)}` : 'Enter the warranty period to schedule reminders'}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <Button variant="secondary" icon={Plus} type="button" onClick={onAdd}>Add {type.single.toLowerCase()}</Button>
    </div>
  );
}
