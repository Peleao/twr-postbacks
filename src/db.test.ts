import { describe, expect, it } from 'vitest';
import { migrate } from './db.js';
import { createTestDb, seedClient, sign } from '../test/helpers.js';

describe('db', () => {
  it('migrate duas vezes não lança e registra 1 migração', async () => {
    const db = await createTestDb();
    await expect(migrate(db)).resolves.toBeUndefined();
    const { rows } = await db.query<{ name: string }>('select name from schema_migrations');
    expect(rows).toEqual([{ name: '001_init.sql' }]);
  });

  it('tabelas existem', async () => {
    const db = await createTestDb();
    await seedClient(db);
    for (const t of ['clients', 'webhook_events', 'sales']) {
      await expect(db.query(`select * from ${t}`)).resolves.toBeDefined();
    }
    const { rows } = await db.query('select * from clients');
    expect(rows).toHaveLength(1);
  });

  it('transaction com erro faz rollback e relança', async () => {
    const db = await createTestDb();
    await expect(
      db.transaction(async (tx) => {
        await seedClient(tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const { rows } = await db.query('select * from clients');
    expect(rows).toHaveLength(0);
  });

  it('transaction devolve o valor e persiste', async () => {
    const db = await createTestDb();
    const r = await db.transaction(async (tx) => {
      await seedClient(tx);
      return tx.transaction(async () => 42);
    });
    expect(r).toBe(42);
    const { rows } = await db.query('select * from clients');
    expect(rows).toHaveLength(1);
  });

  it('bigint volta como number', async () => {
    const db = await createTestDb();
    await seedClient(db);
    await db.query(
      `insert into sales (client_id, platform, sale_id, product_id, product_name, amount_cents, currency, status, sold_at, last_event_at)
       values ('demo', 'p', 's1', 'pr', 'Produto', $1, 'BRL', 'approved', now(), now())`,
      [19790],
    );
    const a = await db.query<{ amount_cents: number }>('select amount_cents from sales');
    expect(a.rows[0].amount_cents).toBe(19790);
    const s = await db.query<{ total: number }>('select sum(amount_cents) as total from sales');
    expect(typeof s.rows[0].total).toBe('number');
    expect(s.rows[0].total).toBe(19790);
  });

  it('sign gera sha256= + 64 hex', () => {
    expect(sign('{"a":1}', 'k')).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
