import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { HttpError, notFound } from '../utils/errors.js';
import { idParam, isoDate, likeTerm, money, optDate, optId, optText, reqText } from '../utils/validation.js';
import { generateNotifications } from '../services/notifications.js';
import { startPdf, fmtDate, label, lkr } from '../pdf/template.js';

const router = Router();

const itemSchema = z.object({
  description: reqText('Item description', 300),
  quantity: money('Quantity', { positive: true }),
  unit_price: money('Unit price'),
});

const invoiceSchema = z.object({
  project_id: optId,
  customer_name: reqText('Customer name', 160),
  customer_address: optText(400),
  customer_phone: optText(40),
  issue_date: isoDate('Issue date'),
  due_date: optDate('Due date'),
  discount: money('Discount').default(0),
  tax_rate: money('Tax rate').refine((n) => n <= 100, 'Tax rate cannot exceed 100%').default(0),
  notes: optText(2000),
  status: z.enum(['issued', 'cancelled']).default('issued'),
  items: z.array(itemSchema).min(1, 'Add at least one line item').max(100),
}).superRefine((inv, ctx) => {
  if (inv.due_date && inv.due_date < inv.issue_date) {
    ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'Due date cannot be before the issue date' });
  }
  const subtotal = inv.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  if (inv.discount > subtotal) ctx.addIssue({ code: 'custom', path: ['discount'], message: 'Discount cannot be more than the subtotal' });
});

const STATUS_SQL = `CASE
  WHEN i.status = 'cancelled' THEN 'cancelled'
  WHEN b.balance <= 0 THEN 'paid'
  WHEN i.due_date IS NOT NULL AND i.due_date < current_date THEN 'overdue'
  WHEN b.paid > 0 THEN 'partial'
  ELSE 'unpaid' END`;

router.get('/', async (req, res) => {
  const { q, status, project_id, from, to } = req.query;
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (q) add('(i.code ILIKE ? OR i.customer_name ILIKE ? OR p.code ILIKE ? OR p.title ILIKE ?)', likeTerm(q));
  if (project_id) add('i.project_id = ?', Number(project_id));
  if (from) add('i.issue_date >= ?', from);
  if (to) add('i.issue_date <= ?', to);
  if (status) add(`${STATUS_SQL} = ?`, status);
  const { rows } = await query(
    `SELECT i.*, b.subtotal, b.tax_amount, b.total, b.paid, b.balance, ${STATUS_SQL} AS payment_status,
            p.code AS project_code, p.title AS project_title
     FROM invoices i JOIN invoice_balances b ON b.id = i.id LEFT JOIN projects p ON p.id = i.project_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY i.issue_date DESC, i.id DESC`,
    params,
  );
  res.json(rows);
});

async function loadInvoice(id) {
  const { rows } = await query(
    `SELECT i.*, b.subtotal, b.tax_amount, b.total, b.paid, b.balance, ${STATUS_SQL} AS payment_status,
            p.code AS project_code, p.title AS project_title
     FROM invoices i JOIN invoice_balances b ON b.id = i.id LEFT JOIN projects p ON p.id = i.project_id WHERE i.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('Invoice');
  const [items, payments] = await Promise.all([
    query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position, id', [id]),
    query(`SELECT id, code, txn_date, amount, payment_method, reference FROM transactions WHERE invoice_id = $1 ORDER BY txn_date, id`, [id]),
  ]);
  return { ...rows[0], items: items.rows, payments: payments.rows };
}

router.get('/:id', async (req, res) => res.json(await loadInvoice(idParam(req))));

async function save(client, id, inv) {
  if (inv.project_id) {
    const { rows } = await client.query('SELECT id FROM projects WHERE id = $1', [inv.project_id]);
    if (!rows[0]) throw new HttpError(422, 'Selected project does not exist', { project_id: 'Selected project does not exist' });
  }
  const vals = [inv.project_id, inv.customer_name, inv.customer_address, inv.customer_phone, inv.issue_date, inv.due_date,
    inv.discount, inv.tax_rate, inv.notes, inv.status];
  let invoiceId = id;
  if (id) {
    const { rows } = await client.query(
      `UPDATE invoices SET project_id=$1, customer_name=$2, customer_address=$3, customer_phone=$4, issue_date=$5, due_date=$6,
         discount=$7, tax_rate=$8, notes=$9, status=$10 WHERE id=$11 RETURNING id`,
      [...vals, id],
    );
    if (!rows[0]) throw notFound('Invoice');
    await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
  } else {
    const { rows } = await client.query(
      `INSERT INTO invoices (project_id, customer_name, customer_address, customer_phone, issue_date, due_date, discount, tax_rate, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      vals,
    );
    invoiceId = rows[0].id;
  }
  for (const [i, it] of inv.items.entries()) {
    await client.query(
      'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, position) VALUES ($1,$2,$3,$4,$5)',
      [invoiceId, it.description, it.quantity, it.unit_price, i],
    );
  }
  const { rows } = await client.query('SELECT total, paid FROM invoice_balances WHERE id = $1', [invoiceId]);
  if (rows[0].paid > rows[0].total + 0.001) {
    throw new HttpError(422, `Invoice total cannot be less than the ${lkr(rows[0].paid)} already paid against it`);
  }
  return invoiceId;
}

