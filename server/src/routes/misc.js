import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { notFound } from '../utils/errors.js';
import { idParam, likeTerm, optEmail, optText, reqText } from '../utils/validation.js';
import { generateNotifications } from '../services/notifications.js';

const router = Router();

// ---------------------------------------------------------------- files
router.get('/files/:id', async (req, res) => {
  const { rows } = await query('SELECT original_name, mime_type, data FROM files WHERE id = $1', [idParam(req)]);
  if (!rows[0]) throw notFound('File');
  const f = rows[0];
  res.setHeader('Content-Type', f.mime_type);
  res.setHeader(
    'Content-Disposition',
    `${req.query.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
  );
  res.send(f.data);
});

// ---------------------------------------------------------------- catalog (brands / wire types)
router.get('/catalog', async (req, res) => {
  const { rows } = await query('SELECT category, name FROM catalog_items ORDER BY lower(name)');
  const out = { solar_panel: [], inverter: [], battery: [], wiring_brand: [], wire_type: [] };
  rows.forEach((r) => out[r.category].push(r.name));
  res.json(out);
});

router.post('/catalog', async (req, res) => {
  const b = z.object({
    category: z.enum(['solar_panel', 'inverter', 'battery', 'wiring_brand', 'wire_type']),
    name: reqText('Name', 120),
  }).parse(req.body);
  await query('INSERT INTO catalog_items (category, name) VALUES ($1, $2) ON CONFLICT (category, lower(name)) DO NOTHING', [b.category, b.name]);
  res.status(201).json(b);
});

// ---------------------------------------------------------------- settings
const companySchema = z.object({
  name: reqText('Company name', 160),
  tagline: optText(160),
  address: reqText('Address', 300),
  phone: optText(80),
  email: optEmail,
  website: optText(160),
  registration: optText(80),
});

router.get('/settings/company', async (req, res) => {
  const { rows } = await query(`SELECT value FROM settings WHERE key = 'company'`);
  res.json(rows[0]?.value || {});
});

router.put('/settings/company', async (req, res) => {
  const c = companySchema.parse(req.body);
  await query(
    `INSERT INTO settings (key, value) VALUES ('company', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [c],
  );
  res.json(c);
});

// ---------------------------------------------------------------- notifications
router.get('/notifications', async (req, res) => {
  const { filter = 'all', type } = req.query;
  const where = [];
  const params = [];
  if (filter === 'unread') where.push('n.is_read = false');
  if (type) {
    params.push(type);
    where.push(`n.type = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT n.*, p.code AS project_code, p.title AS project_title FROM notifications n
     LEFT JOIN projects p ON p.id = n.project_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY n.created_at DESC, n.id DESC LIMIT 300`,
    params,
  );
  res.json(rows);
});

router.get('/notifications/summary', async (req, res) => {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE NOT is_read) AS unread,
            (SELECT json_agg(x) FROM (SELECT id, type, title, message, project_id, is_read, created_at
               FROM notifications ORDER BY created_at DESC, id DESC LIMIT 6) x) AS latest
     FROM notifications`,
  );
  res.json({ unread: rows[0].unread, latest: rows[0].latest || [] });
});

/** Everything coming up in the next N days (default 30), plus overdue services. */
router.get('/notifications/upcoming', async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'warranty' AS type, c.warranty_expiry AS event_date, p.id AS project_id, p.code AS project_code, p.customer_name,
              initcap(replace(c.component_type, '_', ' ')) || ' – ' || c.brand || ' ' || c.size AS title
       FROM project_components c JOIN projects p ON p.id = c.project_id
       WHERE c.warranty_expiry BETWEEN current_date AND current_date + $1::int AND p.status <> 'cancelled'
       UNION ALL
       SELECT 'service', s.service_date, p.id, p.code, p.customer_name, s.title
       FROM project_services s JOIN projects p ON p.id = s.project_id
       WHERE s.status = 'scheduled' AND s.service_date <= current_date + $1::int
       UNION ALL
       SELECT 'invoice_due', i.due_date, i.project_id, i.code, i.customer_name, 'Invoice balance Rs. ' || to_char(b.balance, 'FM999,999,999,990.00')
       FROM invoices i JOIN invoice_balances b ON b.id = i.id
       WHERE i.status = 'issued' AND b.balance > 0 AND i.due_date IS NOT NULL AND i.due_date <= current_date + $1::int
     ) u ORDER BY event_date ASC LIMIT 100`,
    [days],
  );
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  res.json(rows.map((r) => ({ ...r, days_left: Math.round((Date.parse(r.event_date) - Date.parse(today)) / 86400000) })));
});

