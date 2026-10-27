import { createHash, createHmac } from 'node:crypto';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { migrate, type Db } from '../src/db.js';

// mesmos tipos numéricos do adaptador pg: bigint e numeric viram number
const parsers = {
  20: (v: string) => Number(v),
  1700: (v: string) => Number(v),
};

function pgliteDb(pg: PGlite | Transaction): Db {
  const inTx = !('transaction' in pg);
  const db: Db = {
    async query<T>(sql: string, params?: unknown[]) {
      if (!params || params.length === 0) {
        // exec aceita vários comandos (migrações); devolve as rows do último
        const results = await pg.exec(sql);
        const last = results[results.length - 1];
        return { rows: (last?.rows ?? []) as T[] };
      }
      const res = await pg.query<T>(sql, params);
      return { rows: res.rows };
    },
    transaction<R>(fn: (tx: Db) => Promise<R>) {
      if (inTx) return fn(db);
      return (pg as PGlite).transaction((tx) => fn(pgliteDb(tx)));
    },
  };
  return db;
}

export async function createTestDb(): Promise<Db> {
  const db = pgliteDb(new PGlite({ parsers }));
  await migrate(db);
  return db;
}

export async function seedClient(
  db: Db,
  c: Partial<{ id: string; secret: string; readToken: string }> = {},
): Promise<{ id: string; secret: string; readToken: string }> {
  const id = c.id ?? 'demo';
  const secret = c.secret ?? 'test-secret';
  const readToken = c.readToken ?? 'test-token';
  const hash = createHash('sha256').update(readToken).digest('hex');
  await db.query(
    'insert into clients (id, name, webhook_secret, read_token_hash) values ($1, $2, $3, $4)',
    [id, id, secret, hash],
  );
  return { id, secret, readToken };
}

export function sign(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}
