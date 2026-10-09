import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { HttpError, notFound } from '../utils/errors.js';
import { idParam, isoDate, likeTerm, money, optId, optText, reqText } from '../utils/validation.js';
import { saveFile, uploadBill } from '../middleware/upload.js';
import { notify } from '../services/notifications.js';
import { startPdf, fmtDate, label, lkr } from '../pdf/template.js';

const router = Router();

export const PROJECT_PAYMENT = 'Project Payment';
export const CONTRACTOR_PAYMENT = 'Contractor Payment';
const DEFAULT_CATEGORIES = {
  income: [PROJECT_PAYMENT, 'Advance Payment', 'Service Charge', 'Equipment Sale', 'Other Income'],
  expense: [CONTRACTOR_PAYMENT, 'Equipment Purchase', 'Transport', 'Salaries', 'Rent', 'Utilities', 'Office Expenses', 'Marketing', 'Tools & Maintenance', 'Other Expense'],
};
const METHODS = ['cash', 'bank_transfer', 'cheque', 'card', 'online', 'other'];

const txnSchema = z.object({
  kind: z.enum(['income', 'expense'], { errorMap: () => ({ message: 'Select income or expense' }) }),
  category: reqText('Category', 80),
  amount: money('Amount', { positive: true }),
  txn_date: isoDate('Date'),
  description: optText(1000),
  payment_method: z.enum(METHODS, { errorMap: () => ({ message: 'Select a payment method' }) }),
  reference: optText(120),
  party: optText(160),
  project_id: optId,
  contractor_id: optId,
  invoice_id: optId,
  remove_file_ids: z.preprocess((v) => (v ? [].concat(v).map(Number) : []), z.array(z.number().int())).default([]),
}).superRefine((t, ctx) => {
  if (t.category === PROJECT_PAYMENT) {
    if (t.kind !== 'income') ctx.addIssue({ code: 'custom', path: ['kind'], message: 'Project payments are income' });
    if (!t.project_id) ctx.addIssue({ code: 'custom', path: ['project_id'], message: 'Select the project this payment is for' });
  }
  if (t.category === CONTRACTOR_PAYMENT) {
    if (t.kind !== 'expense') ctx.addIssue({ code: 'custom', path: ['kind'], message: 'Contractor payments are expenses' });
    if (!t.contractor_id) ctx.addIssue({ code: 'custom', path: ['contractor_id'], message: 'Select the contractor being paid' });
  }
  if (t.invoice_id && t.kind !== 'income') ctx.addIssue({ code: 'custom', path: ['invoice_id'], message: 'Only income can be linked to an invoice' });
  if (t.txn_date > new Date(Date.now() + 86400000 * 366).toISOString().slice(0, 10)) {
    ctx.addIssue({ code: 'custom', path: ['txn_date'], message: 'Date is too far in the future' });
  }
});

/** Cross-record business rules (existence, invoice/project match, overpayment). */
async function checkLinks(client, t, excludeId = null) {
  const fields = {};
  if (t.project_id) {
    const { rows } = await client.query(
      `SELECT p.contract_value, coalesce(sum(t.amount) FILTER (WHERE t.kind='income' AND t.id IS DISTINCT FROM $2), 0) AS collected
       FROM projects p LEFT JOIN transactions t ON t.project_id = p.id WHERE p.id = $1 GROUP BY p.id`,
      [t.project_id, excludeId],
    );
    if (!rows[0]) fields.project_id = 'Selected project does not exist';
    else if (t.category === PROJECT_PAYMENT && rows[0].contract_value > 0) {
      const remaining = rows[0].contract_value - rows[0].collected;
      if (t.amount > remaining + 0.001) {
        fields.amount = remaining <= 0
          ? 'This project is already fully paid. Update the contract value to record more payments'
          : `Amount exceeds the project balance of ${lkr(remaining)}`;
      }
    }
  }
  if (t.contractor_id) {
    const { rows } = await client.query('SELECT id FROM contractors WHERE id = $1', [t.contractor_id]);
    if (!rows[0]) fields.contractor_id = 'Selected contractor does not exist';
  }
  if (t.invoice_id) {
    const { rows } = await client.query(
      `SELECT i.project_id, i.status, b.total,
              coalesce((SELECT sum(amount) FROM transactions x WHERE x.invoice_id = i.id AND x.kind='income' AND x.id IS DISTINCT FROM $2), 0) AS paid
       FROM invoices i JOIN invoice_balances b ON b.id = i.id WHERE i.id = $1`,
      [t.invoice_id, excludeId],
    );
    const inv = rows[0];
    if (!inv) fields.invoice_id = 'Selected invoice does not exist';
    else if (inv.status === 'cancelled') fields.invoice_id = 'This invoice is cancelled';
    else if (t.project_id && inv.project_id && inv.project_id !== t.project_id) fields.invoice_id = 'Invoice belongs to a different project';
    else if (t.amount > inv.total - inv.paid + 0.001) fields.amount = `Amount exceeds the invoice balance of ${lkr(inv.total - inv.paid)}`;
  }
  if (Object.keys(fields).length) throw new HttpError(422, Object.values(fields)[0], fields);
}

