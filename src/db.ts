import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}

// bigint (20) e numeric (1700) viram number: valores em centavos cabem com folga.
// Parser próprio do pool, sem mexer no estado global do pg.
const BIGINT_OID = 20;
const NUMERIC_OID = 1700;
const types = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    if (oid === BIGINT_OID || oid === NUMERIC_OID) return (v: string) => Number(v);
    return pg.types.getTypeParser(oid, format as 'text');
  },
};

function clientDb(client: pg.PoolClient): Db {
  const db: Db = {
    async query<T>(sql: string, params?: unknown[]) {
      const res = await client.query(sql, params);
      return { rows: res.rows as T[] };
    },
    // já estamos numa transação: sem aninhar, sem savepoint
    transaction: (fn) => fn(db),
  };
  return db;
}

export function createPgDb(databaseUrl: string): Db & { close(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: databaseUrl, types });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const res = await pool.query(sql, params);
      return { rows: res.rows as T[] };
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(clientDb(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function migrate(db: Db): Promise<void> {
  await db.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  // o serviço e os testes rodam da raiz do projeto
  const dir = path.join(process.cwd(), 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = await db.query<{ name: string }>('select name from schema_migrations');
  const done = new Set(applied.rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('insert into schema_migrations (name) values ($1)', [file]);
    });
  }
}
