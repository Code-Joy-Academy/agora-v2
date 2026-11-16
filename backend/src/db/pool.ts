import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy backend/.env.example to .env');
}

const commonPoolOptions = {
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10000),
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30000),
};

// A small dedicated pool holds session-level advisory locks while the tutoring
// pipeline uses the regular pool for retrieval and persistence queries. This
// prevents lock holders from exhausting the query pool and deadlocking it.
export const pool = new pg.Pool({ ...commonPoolOptions, max: Number(process.env.DB_POOL_MAX ?? 10) });
export const lockPool = new pg.Pool({ ...commonPoolOptions, max: Number(process.env.DB_LOCK_POOL_MAX ?? 5) });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Runs `fn` inside a transaction with the RLS session variable set, so every
// document/document_chunks query in `fn` is backstopped by the Postgres
// policy even if application code forgets a WHERE course_id = $1.
// SET LOCAL can't take a bind parameter, so course_id is validated as a
// well-formed UUID before interpolation to rule out injection.
export async function withCourseScope<T>(course_id: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(course_id)) throw new Error('invalid course_id');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_course_id = '${course_id}'`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
