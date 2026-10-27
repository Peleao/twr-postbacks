import { describe, expect, it } from 'vitest';
import { createTestDb, seedClient } from '../../test/helpers.js';
import { ingestEvent } from './ingest.js';
import { webhookEventSchema } from './schema.js';

function evt(over: Record<string, unknown> = {}) {
  return webhookEventSchema.parse({
    event_id: 'evt_1',
    event_type: 'sale.approved',
    occurred_at: '2026-10-27T14:03:00Z',
    platform: 'kiwify',
    sale: {
      id: 'ord_123',
      amount_cents: 19790,
      currency: 'BRL',
      product: { id: 'curso-ts', name: 'Curso de TypeScript' },
    },
    ...over,
  });
}

async function setup() {
  const db = await createTestDb();
  await seedClient(db);
  return db;
}

async function sale(db: Awaited<ReturnType<typeof setup>>, clientId = 'demo') {
  const r = await db.query<{ status: string; sold_at: Date; last_event_at: Date }>(
    'select status, sold_at, last_event_at from sales where client_id = $1',
    [clientId],
  );
  return r.rows;
}

async function count(db: Awaited<ReturnType<typeof setup>>, table: string) {
  const r = await db.query<{ n: number }>(`select count(*) as n from ${table}`);
  return r.rows[0].n;
}

const t = (s: string) => new Date(s).getTime();

describe('ingestEvent', () => {
  it('approved e depois refunded: venda fica refunded', async () => {
    const db = await setup();
    await ingestEvent(db, 'demo', evt());
    const r = await ingestEvent(
      db,
      'demo',
      evt({ event_id: 'evt_2', event_type: 'sale.refunded', occurred_at: '2026-10-27T14:10:00Z' }),
    );
    expect(r).toBe('applied');
    const [s] = await sale(db);
    expect(s.status).toBe('refunded');
    expect(s.last_event_at.getTime()).toBe(t('2026-10-27T14:10:00Z'));
    expect(await count(db, 'webhook_events')).toBe(2);
  });

  it('refunded chega antes do approved: approved é stale e sold_at é o menor', async () => {
    const db = await setup();
    await ingestEvent(
      db,
      'demo',
      evt({ event_id: 'evt_2', event_type: 'sale.refunded', occurred_at: '2026-10-27T14:10:00Z' }),
    );
    const r = await ingestEvent(db, 'demo', evt());
    expect(r).toBe('stale');
    const [s] = await sale(db);
    expect(s.status).toBe('refunded');
    expect(s.sold_at.getTime()).toBe(t('2026-10-27T14:03:00Z'));
    expect(s.last_event_at.getTime()).toBe(t('2026-10-27T14:10:00Z'));
  });

  it('mesmo occurred_at: refunded vence nas duas ordens', async () => {
    for (const ordem of [['approved', 'refunded'], ['refunded', 'approved']]) {
      const db = await setup();
      for (const [i, tipo] of ordem.entries()) {
        await ingestEvent(db, 'demo', evt({ event_id: `evt_${i}`, event_type: `sale.${tipo}` }));
      }
      expect((await sale(db))[0].status).toBe('refunded');
    }
  });

  it('mesmo event_id duas vezes: duplicate e venda inalterada', async () => {
    const db = await setup();
    expect(await ingestEvent(db, 'demo', evt())).toBe('applied');
    expect(await ingestEvent(db, 'demo', evt({ event_type: 'sale.refunded' }))).toBe('duplicate');
    expect(await count(db, 'webhook_events')).toBe(1);
    expect((await sale(db))[0].status).toBe('approved');
  });

  it('mesmo event_id em clientes diferentes não colide', async () => {
    const db = await setup();
    await seedClient(db, { id: 'outro' });
    await ingestEvent(db, 'demo', evt());
    await ingestEvent(db, 'outro', evt());
    expect(await count(db, 'webhook_events')).toBe(2);
    expect(await count(db, 'sales')).toBe(2);
  });

  it('campo extra no topo é guardado em payload', async () => {
    const db = await setup();
    await ingestEvent(db, 'demo', evt({ extra: 'x' }));
    const r = await db.query<{ payload: { extra: string; event_id: string } }>(
      'select payload from webhook_events',
    );
    expect(r.rows[0].payload.extra).toBe('x');
    expect(r.rows[0].payload.event_id).toBe('evt_1');
  });
});
