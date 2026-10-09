import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';

// Every permanent delete must carry the company delete code in the `X-Delete-Code` header.
// The code is stored hashed in settings ('delete_code'); 5 wrong codes lock deletes for 5 minutes.
const failures = new Map();
const LOCK_MS = 5 * 60 * 1000;
let cachedHash;

async function codeHash() {
  if (!cachedHash) {
    const { rows } = await query(`SELECT value->>'hash' AS hash FROM settings WHERE key = 'delete_code'`);
    cachedHash = rows[0]?.hash;
  }
  return cachedHash;
}

export async function requireDeleteCode(req, res, next) {
  if (req.method !== 'DELETE' || req.path.startsWith('/notifications')) return next();
  const key = req.ip;
  const f = failures.get(key);
  if (f && f.count >= 5 && Date.now() - f.last < LOCK_MS) {
    return res.status(429).json({ message: 'Too many wrong delete codes. Deleting is locked for 5 minutes' });
  }
  const code = String(req.headers['x-delete-code'] || '').trim();
  const hash = await codeHash();
  if (!code) return res.status(403).json({ message: 'Enter the delete code to confirm', fields: { delete_code: 'Delete code is required' } });
  if (!hash || !(await bcrypt.compare(code, hash))) {
    const prev = f && Date.now() - f.last < LOCK_MS ? f : { count: 0 };
    failures.set(key, { count: prev.count + 1, last: Date.now() });
    return res.status(403).json({ message: 'Incorrect delete code', fields: { delete_code: 'Incorrect delete code' } });
  }
  failures.delete(key);
  next();
}