router.put('/notifications/read-all', async (req, res) => {
  await query('UPDATE notifications SET is_read = true WHERE is_read = false');
  res.json({ message: 'All notifications marked as read' });
});

router.put('/notifications/:id/read', async (req, res) => {
  const read = req.body?.is_read !== false;
  const { rows } = await query('UPDATE notifications SET is_read = $1 WHERE id = $2 RETURNING id', [read, idParam(req)]);
  if (!rows[0]) throw notFound('Notification');
  res.json({ message: 'Updated' });
});

router.delete('/notifications/:id', async (req, res) => {
  const { rows } = await query('DELETE FROM notifications WHERE id = $1 RETURNING id', [idParam(req)]);
  if (!rows[0]) throw notFound('Notification');
  res.json({ message: 'Notification removed' });
});

router.post('/notifications/refresh', async (req, res) => {
  await generateNotifications();
  res.json({ message: 'Notifications refreshed' });
});

// ---------------------------------------------------------------- global search
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ projects: [], contractors: [], transactions: [], invoices: [], quotations: [] });
  const t = likeTerm(q);
  const [projects, contractors, transactions, invoices, quotations] = await Promise.all([
    query(
      `SELECT id, code, title, customer_name, status, installation_date FROM projects
       WHERE code ILIKE $1 OR title ILIKE $1 OR customer_name ILIKE $1 OR customer_address ILIKE $1
          OR array_to_string(customer_phones, ' ') ILIKE $1
          OR to_char(installation_date, 'YYYY-MM-DD DD Mon YYYY') ILIKE $1 OR to_char(start_date, 'YYYY-MM-DD DD Mon YYYY') ILIKE $1
          OR to_char(created_at, 'YYYY-MM-DD') ILIKE $1
       ORDER BY created_at DESC LIMIT 8`, [t]),
    query(
      `SELECT id, code, name, company, phone FROM contractors
       WHERE code ILIKE $1 OR name ILIKE $1 OR company ILIKE $1 OR phone ILIKE $1 ORDER BY name LIMIT 5`, [t]),
    query(
      `SELECT t.id, t.code, t.kind, t.amount, t.txn_date, t.category, t.reference FROM transactions t
       WHERE t.code ILIKE $1 OR t.reference ILIKE $1 OR t.party ILIKE $1 OR t.description ILIKE $1 OR to_char(t.txn_date, 'YYYY-MM-DD') ILIKE $1
       ORDER BY t.txn_date DESC LIMIT 5`, [t]),
    query(
      `SELECT id, code, customer_name, issue_date FROM invoices WHERE code ILIKE $1 OR customer_name ILIKE $1
       ORDER BY issue_date DESC LIMIT 5`, [t]),
    query(
      `SELECT id, code, title, customer_name FROM quotations WHERE code ILIKE $1 OR title ILIKE $1 OR customer_name ILIKE $1
       ORDER BY quote_date DESC LIMIT 5`, [t]),
  ]);
  res.json({
    projects: projects.rows,
    contractors: contractors.rows,
    transactions: transactions.rows,
    invoices: invoices.rows,
    quotations: quotations.rows,
  });
});

// ---------------------------------------------------------------- finance overview
const monthSeries = (months) => `
  SELECT to_char(m, 'YYYY-MM') AS month, to_char(m, 'Mon YY') AS label,
         coalesce(sum(t.amount) FILTER (WHERE t.kind = 'income'), 0) AS income,
         coalesce(sum(t.amount) FILTER (WHERE t.kind = 'expense'), 0) AS expense
  FROM generate_series(date_trunc('month', current_date) - interval '${months - 1} months', date_trunc('month', current_date), interval '1 month') m
  LEFT JOIN transactions t ON date_trunc('month', t.txn_date) = m
  GROUP BY m ORDER BY m`;

