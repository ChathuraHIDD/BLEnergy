import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';

const router = Router();

// Simple in-memory brute-force guard: 8 failed attempts per IP → 10 minute lock.
const attempts = new Map();
const LOCK_MS = 10 * 60 * 1000;

router.post('/login', async (req, res) => {
  const { username, password } = z.object({
    username: z.string({ required_error: 'Username is required' }).trim().min(1, 'Username is required'),
    password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  }).parse(req.body);

  const key = req.ip;
  const entry = attempts.get(key);
  if (entry && entry.count >= 8 && Date.now() - entry.last < LOCK_MS) {
    throw new HttpError(429, 'Too many failed attempts. Please wait 10 minutes and try again');
  }

  const { rows } = await query('SELECT * FROM admins WHERE username = $1', [username]);
  const admin = rows[0];
  const ok = admin && (await bcrypt.compare(password, admin.password_hash));
  if (!ok) {
    const e = entry && Date.now() - entry.last < LOCK_MS ? entry : { count: 0 };
    attempts.set(key, { count: e.count + 1, last: Date.now() });
    throw new HttpError(401, 'Incorrect username or password');
  }
  attempts.delete(key);
  await query('UPDATE admins SET last_login_at = now() WHERE id = $1', [admin.id]);
  const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
  res.json({ token, admin: { id: admin.id, username: admin.username } });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT id, username, last_login_at FROM admins WHERE id = $1', [req.admin.id]);
  if (!rows[0]) throw new HttpError(401, 'Account not found');
  res.json(rows[0]);
});

router.post('/change-password', requireAuth, async (req, res) => {
  const body = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
      .min(8, 'New password must be at least 8 characters')
      .regex(/[A-Za-z]/, 'New password must contain a letter')
      .regex(/[0-9]/, 'New password must contain a number'),
  }).parse(req.body);
  const { rows } = await query('SELECT password_hash FROM admins WHERE id = $1', [req.admin.id]);
  if (!rows[0] || !(await bcrypt.compare(body.currentPassword, rows[0].password_hash))) {
    throw new HttpError(422, 'Current password is incorrect', { currentPassword: 'Current password is incorrect' });
  }
  await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(body.newPassword, 12), req.admin.id]);
  res.json({ message: 'Password updated' });
});

export default router;
