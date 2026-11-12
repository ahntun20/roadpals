import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = pg.Pool;
export type Q = Pick<pg.PoolClient, 'query'>;

export function createDb(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 20 });
}

export async function tx<T>(db: Db, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const here = dirname(fileURLToPath(import.meta.url));

/** Runs every .sql file in migrations/ once, in name order. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const dir = join(here, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    const done = await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f]);
    if (done.rowCount) continue;
    await tx(db, async (c) => {
      await c.query(readFileSync(join(dir, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
    });
    applied.push(f);
  }
  return applied;
}