const SELECT = `
  SELECT t.*, p.code AS project_code, p.title AS project_title, p.customer_name,
         c.name AS contractor_name, c.code AS contractor_code, i.code AS invoice_code,
         coalesce((SELECT json_agg(json_build_object('id', f.id, 'name', f.original_name, 'mime', f.mime_type, 'size', f.size_bytes) ORDER BY f.id)
                   FROM transaction_files tf JOIN files f ON f.id = tf.file_id WHERE tf.transaction_id = t.id), '[]') AS files
  FROM transactions t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN contractors c ON c.id = t.contractor_id
  LEFT JOIN invoices i ON i.id = t.invoice_id`;

function buildFilters(q) {
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (q.q) {
    add(`(t.code ILIKE ? OR t.reference ILIKE ? OR t.description ILIKE ? OR t.party ILIKE ? OR t.category ILIKE ?
          OR p.code ILIKE ? OR p.title ILIKE ? OR p.customer_name ILIKE ? OR c.name ILIKE ? OR c.code ILIKE ? OR i.code ILIKE ?)`, likeTerm(q.q));
  }
  if (q.kind) add('t.kind = ?', q.kind);
  if (q.category) add('t.category = ?', q.category);
  if (q.method) add('t.payment_method = ?', q.method);
  if (q.project_id) add('t.project_id = ?', Number(q.project_id));
  if (q.contractor_id) add('t.contractor_id = ?', Number(q.contractor_id));
  if (q.invoice_id) add('t.invoice_id = ?', Number(q.invoice_id));
  if (q.from) add('t.txn_date >= ?', q.from);
  if (q.to) add('t.txn_date <= ?', q.to);
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get('/categories', async (req, res) => {
  const { rows } = await query('SELECT DISTINCT kind, category FROM transactions');
  const out = { income: [...DEFAULT_CATEGORIES.income], expense: [...DEFAULT_CATEGORIES.expense] };
  rows.forEach((r) => !out[r.kind].includes(r.category) && out[r.kind].push(r.category));
  res.json(out);
});

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
  const { whereSql, params } = buildFilters(req.query);
  const from = `FROM transactions t LEFT JOIN projects p ON p.id = t.project_id
                LEFT JOIN contractors c ON c.id = t.contractor_id LEFT JOIN invoices i ON i.id = t.invoice_id ${whereSql}`;
  const [{ rows }, { rows: agg }] = await Promise.all([
    query(`${SELECT} ${whereSql} ORDER BY t.txn_date DESC, t.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params),
    query(`SELECT count(*) AS total,
              coalesce(sum(t.amount) FILTER (WHERE t.kind='income'),0) AS income,
              coalesce(sum(t.amount) FILTER (WHERE t.kind='expense'),0) AS expense ${from}`, params),
  ]);
  res.json({ rows, total: agg[0].total, income: agg[0].income, expense: agg[0].expense, page, pageSize });
});

router.get('/export/pdf', async (req, res) => {
  const { whereSql, params } = buildFilters(req.query);
  const { rows } = await query(`${SELECT} ${whereSql} ORDER BY t.txn_date ASC, t.id ASC`, params);
  const income = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);
  const heading = req.query.title || (req.query.kind === 'income' ? 'Income Statement' : req.query.kind === 'expense' ? 'Expense Statement' : 'Transactions Statement');

  const pdf = await startPdf(req, res, { title: heading, filename: `${heading.replace(/\s+/g, '-')}.pdf` });
  pdf.titleBlock(heading, [
    ['Period', `${req.query.from ? fmtDate(req.query.from) : 'Beginning'} – ${req.query.to ? fmtDate(req.query.to) : 'Today'}`],
    ['Records', rows.length],
  ]);
  const filters = [
    req.query.q && ['Search', req.query.q],
    req.query.category && ['Category', req.query.category],
    req.query.method && ['Method', label(req.query.method)],
    req.query.project_id && rows[0]?.project_code && ['Project', `${rows[0].project_code} – ${rows[0].project_title}`],
    req.query.contractor_id && rows[0]?.contractor_name && ['Contractor', `${rows[0].contractor_name} (${rows[0].contractor_code})`],
  ].filter(Boolean);
  if (filters.length) {
    pdf.section('Filters applied');
    pdf.keyValues(filters, 3);
  }
  pdf.section('Transactions');
  pdf.table([
    { label: 'Reference', width: 0.15, render: (r) => r.code, bold: true },
    { label: 'Date', width: 0.12, render: (r) => fmtDate(r.txn_date) },
    { label: 'Category', width: 0.15, render: (r) => r.category },
    { label: 'Details', width: 0.29, render: (r) => [r.project_code, r.contractor_name, r.party, r.reference && `Ref ${r.reference}`, r.description].filter(Boolean).join(' · ') || '-' },
    { label: 'Method', width: 0.11, render: (r) => label(r.payment_method) },
    { label: 'Amount', width: 0.18, align: 'right', render: (r) => `${r.kind === 'expense' ? '-' : ''}${lkr(r.amount)}`, color: (r) => (r.kind === 'income' ? '#1E8E4E' : '#C0392B') },
  ], rows, { emptyText: 'No transactions match the selected filters', fontSize: 8 });
  pdf.totals([
    ['Total income', lkr(income), { color: '#1E8E4E' }],
    ['Total expenses', lkr(expense), { color: '#C0392B' }],
    ['Net', lkr(income - expense), { strong: true }],
  ]);
  pdf.end();
});

async function loadTxn(id) {
  const { rows } = await query(`${SELECT} WHERE t.id = $1`, [id]);
  if (!rows[0]) throw notFound('Transaction');
  return rows[0];
}

router.get('/:id', async (req, res) => res.json(await loadTxn(idParam(req))));

router.post('/', uploadBill.array('files', 10), async (req, res) => {
  const t = txnSchema.parse(req.body);
  const created = await withTransaction(async (client) => {
    await checkLinks(client, t);
    const seq = t.kind === 'income' ? ['BLR', 'receipt_code_seq'] : ['BLV', 'voucher_code_seq'];
    const { rows } = await client.query(
      `INSERT INTO transactions (code, kind, category, amount, txn_date, description, payment_method, reference, party, project_id, contractor_id, invoice_id)
       VALUES ('${seq[0]}-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('${seq[1]}')::text, 5, '0'),
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, code`,
      [t.kind, t.category, t.amount, t.txn_date, t.description, t.payment_method, t.reference, t.party, t.project_id, t.contractor_id, t.invoice_id],
    );
    for (const f of req.files || []) {
      const fileId = await saveFile(client, f);
      await client.query('INSERT INTO transaction_files (transaction_id, file_id) VALUES ($1, $2)', [rows[0].id, fileId]);
    }
    return rows[0];
  });
  const full = await loadTxn(created.id);
  if (full.category === PROJECT_PAYMENT) {
    await notify({ title: 'Payment received', message: `${lkr(full.amount)} received for ${full.project_code} – ${full.customer_name} (${full.code})`, projectId: full.project_id });
  } else if (full.category === CONTRACTOR_PAYMENT) {
    await notify({ title: 'Contractor paid', message: `${lkr(full.amount)} paid to ${full.contractor_name} (${full.code})`, projectId: full.project_id });
  }
  res.status(201).json(full);
});

router.put('/:id', uploadBill.array('files', 10), async (req, res) => {
  const id = idParam(req);
  const t = txnSchema.parse(req.body);
  await withTransaction(async (client) => {
    const { rows: existing } = await client.query('SELECT kind FROM transactions WHERE id = $1 FOR UPDATE', [id]);
    if (!existing[0]) throw notFound('Transaction');
    if (existing[0].kind !== t.kind) throw new HttpError(422, 'Income/expense type cannot be changed. Delete and re-create the record instead', { kind: 'Type cannot be changed' });
    await checkLinks(client, t, id);
    await client.query(
      `UPDATE transactions SET category=$1, amount=$2, txn_date=$3, description=$4, payment_method=$5, reference=$6, party=$7,
         project_id=$8, contractor_id=$9, invoice_id=$10, updated_at=now() WHERE id=$11`,
      [t.category, t.amount, t.txn_date, t.description, t.payment_method, t.reference, t.party, t.project_id, t.contractor_id, t.invoice_id, id],
    );
    if (t.remove_file_ids.length) {
      await client.query(
        `DELETE FROM files WHERE id = ANY($1) AND id IN (SELECT file_id FROM transaction_files WHERE transaction_id = $2)`,
        [t.remove_file_ids, id],
      );
    }
    for (const f of req.files || []) {
      const fileId = await saveFile(client, f);
      await client.query('INSERT INTO transaction_files (transaction_id, file_id) VALUES ($1, $2)', [id, fileId]);
    }
  });
  res.json(await loadTxn(id));
});

router.delete('/:id', async (req, res) => {
  const id = idParam(req);
  await withTransaction(async (client) => {
    const { rows: files } = await client.query('SELECT file_id FROM transaction_files WHERE transaction_id = $1', [id]);
    const { rows } = await client.query('DELETE FROM transactions WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) throw notFound('Transaction');
    if (files.length) await client.query('DELETE FROM files WHERE id = ANY($1)', [files.map((f) => f.file_id)]);
  });
  res.json({ message: 'Transaction deleted' });
});

// Receipt (income) / payment voucher (expense)
router.get('/:id/pdf', async (req, res) => {
  const t = await loadTxn(idParam(req));
  const income = t.kind === 'income';
  const heading = income ? 'Payment Receipt' : 'Payment Voucher';
  const pdf = await startPdf(req, res, { title: `${heading} ${t.code}`, filename: `${t.code}.pdf` });
  pdf.titleBlock(heading, [
    [income ? 'Receipt No' : 'Voucher No', t.code],
    ['Date', fmtDate(t.txn_date)],
    ['Method', label(t.payment_method)],
  ]);
  pdf.amountBanner(income ? 'Amount received' : 'Amount paid', lkr(t.amount));

  pdf.section(income ? 'Received from' : 'Paid to');
  if (t.contractor_name) {
    pdf.keyValues([['Contractor', `${t.contractor_name} (${t.contractor_code})`], ['Payee', t.party || t.contractor_name]]);
  } else {
    pdf.keyValues([[income ? 'Payer' : 'Payee', t.party || t.customer_name || '-'], ['Project', t.project_code || '-']]);
  }

  pdf.section('Payment details');
  pdf.keyValues([
    ['Category', t.category],
    ['Payment method', label(t.payment_method)],
    ['Bank / cheque reference', t.reference || '-'],
    ['Project', t.project_code ? `${t.project_code} – ${t.project_title}` : '-'],
    ['Customer', t.customer_name || '-'],
    ['Invoice', t.invoice_code || '-'],
  ]);
  if (t.description) {
    pdf.section('Description');
    pdf.paragraph(t.description);
  }

  if (income && t.project_id) {
    const { rows } = await query(
      `SELECT p.contract_value, coalesce(sum(t.amount) FILTER (WHERE t.kind='income'), 0) AS collected
       FROM projects p LEFT JOIN transactions t ON t.project_id = p.id WHERE p.id = $1 GROUP BY p.id`,
      [t.project_id],
    );
    if (rows[0] && rows[0].contract_value > 0) {
      pdf.section('Project account');
      pdf.totals([
        ['Contract value', lkr(rows[0].contract_value)],
        ['Total collected to date', lkr(rows[0].collected), { color: '#1E8E4E' }],
        ['Balance due', lkr(Math.max(0, rows[0].contract_value - rows[0].collected)), { strong: true }],
      ]);
    }
  }
  pdf.signatures(income ? ['Received by', 'Authorised signature'] : ['Prepared by', 'Approved by', 'Received by']);
  pdf.note(income ? 'Thank you for your payment. This is a computer generated receipt.' : 'This is a computer generated payment voucher.');
  pdf.end();
});

export default router;
