import pg from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting),
// NUMERIC as JS numbers and COUNT(*) bigints as integers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const onVercel = Boolean(process.env.VERCEL);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Serverless instances are many and short-lived: keep each pool small and use the provider's pooled URL.
  max: onVercel ? 3 : 10,
  idleTimeoutMillis: onVercel ? 10000 : 30000,
  connectionTimeoutMillis: 10000,
});

export const query = (text, params) => pool.query(text, params);

/** Run `fn(client)` inside a transaction; rolls back on any thrown error. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
