import { describe, expect, it } from 'vitest';
import type { Db } from '../db.js';
import { createTestDb, seedClient } from '../../test/helpers.js';
import { buildReport } from './build.js';

type Sale = {
  client_id: string;
  platform: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  amount_cents: number;
  currency: string;
  status: string;
  sold_at: string;
  last_event_at: string;
};

let seq = 0;
async function insertSale(db: Db, p: Partial<Sale> = {}): Promise<void> {
  const s: Sale = {
    client_id: 'demo',
    platform: 'hotmart',
    sale_id: `s${++seq}`,
    product_id: 'p1',
    product_name: 'Produto 1',
    amount_cents: 1000,
    currency: 'BRL',
    status: 'approved',
    sold_at: '2026-10-10T12:00:00Z',
    last_event_at: '2026-10-10T12:00:00Z',
    ...p,
  };
  await db.query(
    `insert into sales (client_id, platform, sale_id, product_id, product_name, amount_cents, currency, status, sold_at, last_event_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [s.client_id, s.platform, s.sale_id, s.product_id, s.product_name, s.amount_cents, s.currency, s.status, s.sold_at, s.last_event_at],
  );
}

const none = { from: null, to: null, platform: null };

async function setup() {
  const db = await createTestDb();
  await seedClient(db, { id: 'demo' });
  return db;
}

describe('buildReport', () => {
  it('duas moedas viram dois objetos separados', async () => {
    const db = await setup();
    await insertSale(db, { currency: 'BRL', amount_cents: 1000 });
    await insertSale(db, { currency: 'USD', amount_cents: 500 });
    await insertSale(db, { currency: 'USD', amount_cents: 700 });
    const r = await buildReport(db, 'demo', none);
    expect(r.currencies.map((c) => c.currency)).toEqual(['BRL', 'USD']);
    expect(r.currencies[0]!.net_revenue_cents).toBe(1000);
    expect(r.currencies[1]!.net_revenue_cents).toBe(1200);
    expect(r.currencies[1]!.by_status.approved).toEqual({ count: 2, amount_cents: 1200 });
  });

  it('refund conta em refunded mas não no net', async () => {
    const db = await setup();
    await insertSale(db, { amount_cents: 1000 });
    await insertSale(db, { amount_cents: 300, status: 'refunded' });
    const [c] = (await buildReport(db, 'demo', none)).currencies;
    expect(c!.by_status.refunded).toEqual({ count: 1, amount_cents: 300 });
    expect(c!.net_revenue_cents).toBe(1000);
  });

  it('bordas de período', async () => {
    const db = await setup();
    await insertSale(db, { sold_at: '2026-10-01T00:00:00Z' });
    await insertSale(db, { sold_at: '2026-10-31T23:59:59Z' });
    await insertSale(db, { sold_at: '2026-11-01T00:00:00Z' });
    await insertSale(db, { sold_at: '2026-09-30T23:59:59Z' });
    const r = await buildReport(db, 'demo', { from: '2026-10-01', to: '2026-10-31', platform: null });
    expect(r.currencies[0]!.by_status.approved.count).toBe(2);
  });

  it('filtro platform', async () => {
    const db = await setup();
    await insertSale(db, { platform: 'hotmart' });
    await insertSale(db, { platform: 'kiwify' });
    await insertSale(db, { platform: 'kiwify' });
    const r = await buildReport(db, 'demo', { from: null, to: null, platform: 'kiwify' });
    expect(r.currencies[0]!.by_status.approved.count).toBe(2);
  });

  it('cliente sem vendas → currencies []', async () => {
    const db = await setup();
    const r = await buildReport(db, 'demo', none);
    expect(r.currencies).toEqual([]);
  });

  it('um cliente nunca vê vendas de outro', async () => {
    const db = await setup();
    await seedClient(db, { id: 'outro', readToken: 'x' });
    await insertSale(db, { amount_cents: 1000 });
    await insertSale(db, { client_id: 'outro', amount_cents: 99999, currency: 'USD', product_id: 'secreto' });
    const r = await buildReport(db, 'demo', none);
    expect(r.currencies).toHaveLength(1);
    expect(r.currencies[0]!.currency).toBe('BRL');
    expect(r.currencies[0]!.net_revenue_cents).toBe(1000);
    expect(r.currencies[0]!.products.map((p) => p.product_id)).toEqual(['p1']);
  });

  it('valores grandes não perdem precisão e são number', async () => {
    const db = await setup();
    await insertSale(db, { amount_cents: 10 ** 12 });
    await insertSale(db, { amount_cents: 10 ** 12 });
    const [c] = (await buildReport(db, 'demo', none)).currencies;
    expect(c!.by_status.approved.amount_cents).toBe(2 * 10 ** 12);
    expect(typeof c!.by_status.approved.amount_cents).toBe('number');
    expect(typeof c!.by_status.approved.count).toBe('number');
    expect(typeof c!.products[0]!.net_revenue_cents).toBe('number');
    expect(typeof c!.products[0]!.approved_count).toBe('number');
  });

  it('produtos: net desc, nome da venda com last_event_at mais recente, só com aprovada', async () => {
    const db = await setup();
    await insertSale(db, { product_id: 'a', product_name: 'A velho', amount_cents: 100, last_event_at: '2026-10-01T00:00:00Z' });
    await insertSale(db, { product_id: 'a', product_name: 'A novo', amount_cents: 100, last_event_at: '2026-10-05T00:00:00Z' });
    await insertSale(db, { product_id: 'b', product_name: 'B', amount_cents: 900 });
    await insertSale(db, { product_id: 'c', product_name: 'C', amount_cents: 5000, status: 'refunded' });
    const [c] = (await buildReport(db, 'demo', none)).currencies;
    expect(c!.products).toEqual([
      { product_id: 'b', product_name: 'B', approved_count: 1, net_revenue_cents: 900 },
      { product_id: 'a', product_name: 'A novo', approved_count: 2, net_revenue_cents: 200 },
    ]);
  });

  it('contrato: cenário do exemplo', async () => {
    const db = await setup();
    const curso = { product_id: 'curso-ts', product_name: 'Curso de TypeScript' };
    await insertSale(db, { ...curso, status: 'pending', amount_cents: 4990 });
    for (let i = 0; i < 10; i++) await insertSale(db, { ...curso, amount_cents: 19790 });
    for (let i = 0; i < 2; i++) await insertSale(db, { ...curso, status: 'refunded', amount_cents: 19790 });
    const r = await buildReport(
      db,
      'demo',
      { from: '2026-10-01', to: '2026-10-31', platform: null },
      new Date('2026-10-27T15:00:00.000Z'),
    );
    expect(r).toEqual({
      client_id: 'demo',
      filters: { from: '2026-10-01', to: '2026-10-31', platform: null },
      generated_at: '2026-10-27T15:00:00.000Z',
      currencies: [
        {
          currency: 'BRL',
          by_status: {
            pending: { count: 1, amount_cents: 4990 },
            approved: { count: 10, amount_cents: 197900 },
            canceled: { count: 0, amount_cents: 0 },
            refunded: { count: 2, amount_cents: 39580 },
            chargeback: { count: 0, amount_cents: 0 },
          },
          net_revenue_cents: 197900,
          products: [
            { product_id: 'curso-ts', product_name: 'Curso de TypeScript', approved_count: 10, net_revenue_cents: 197900 },
          ],
        },
      ],
    });
    expect(Object.keys(r)).toEqual(['client_id', 'filters', 'generated_at', 'currencies']);
    expect(Object.keys(r.currencies[0]!)).toEqual(['currency', 'by_status', 'net_revenue_cents', 'products']);
    expect(Object.keys(r.currencies[0]!.by_status)).toEqual(['pending', 'approved', 'canceled', 'refunded', 'chargeback']);
  });
});
