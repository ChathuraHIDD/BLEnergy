import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { HttpError, notFound } from '../utils/errors.js';
import { idParam, isoDate, likeTerm, money, optDate, optId, optText, reqText } from '../utils/validation.js';
import { saveFile, uploadDocument } from '../middleware/upload.js';

const router = Router();

const quotationSchema = z.object({
  project_id: optId,
  customer_name: reqText('Customer name', 160),
  title: reqText('Title', 200),
  amount: money('Amount'),
  quote_date: isoDate('Quotation date'),
  valid_until: optDate('Valid until'),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected']).default('sent'),
  notes: optText(2000),
}).superRefine((q, ctx) => {
  if (q.valid_until && q.valid_until < q.quote_date) {
    ctx.addIssue({ code: 'custom', path: ['valid_until'], message: 'Valid-until date cannot be before the quotation date' });
  }
});

const SELECT = `
  SELECT q.*, p.code AS project_code, p.title AS project_title, f.original_name AS file_name, f.mime_type AS file_mime, f.size_bytes AS file_size
  FROM quotations q LEFT JOIN projects p ON p.id = q.project_id LEFT JOIN files f ON f.id = q.file_id`;

router.get('/', async (req, res) => {
  const { q, status, project_id, from, to } = req.query;
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (q) add('(q.code ILIKE ? OR q.title ILIKE ? OR q.customer_name ILIKE ? OR p.code ILIKE ? OR f.original_name ILIKE ?)', likeTerm(q));
  if (status) add('q.status = ?', status);
  if (project_id) add('q.project_id = ?', Number(project_id));
  if (from) add('q.quote_date >= ?', from);
  if (to) add('q.quote_date <= ?', to);
  const { rows } = await query(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY q.quote_date DESC, q.id DESC`, params);
  res.json(rows);
});

async function checkProject(client, id) {
  if (!id) return;
  const { rows } = await client.query('SELECT id FROM projects WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(422, 'Selected project does not exist', { project_id: 'Selected project does not exist' });
}

router.post('/', uploadDocument.single('file'), async (req, res) => {
  const q = quotationSchema.parse(req.body);
  if (!req.file) throw new HttpError(422, 'Attach the quotation (PDF or Word)', { file: 'Attach the quotation file' });
  const id = await withTransaction(async (client) => {
    await checkProject(client, q.project_id);
    const fileId = await saveFile(client, req.file);
    const { rows } = await client.query(
      `INSERT INTO quotations (project_id, customer_name, title, amount, quote_date, valid_until, status, notes, file_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [q.project_id, q.customer_name, q.title, q.amount, q.quote_date, q.valid_until, q.status, q.notes, fileId],
    );
    return rows[0].id;
  });
  const { rows } = await query(`${SELECT} WHERE q.id = $1`, [id]);
  res.status(201).json(rows[0]);
});

router.put('/:id', uploadDocument.single('file'), async (req, res) => {
  const id = idParam(req);
  const q = quotationSchema.parse(req.body);
  await withTransaction(async (client) => {
    await checkProject(client, q.project_id);
    const { rows: cur } = await client.query('SELECT file_id FROM quotations WHERE id = $1 FOR UPDATE', [id]);
    if (!cur[0]) throw notFound('Quotation');
    let fileId = cur[0].file_id;
    if (req.file) {
      fileId = await saveFile(client, req.file);
    }
    await client.query(
      `UPDATE quotations SET project_id=$1, customer_name=$2, title=$3, amount=$4, quote_date=$5, valid_until=$6, status=$7, notes=$8, file_id=$9
       WHERE id=$10`,
      [q.project_id, q.customer_name, q.title, q.amount, q.quote_date, q.valid_until, q.status, q.notes, fileId, id],
    );
    if (req.file && cur[0].file_id) await client.query('DELETE FROM files WHERE id = $1', [cur[0].file_id]);
  });
  const { rows } = await query(`${SELECT} WHERE q.id = $1`, [id]);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = idParam(req);
  await withTransaction(async (client) => {
    const { rows } = await client.query('DELETE FROM quotations WHERE id = $1 RETURNING file_id', [id]);
    if (!rows[0]) throw notFound('Quotation');
    if (rows[0].file_id) await client.query('DELETE FROM files WHERE id = $1', [rows[0].file_id]);
  });
  res.json({ message: 'Quotation deleted' });
});

export default router;
