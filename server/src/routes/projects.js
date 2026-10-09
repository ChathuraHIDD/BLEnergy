import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { HttpError, notFound } from '../utils/errors.js';
import { idParam, isoDate, likeTerm, money, optDate, optEmail, optId, optText, phone, reqText } from '../utils/validation.js';
import { generateNotifications, notify } from '../services/notifications.js';
import { startPdf, fmtDate, label, lkr } from '../pdf/template.js';

const router = Router();

const CATEGORIES = ['solar', 'battery_backup', 'full_solar', 'hybrid', 'other'];
const STATUSES = ['planning', 'in_progress', 'completed', 'on_hold', 'cancelled'];
const COMPONENT_TYPES = ['solar_panel', 'inverter', 'battery'];

const componentSchema = z.object({
  component_type: z.enum(COMPONENT_TYPES),
  brand: reqText('Brand', 120),
  model: optText(120),
  size: reqText('Size', 60),
  quantity: z.preprocess((v) => (v === '' || v == null ? 1 : Number(v)),
    z.number({ invalid_type_error: 'Quantity must be a number' }).int('Quantity must be a whole number').min(1, 'Quantity must be at least 1').max(100000)),
  warranty_years: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ required_error: 'Warranty is required', invalid_type_error: 'Warranty must be a number' }).min(0, 'Warranty cannot be negative').max(99, 'Warranty is too long')),
  warranty_expiry: optDate('Warranty expiry'),
  serial_numbers: optText(1000),
});

const wiringSchema = z.object({
  brand: reqText('Brand', 120),
  wire_type: reqText('Wire type', 120),
  size: optText(60),
  length: optText(60),
  notes: optText(500),
});

const serviceSchema = z.object({
  service_date: isoDate('Service date'),
  title: reqText('Service title', 160),
  notes: optText(1000),
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
});

const projectSchema = z.object({
  title: reqText('Project name', 160),
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Select a project category' }) }),
  status: z.enum(STATUSES).default('planning'),
  customer_name: reqText('Customer name', 160),
  customer_address: reqText('Address', 400),
  customer_phones: z.array(phone).min(1, 'Add at least one contact number').max(5, 'Up to 5 contact numbers'),
  customer_email: optEmail,
  start_date: optDate('Start date'),
  installation_date: optDate('Installation date'),
  contract_value: money('Contract value').default(0),
  description: optText(4000),
  wiring_contractor_id: optId,
  wiring_notes: optText(2000),
  service_agreement: optText(20000),
  components: z.array(componentSchema).max(100).default([]),
  wiring: z.array(wiringSchema).max(100).default([]),
  services: z.array(serviceSchema).max(100).optional(),
}).superRefine((p, ctx) => {
  if (p.start_date && p.installation_date && p.installation_date < p.start_date) {
    ctx.addIssue({ code: 'custom', path: ['installation_date'], message: 'Installation date cannot be before the start date' });
  }
  const phones = p.customer_phones.map((x) => x.replace(/\D/g, ''));
  if (new Set(phones).size !== phones.length) {
    ctx.addIssue({ code: 'custom', path: ['customer_phones'], message: 'Contact numbers must be different' });
  }
});