router.get('/finance/overview', async (req, res) => {
  const from = req.query.from || '1900-01-01';
  const to = req.query.to || '2999-12-31';
  const range = [from, to];
  const [totals, receivables, invoices, monthly, byCategory, recent] = await Promise.all([
    query(
      `SELECT coalesce(sum(amount) FILTER (WHERE kind='income'),0) AS income,
              coalesce(sum(amount) FILTER (WHERE kind='expense'),0) AS expense,
              coalesce(sum(amount) FILTER (WHERE category='Project Payment'),0) AS project_collections,
              coalesce(sum(amount) FILTER (WHERE category='Contractor Payment'),0) AS contractor_payments,
              count(*) AS count
       FROM transactions WHERE txn_date BETWEEN $1 AND $2`, range),
    query(
      `SELECT coalesce(sum(greatest(p.contract_value - coalesce(x.collected,0), 0)),0) AS outstanding,
              count(*) FILTER (WHERE p.contract_value - coalesce(x.collected,0) > 0) AS projects_with_balance
       FROM projects p
       LEFT JOIN (SELECT project_id, sum(amount) AS collected FROM transactions WHERE kind='income' GROUP BY project_id) x ON x.project_id = p.id
       WHERE p.status <> 'cancelled'`),
    query(
      `SELECT coalesce(sum(b.balance) FILTER (WHERE b.balance > 0),0) AS unpaid,
              count(*) FILTER (WHERE b.balance > 0 AND i.due_date < current_date) AS overdue
       FROM invoices i JOIN invoice_balances b ON b.id = i.id WHERE i.status = 'issued'`),
    query(monthSeries(12)),
    query(
      `SELECT kind, category, sum(amount) AS total, count(*) AS count FROM transactions
       WHERE txn_date BETWEEN $1 AND $2 GROUP BY kind, category ORDER BY total DESC`, range),
    query(
      `SELECT t.id, t.code, t.kind, t.category, t.amount, t.txn_date, t.reference, p.code AS project_code, c.name AS contractor_name, t.party
       FROM transactions t LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN contractors c ON c.id = t.contractor_id
       ORDER BY t.txn_date DESC, t.id DESC LIMIT 8`),
  ]);
  res.json({
    totals: { ...totals.rows[0], net: totals.rows[0].income - totals.rows[0].expense },
    receivables: receivables.rows[0],
    invoices: invoices.rows[0],
    monthly: monthly.rows,
    byCategory: byCategory.rows,
    recent: recent.rows,
  });
});

// ---------------------------------------------------------------- main dashboard
router.get('/dashboard', async (req, res) => {
  const [projects, contractors, finance, notes, recentProjects, monthly, upcoming] = await Promise.all([
    query(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE status='planning') AS planning,
              count(*) FILTER (WHERE status='in_progress') AS in_progress,
              count(*) FILTER (WHERE status='completed') AS completed,
              count(*) FILTER (WHERE status='on_hold') AS on_hold,
              count(*) FILTER (WHERE status='cancelled') AS cancelled,
              coalesce(sum(contract_value) FILTER (WHERE status <> 'cancelled'),0) AS contract_value,
              count(*) FILTER (WHERE created_at >= date_trunc('month', current_date)) AS this_month
       FROM projects`),
    query(
      `SELECT count(*) AS total, count(*) FILTER (WHERE status='active') AS active, coalesce(sum(crew_count) FILTER (WHERE status='active'),0) AS crew
       FROM contractors`),
    query(
      `SELECT coalesce(sum(amount) FILTER (WHERE kind='income'),0) AS income,
              coalesce(sum(amount) FILTER (WHERE kind='expense'),0) AS expense,
              coalesce(sum(amount) FILTER (WHERE kind='income' AND txn_date >= date_trunc('month', current_date)),0) AS income_month,
              coalesce(sum(amount) FILTER (WHERE kind='expense' AND txn_date >= date_trunc('month', current_date)),0) AS expense_month,
              (SELECT coalesce(sum(greatest(p.contract_value - coalesce((SELECT sum(amount) FROM transactions x WHERE x.project_id=p.id AND x.kind='income'),0),0)),0)
                 FROM projects p WHERE p.status <> 'cancelled') AS outstanding
       FROM transactions`),
    query(`SELECT count(*) FILTER (WHERE NOT is_read) AS unread, count(*) AS total FROM notifications`),
    query(
      `SELECT p.id, p.code, p.title, p.customer_name, p.status, p.category, p.contract_value, p.created_at,
              (SELECT coalesce(sum(amount),0) FROM transactions t WHERE t.project_id=p.id AND t.kind='income') AS collected
       FROM projects p ORDER BY p.created_at DESC LIMIT 6`),
    query(monthSeries(6)),
    query(
      `SELECT count(*) FILTER (WHERE type='warranty') AS warranties, count(*) FILTER (WHERE type='service') AS services FROM (
         SELECT 'warranty' AS type FROM project_components c JOIN projects p ON p.id=c.project_id
           WHERE c.warranty_expiry BETWEEN current_date AND current_date + 30 AND p.status <> 'cancelled'
         UNION ALL
         SELECT 'service' FROM project_services WHERE status='scheduled' AND service_date BETWEEN current_date AND current_date + 30) u`),
  ]);
  res.json({
    projects: projects.rows[0],
    contractors: contractors.rows[0],
    finance: { ...finance.rows[0], net: finance.rows[0].income - finance.rows[0].expense },
    notifications: { ...notes.rows[0], ...upcoming.rows[0] },
    recentProjects: recentProjects.rows,
    monthly: monthly.rows,
  });
});

export default router;
