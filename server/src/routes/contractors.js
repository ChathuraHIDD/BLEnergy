import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { HttpError, notFound } from '../utils/errors.js';
import { idParam, likeTerm, optEmail, optText, phone, reqText } from '../utils/validation.js';
import { startPdf, fmtDate, label, lkr } from '../pdf/template.js';

const router = Router();

const contractorSchema = z.object({
  name: reqText('Name', 120),
  phone,
  company: optText(160),
  crew_count: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? 0 : Number(v)),
    z.number({ invalid_type_error: 'Crew count must be a number' }).int('Crew count must be a whole number').min(0, 'Crew count cannot be negative').max(10000, 'Crew count is too large'),
  ),
  email: optEmail,
  address: optText(300),
  specialization: optText(160),
  notes: optText(2000),
  status: z.enum(['active', 'inactive']).default('active'),
});

const STATS = `
  (SELECT count(*) FROM projects p WHERE p.wiring_contractor_id = c.id) AS project_count,
  (SELECT coalesce(sum(amount), 0) FROM transactions t WHERE t.contractor_id = c.id AND t.kind = 'expense') AS total_paid`;

router.get('/', async (req, res) => {
  const { q, status } = req.query;
  const where = [];
  const params = [];
  if (q) {
    params.push(likeTerm(q));
    where.push(`(c.name ILIKE $${params.length} OR c.code ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.company ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT c.*, ${STATS} FROM contractors c
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.created_at DESC`,
    params,
  );
  res.json(rows);
});

async function loadContractor(id) {
  const { rows } = await query(`SELECT c.*, ${STATS} FROM contractors c WHERE c.id = $1`, [id]);
  if (!rows[0]) throw notFound('Contractor');
  const [projects, payments] = await Promise.all([
    query(
      `SELECT p.id, p.code, p.title, p.customer_name, p.status, p.category, p.installation_date, p.start_date, p.created_at,
              (SELECT coalesce(sum(amount),0) FROM transactions t WHERE t.project_id = p.id AND t.contractor_id = $1 AND t.kind='expense') AS paid_for_project
       FROM projects p WHERE p.wiring_contractor_id = $1 ORDER BY p.created_at DESC`,
      [id],
    ),
    query(
      `SELECT t.*, p.code AS project_code, p.title AS project_title
       FROM transactions t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.contractor_id = $1 ORDER BY t.txn_date DESC, t.id DESC`,
      [id],
    ),
  ]);
  return { ...rows[0], projects: projects.rows, payments: payments.rows };
}

router.get('/:id', async (req, res) => {
  res.json(await loadContractor(idParam(req)));
});

router.post('/', async (req, res) => {
  const b = contractorSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO contractors (name, phone, company, crew_count, email, address, specialization, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.name, b.phone, b.company, b.crew_count, b.email, b.address, b.specialization, b.notes, b.status],
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const id = idParam(req);
  const b = contractorSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE contractors SET name=$1, phone=$2, company=$3, crew_count=$4, email=$5, address=$6,
       specialization=$7, notes=$8, status=$9, updated_at=now()
     WHERE id=$10 RETURNING *`,
    [b.name, b.phone, b.company, b.crew_count, b.email, b.address, b.specialization, b.notes, b.status, id],
  );
  if (!rows[0]) throw notFound('Contractor');
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = idParam(req);
  const { rows: used } = await query(
    `SELECT (SELECT count(*) FROM projects WHERE wiring_contractor_id = $1) + (SELECT count(*) FROM transactions WHERE contractor_id = $1) AS n`,
    [id],
  );
  if (used[0].n > 0) {
    throw new HttpError(409, 'This contractor has projects or payments on record. Mark them as inactive instead of deleting');
  }
  const { rows } = await query('DELETE FROM contractors WHERE id = $1 RETURNING id', [id]);
  if (!rows[0]) throw notFound('Contractor');
  res.json({ message: 'Contractor deleted' });
});

router.get('/:id/pdf', async (req, res) => {
  const c = await loadContractor(idParam(req));
  const pdf = await startPdf(req, res, { title: `Contractor Profile ${c.code}`, filename: `${c.code}-profile.pdf` });
  pdf.titleBlock('Contractor Profile', [['Contractor ID', c.code], ['Status', label(c.status)], ['Registered', fmtDate(c.created_at)]]);
  pdf.section('Contractor details');
  pdf.keyValues([
    ['Name', c.name], ['Phone', c.phone],
    ['Company', c.company || '-'], ['Crew members', c.crew_count],
    ['Email', c.email || '-'], ['Specialization', c.specialization || '-'],
    ['Address', c.address || '-'], ['Total paid', lkr(c.total_paid)],
  ]);
  if (c.notes) pdf.paragraph(c.notes);
  pdf.section(`Projects (${c.projects.length})`);
  pdf.table([
    { label: 'Project ID', width: 0.17, render: (r) => r.code, bold: true },
    { label: 'Title', width: 0.3, render: (r) => r.title },
    { label: 'Customer', width: 0.22, render: (r) => r.customer_name },
    { label: 'Status', width: 0.13, render: (r) => label(r.status) },
    { label: 'Paid', width: 0.18, align: 'right', render: (r) => lkr(r.paid_for_project) },
  ], c.projects, { emptyText: 'No projects assigned yet' });
  pdf.section('Payment history');
  pdf.table([
    { label: 'Voucher', width: 0.18, render: (r) => r.code, bold: true },
    { label: 'Date', width: 0.14, render: (r) => fmtDate(r.txn_date) },
    { label: 'Project', width: 0.18, render: (r) => r.project_code || '-' },
    { label: 'Method / Ref', width: 0.3, render: (r) => `${label(r.payment_method)}${r.reference ? ` / ${r.reference}` : ''}` },
    { label: 'Amount', width: 0.2, align: 'right', render: (r) => lkr(r.amount) },
  ], c.payments, { emptyText: 'No payments recorded' });
  pdf.totals([['Total paid', lkr(c.total_paid), { strong: true }]]);
  pdf.end();
});

export default router;