router.post('/', async (req, res) => {
  const inv = invoiceSchema.parse(req.body);
  const id = await withTransaction((client) => save(client, null, inv));
  await generateNotifications();
  res.status(201).json(await loadInvoice(id));
});

router.put('/:id', async (req, res) => {
  const inv = invoiceSchema.parse(req.body);
  const id = await withTransaction((client) => save(client, idParam(req), inv));
  await generateNotifications();
  res.json(await loadInvoice(id));
});

router.delete('/:id', async (req, res) => {
  const id = idParam(req);
  const { rows: paid } = await query('SELECT count(*) AS n FROM transactions WHERE invoice_id = $1', [id]);
  if (paid[0].n > 0) throw new HttpError(409, 'This invoice has payments recorded. Cancel it instead of deleting');
  const { rows } = await query('DELETE FROM invoices WHERE id = $1 RETURNING code', [id]);
  if (!rows[0]) throw notFound('Invoice');
  res.json({ message: `Invoice ${rows[0].code} deleted` });
});

router.get('/:id/pdf', async (req, res) => {
  const inv = await loadInvoice(idParam(req));
  const pdf = await startPdf(req, res, { title: `Invoice ${inv.code}`, filename: `${inv.code}.pdf` });
  pdf.titleBlock(inv.status === 'cancelled' ? 'Invoice (Cancelled)' : 'Invoice', [
    ['Invoice No', inv.code],
    ['Issue date', fmtDate(inv.issue_date)],
    ['Due date', fmtDate(inv.due_date)],
    ['Status', label(inv.payment_status)],
  ]);
  pdf.section('Bill to');
  pdf.keyValues([
    ['Customer', inv.customer_name],
    ['Phone', inv.customer_phone || '-'],
    ['Address', inv.customer_address || '-'],
    ['Project', inv.project_code ? `${inv.project_code} – ${inv.project_title}` : '-'],
  ]);
  pdf.section('Items');
  pdf.table([
    { label: '#', width: 0.06, align: 'center', render: (r) => r.position + 1 },
    { label: 'Description', width: 0.48, render: (r) => r.description },
    { label: 'Qty', width: 0.1, align: 'right', render: (r) => r.quantity },
    { label: 'Unit price', width: 0.18, align: 'right', render: (r) => lkr(r.unit_price) },
    { label: 'Amount', width: 0.18, align: 'right', render: (r) => lkr(r.quantity * r.unit_price), bold: true },
  ], inv.items);
  const totals = [['Subtotal', lkr(inv.subtotal)]];
  if (inv.discount > 0) totals.push(['Discount', `- ${lkr(inv.discount)}`]);
  if (inv.tax_rate > 0) totals.push([`Tax (${inv.tax_rate}%)`, lkr(inv.tax_amount)]);
  totals.push(['Total', lkr(inv.total), { strong: true }]);
  if (inv.paid > 0) {
    totals.push(['Paid', lkr(inv.paid), { color: '#1E8E4E' }]);
    totals.push(['Balance due', lkr(inv.balance), { strong: true }]);
  }
  pdf.totals(totals);
  if (inv.payments.length) {
    pdf.section('Payments received');
    pdf.table([
      { label: 'Receipt', width: 0.22, render: (r) => r.code, bold: true },
      { label: 'Date', width: 0.18, render: (r) => fmtDate(r.txn_date) },
      { label: 'Method', width: 0.18, render: (r) => label(r.payment_method) },
      { label: 'Reference', width: 0.22, render: (r) => r.reference || '-' },
      { label: 'Amount', width: 0.2, align: 'right', render: (r) => lkr(r.amount) },
    ], inv.payments);
  }
  if (inv.notes) {
    pdf.section('Notes');
    pdf.paragraph(inv.notes);
  }
  pdf.signatures(['Customer signature', 'Authorised signature']);
  pdf.note('Thank you for choosing BatteryLab Energy. This is a computer generated invoice.');
  pdf.end();
});

export default router;