/** warranty base date + N years (fractional years supported). */
function addYears(base, years) {
  const d = new Date(`${base}T00:00:00Z`);
  const months = Math.round(Number(years) * 12);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

async function saveChildren(client, projectId, p) {
  const base = p.installation_date || p.start_date || new Date().toISOString().slice(0, 10);
  await client.query('DELETE FROM project_components WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM project_wiring WHERE project_id = $1', [projectId]);

  for (const [i, c] of p.components.entries()) {
    const expiry = c.warranty_expiry || addYears(base, c.warranty_years);
    await client.query(
      `INSERT INTO project_components (project_id, component_type, brand, model, size, quantity, warranty_years, warranty_expiry, serial_numbers, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [projectId, c.component_type, c.brand, c.model, c.size, c.quantity, c.warranty_years, expiry, c.serial_numbers, i],
    );
    await addCatalog(client, c.component_type, c.brand);
  }
  for (const [i, w] of p.wiring.entries()) {
    await client.query(
      `INSERT INTO project_wiring (project_id, brand, wire_type, size, length, notes, position) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [projectId, w.brand, w.wire_type, w.size, w.length, w.notes, i],
    );
    await addCatalog(client, 'wiring_brand', w.brand);
    await addCatalog(client, 'wire_type', w.wire_type);
  }
}

const addCatalog = (client, category, name) =>
  client.query(
    `INSERT INTO catalog_items (category, name) VALUES ($1, $2) ON CONFLICT (category, lower(name)) DO NOTHING`,
    [category, name.trim()],
  );

async function assertContractor(client, id) {
  if (!id) return;
  const { rows } = await client.query('SELECT id FROM contractors WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(422, 'Selected contractor does not exist', { wiring_contractor_id: 'Select a registered contractor' });
}

const FINANCE_COLS = `
  (SELECT coalesce(sum(amount),0) FROM transactions t WHERE t.project_id = p.id AND t.kind = 'income') AS collected,
  (SELECT coalesce(sum(amount),0) FROM transactions t WHERE t.project_id = p.id AND t.kind = 'expense') AS spent`;

// ---------------------------------------------------------------- list
router.get('/', async (req, res) => {
  const { q, status, category, contractor, from, to } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (q) {
    add(`(p.code ILIKE ? OR p.title ILIKE ? OR p.customer_name ILIKE ? OR p.customer_address ILIKE ?
          OR array_to_string(p.customer_phones, ' ') ILIKE ? OR to_char(p.installation_date, 'YYYY-MM-DD DD Mon YYYY') ILIKE ?
          OR to_char(p.start_date, 'YYYY-MM-DD DD Mon YYYY') ILIKE ?)`, likeTerm(q));
  }
  if (status) add('p.status = ?', status);
  if (category) add('p.category = ?', category);
  if (contractor) add('p.wiring_contractor_id = ?', Number(contractor));
  if (from) add('coalesce(p.installation_date, p.start_date, p.created_at::date) >= ?', from);
  if (to) add('coalesce(p.installation_date, p.start_date, p.created_at::date) <= ?', to);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [{ rows }, { rows: count }] = await Promise.all([
    query(
      `SELECT p.id, p.code, p.title, p.category, p.status, p.customer_name, p.customer_address, p.customer_phones,
              p.start_date, p.installation_date, p.contract_value, p.created_at, c.name AS contractor_name, c.code AS contractor_code,
              ${FINANCE_COLS}
       FROM projects p LEFT JOIN contractors c ON c.id = p.wiring_contractor_id
       ${whereSql}
       ORDER BY p.created_at DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    ),
    query(`SELECT count(*) FROM projects p ${whereSql}`, params),
  ]);
  res.json({ rows, total: count[0].count, page, pageSize });
});

// Lightweight list for dropdowns
router.get('/options', async (req, res) => {
  const { rows } = await query(
    `SELECT id, code, title, customer_name, customer_address, customer_phones, contract_value FROM projects ORDER BY created_at DESC`,
  );
  res.json(rows);
});

// ---------------------------------------------------------------- detail
async function loadProject(id) {
  const { rows } = await query(
    `SELECT p.*, c.name AS contractor_name, c.code AS contractor_code, c.phone AS contractor_phone, c.company AS contractor_company,
            ${FINANCE_COLS}
     FROM projects p LEFT JOIN contractors c ON c.id = p.wiring_contractor_id WHERE p.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('Project');
  const [components, wiring, services, transactions, invoices, quotations] = await Promise.all([
    query('SELECT * FROM project_components WHERE project_id = $1 ORDER BY position, id', [id]),
    query('SELECT * FROM project_wiring WHERE project_id = $1 ORDER BY position, id', [id]),
    query('SELECT * FROM project_services WHERE project_id = $1 ORDER BY service_date, id', [id]),
    query(
      `SELECT t.*, c.name AS contractor_name, i.code AS invoice_code
       FROM transactions t LEFT JOIN contractors c ON c.id = t.contractor_id LEFT JOIN invoices i ON i.id = t.invoice_id
       WHERE t.project_id = $1 ORDER BY t.txn_date DESC, t.id DESC`,
      [id],
    ),
    query(
      `SELECT i.*, b.subtotal, b.total, b.paid, b.balance FROM invoices i JOIN invoice_balances b ON b.id = i.id
       WHERE i.project_id = $1 ORDER BY i.issue_date DESC, i.id DESC`,
      [id],
    ),
    query(
      `SELECT q.id, q.code, q.title, q.amount, q.quote_date, q.valid_until, q.status, q.file_id, f.original_name AS file_name
       FROM quotations q LEFT JOIN files f ON f.id = q.file_id WHERE q.project_id = $1 ORDER BY q.quote_date DESC`,
      [id],
    ),
  ]);
  const p = rows[0];
  return {
    ...p,
    balance_due: Math.max(0, p.contract_value - p.collected),
    components: components.rows,
    wiring: wiring.rows,
    services: services.rows,
    transactions: transactions.rows,
    invoices: invoices.rows,
    quotations: quotations.rows,
  };
}

router.get('/:id', async (req, res) => {
  res.json(await loadProject(idParam(req)));
});

// ---------------------------------------------------------------- create / update / delete
router.post('/', async (req, res) => {
  const p = projectSchema.parse(req.body);
  const project = await withTransaction(async (client) => {
    await assertContractor(client, p.wiring_contractor_id);
    const { rows } = await client.query(
      `INSERT INTO projects (title, category, status, customer_name, customer_address, customer_phones, customer_email,
         start_date, installation_date, contract_value, description, wiring_contractor_id, wiring_notes,
         service_agreement, service_agreement_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, CASE WHEN $14::text IS NULL THEN NULL ELSE now() END)
       RETURNING id, code, title`,
      [p.title, p.category, p.status, p.customer_name, p.customer_address, p.customer_phones, p.customer_email,
        p.start_date, p.installation_date, p.contract_value, p.description, p.wiring_contractor_id, p.wiring_notes,
        p.service_agreement],
    );
    await saveChildren(client, rows[0].id, p);
    for (const s of p.services || []) {
      await client.query(
        `INSERT INTO project_services (project_id, service_date, title, notes, status) VALUES ($1,$2,$3,$4,$5)`,
        [rows[0].id, s.service_date, s.title, s.notes, s.status],
      );
    }
    return rows[0];
  });
  await notify({ title: 'New project created', message: `${project.code} – ${project.title} for ${p.customer_name}`, projectId: project.id });
  await generateNotifications();
  res.status(201).json(project);
});

router.put('/:id', async (req, res) => {
  const id = idParam(req);
  const p = projectSchema.parse(req.body);
  await withTransaction(async (client) => {
    await assertContractor(client, p.wiring_contractor_id);
    const { rows } = await client.query(
      `UPDATE projects SET title=$1, category=$2, status=$3, customer_name=$4, customer_address=$5, customer_phones=$6,
         customer_email=$7, start_date=$8, installation_date=$9, contract_value=$10, description=$11,
         wiring_contractor_id=$12, wiring_notes=$13, updated_at=now()
       WHERE id=$14 RETURNING id`,
      [p.title, p.category, p.status, p.customer_name, p.customer_address, p.customer_phones, p.customer_email,
        p.start_date, p.installation_date, p.contract_value, p.description, p.wiring_contractor_id, p.wiring_notes, id],
    );
    if (!rows[0]) throw notFound('Project');
    await saveChildren(client, id, p);
  });
  await generateNotifications();
  res.json(await loadProject(id));
});

router.patch('/:id/status', async (req, res) => {
  const id = idParam(req);
  const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
  const { rows } = await query('UPDATE projects SET status=$1, updated_at=now() WHERE id=$2 RETURNING id', [status, id]);
  if (!rows[0]) throw notFound('Project');
  res.json({ message: 'Status updated' });
});

router.delete('/:id', async (req, res) => {
  const id = idParam(req);
  const { rows } = await query('DELETE FROM projects WHERE id = $1 RETURNING code', [id]);
  if (!rows[0]) throw notFound('Project');
  res.json({ message: `Project ${rows[0].code} deleted` });
});

// ---------------------------------------------------------------- service agreement + schedule
router.put('/:id/service-agreement', async (req, res) => {
  const id = idParam(req);
  const { service_agreement } = z.object({ service_agreement: optText(20000) }).parse(req.body);
  const { rows } = await query(
    `UPDATE projects SET service_agreement=$1, service_agreement_at=now(), updated_at=now() WHERE id=$2
     RETURNING service_agreement, service_agreement_at`,
    [service_agreement, id],
  );
  if (!rows[0]) throw notFound('Project');
  res.json(rows[0]);
});

router.post('/:id/services', async (req, res) => {
  const id = idParam(req);
  const s = serviceSchema.parse(req.body);
  const { rows: exists } = await query('SELECT id FROM projects WHERE id = $1', [id]);
  if (!exists[0]) throw notFound('Project');
  const { rows } = await query(
    `INSERT INTO project_services (project_id, service_date, title, notes, status) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [id, s.service_date, s.title, s.notes, s.status],
  );
  await generateNotifications();
  res.status(201).json(rows[0]);
});

router.put('/:id/services/:sid', async (req, res) => {
  const id = idParam(req);
  const sid = idParam(req, 'sid');
  const s = serviceSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE project_services SET service_date=$1, title=$2, notes=$3, status=$4,
       completed_at = CASE WHEN $4 = 'completed' THEN coalesce(completed_at, now()) ELSE NULL END
     WHERE id=$5 AND project_id=$6 RETURNING *`,
    [s.service_date, s.title, s.notes, s.status, sid, id],
  );
  if (!rows[0]) throw notFound('Service');
  await generateNotifications();
  res.json(rows[0]);
});

router.delete('/:id/services/:sid', async (req, res) => {
  const { rows } = await query('DELETE FROM project_services WHERE id=$1 AND project_id=$2 RETURNING id', [idParam(req, 'sid'), idParam(req)]);
  if (!rows[0]) throw notFound('Service');
  res.json({ message: 'Service removed' });
});

// ---------------------------------------------------------------- full summary PDF
router.get('/:id/pdf', async (req, res) => {
  const p = await loadProject(idParam(req));
  const pdf = await startPdf(req, res, { title: `Project Summary ${p.code}`, filename: `${p.code}-summary.pdf` });

  pdf.titleBlock('Project Summary', [
    ['Project ID', p.code],
    ['Status', label(p.status)],
    ['Created', fmtDate(p.created_at)],
  ]);

  pdf.section('Customer details');
  pdf.keyValues([
    ['Customer name', p.customer_name],
    ['Contact numbers', p.customer_phones.join(', ')],
    ['Address', p.customer_address],
    ['Email', p.customer_email || '-'],
  ]);

  pdf.section('Project information');
  pdf.keyValues([
    ['Project name', p.title],
    ['Category', label(p.category)],
    ['Start date', fmtDate(p.start_date)],
    ['Installation date', fmtDate(p.installation_date)],
    ['Contract value', lkr(p.contract_value)],
    ['Wiring contractor', p.contractor_name ? `${p.contractor_name} (${p.contractor_code})` : '-'],
  ]);
  if (p.description) pdf.paragraph(p.description);

  const groups = [['solar_panel', 'Solar panel'], ['inverter', 'Inverter'], ['battery', 'Battery']];
  pdf.section('System components');
  pdf.table([
    { label: 'Component', width: 0.14, render: (r) => groups.find((g) => g[0] === r.component_type)[1], bold: true },
    { label: 'Brand / Model', width: 0.26, render: (r) => `${r.brand}${r.model ? ` ${r.model}` : ''}` },
    { label: 'Size', width: 0.13, render: (r) => r.size },
    { label: 'Qty', width: 0.07, align: 'center', render: (r) => r.quantity },
    { label: 'Warranty', width: 0.13, render: (r) => `${r.warranty_years} yr${r.warranty_years === 1 ? '' : 's'}` },
    { label: 'Expires', width: 0.14, render: (r) => fmtDate(r.warranty_expiry) },
    { label: 'Serial Nos', width: 0.13, render: (r) => r.serial_numbers || '-' },
  ], p.components, { emptyText: 'No components recorded' });

  pdf.section('Wiring');
  pdf.keyValues([
    ['Contractor', p.contractor_name ? `${p.contractor_name} (${p.contractor_code})` : 'Not assigned'],
    ['Contractor phone', p.contractor_phone || '-'],
  ]);
  pdf.table([
    { label: 'Brand', width: 0.22, render: (r) => r.brand, bold: true },
    { label: 'Type', width: 0.26, render: (r) => r.wire_type },
    { label: 'Size', width: 0.14, render: (r) => r.size || '-' },
    { label: 'Length', width: 0.14, render: (r) => r.length || '-' },
    { label: 'Notes', width: 0.24, render: (r) => r.notes || '-' },
  ], p.wiring, { emptyText: 'No wiring recorded' });
  if (p.wiring_notes) pdf.paragraph(p.wiring_notes);

  pdf.section('Service schedule');
  pdf.table([
    { label: 'Date', width: 0.18, render: (r) => fmtDate(r.service_date), bold: true },
    { label: 'Service', width: 0.34, render: (r) => r.title },
    { label: 'Status', width: 0.15, render: (r) => label(r.status) },
    { label: 'Notes', width: 0.33, render: (r) => r.notes || '-' },
  ], p.services, { emptyText: 'No services scheduled' });

  pdf.section('Service agreement');
  pdf.paragraph(p.service_agreement || 'No service agreement recorded.');

  pdf.section('Financial summary');
  pdf.keyValues([
    ['Contract value', lkr(p.contract_value)],
    ['Collected from customer', lkr(p.collected)],
    ['Balance due', lkr(p.balance_due)],
    ['Project expenses', lkr(p.spent)],
  ], 4);

  pdf.table([
    { label: 'Reference', width: 0.17, render: (r) => r.code, bold: true },
    { label: 'Date', width: 0.13, render: (r) => fmtDate(r.txn_date) },
    { label: 'Type', width: 0.1, render: (r) => (r.kind === 'income' ? 'Income' : 'Expense'), color: (r) => (r.kind === 'income' ? '#1E8E4E' : '#C0392B') },
    { label: 'Category', width: 0.17, render: (r) => r.category },
    { label: 'Details', width: 0.25, render: (r) => [r.contractor_name, r.invoice_code, r.reference, r.description].filter(Boolean).join(' · ') || '-' },
    { label: 'Amount', width: 0.18, align: 'right', render: (r) => lkr(r.amount) },
  ], p.transactions, { emptyText: 'No payments recorded' });

  if (p.invoices.length) {
    pdf.section('Invoices');
    pdf.table([
      { label: 'Invoice', width: 0.18, render: (r) => r.code, bold: true },
      { label: 'Issued', width: 0.15, render: (r) => fmtDate(r.issue_date) },
      { label: 'Due', width: 0.15, render: (r) => fmtDate(r.due_date) },
      { label: 'Total', width: 0.18, align: 'right', render: (r) => lkr(r.total) },
      { label: 'Paid', width: 0.17, align: 'right', render: (r) => lkr(r.paid) },
      { label: 'Balance', width: 0.17, align: 'right', render: (r) => lkr(r.balance) },
    ], p.invoices);
  }

  pdf.totals([
    ['Contract value', lkr(p.contract_value)],
    ['Collected', lkr(p.collected), { color: '#1E8E4E' }],
    ['Balance due', lkr(p.balance_due), { strong: true }],
  ]);
  pdf.signatures(['Prepared by', 'Customer signature', 'Authorised signature']);
  pdf.end();
});

export default router;
