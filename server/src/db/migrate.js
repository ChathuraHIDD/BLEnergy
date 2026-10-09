import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import migrations from './migrations/index.js';
import { connectionUrl } from './index.js';


const LOCK_ID = 7_202_610; // any constant – serialises migrations across serverless instances

/**
 * Applies pending SQL migrations and creates the admin account on an empty database.
 * Uses a direct (unpooled) connection when available, because session advisory locks
 * and multi-statement DDL don't work through a transaction pooler.
 */
export async function migrate() {
  const client = new pg.Client({ connectionString: connectionUrl(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL) });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await runMigrations(client);
    await ensureAdmin(client);
    await ensureDeleteCode(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    await client.end();
  }
}

async function runMigrations(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  for (const { name: file, sql } of migrations) {
    if (applied.has(file)) continue;
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✔ applied migration ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
}

async function ensureAdmin(client) {
  const { rows } = await client.query('SELECT count(*) FROM admins');
  if (rows[0].count > 0) return;
  const username = process.env.ADMIN_USERNAME || 'BLEAdmin';
  const password = process.env.ADMIN_PASSWORD || 'adminBL26';
  const hash = await bcrypt.hash(password, 12);
  await client.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, hash]);
  console.log(`✔ admin account "${username}" created`);
}

/** The code required to confirm any permanent delete (stored hashed). */
async function ensureDeleteCode(client) {
  const { rows } = await client.query(`SELECT 1 FROM settings WHERE key = 'delete_code'`);
  if (rows[0]) return;
  const hash = await bcrypt.hash(process.env.DELETE_CODE || '0518', 10);
  await client.query(`INSERT INTO settings (key, value) VALUES ('delete_code', $1)`, [{ hash }]);
  console.log('✔ delete code configured');
}

// Allow `npm run db:migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
