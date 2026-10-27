import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { Db } from '../db.js';
import { createTestDb, seedClient, sign } from '../../test/helpers.js';

// corpo de evento válido do contrato; os pacotes seguintes reutilizam os helpers abaixo
export function validEvent(over: Record<string, unknown> = {}) {
  return {
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
  };
}

// envia o corpo (string, bytes exatos) com assinatura; `signature` sobrescreve o cabeçalho
export function postWebhook(
  app: ReturnType<typeof buildApp>,
  clientId: string,
  raw: string,
  opts: { secret?: string; signature?: string | null } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.signature !== null) {
    headers['x-twr-signature'] = opts.signature ?? sign(raw, opts.secret ?? 'test-secret');
  }
  return app.inject({ method: 'POST', url: `/webhooks/${clientId}`, headers, payload: raw });
}

describe('POST /webhooks/:clientId validação', () => {
  async function post(raw: string, opts: { secret?: string } = {}) {
    const db = await createTestDb();
    await seedClient(db);
    const app = buildApp({ db });
    const res = await postWebhook(app, 'demo', raw, opts);
    await app.close();
    return res;
  }

  it('JSON inválido responde 400 com details', async () => {
    const res = await post('{oi');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_payload', details: [{ path: '', message: 'invalid json' }] });
  });

  it('amount_cents negativo responde 400 com o path', async () => {
    const e = validEvent();
    const res = await post(JSON.stringify({ ...e, sale: { ...(e.sale as object), amount_cents: -1 } }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_payload');
    expect(res.json().details.map((d: { path: string }) => d.path)).toContain('sale.amount_cents');
  });

  it('event_type desconhecido responde 400', async () => {
    const res = await post(JSON.stringify(validEvent({ event_type: 'sale.paid' })));
    expect(res.statusCode).toBe(400);
  });

  it('corpo inválido com assinatura errada responde 401', async () => {
    const res = await post('{oi', { secret: 'outro' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /webhooks/:clientId gravação', () => {
  async function setup() {
    const db = await createTestDb();
    await seedClient(db);
    return { db, app: buildApp({ db }) };
  }

  it('processa, reenvio é duplicate e evento antigo é applied:false', async () => {
    const { app } = await setup();
    const raw = JSON.stringify(validEvent({ event_type: 'sale.refunded', occurred_at: '2026-10-27T14:10:00Z' }));
    const a = await postWebhook(app, 'demo', raw);
    expect(a.statusCode).toBe(200);
    expect(a.json()).toEqual({ status: 'processed' });
    const b = await postWebhook(app, 'demo', raw);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual({ status: 'duplicate' });
    const c = await postWebhook(app, 'demo', JSON.stringify(validEvent({ event_id: 'evt_0' })));
    expect(c.statusCode).toBe(200);
    expect(c.json()).toEqual({ status: 'processed', applied: false });
    await app.close();
  });

  it('20 envios simultâneos do mesmo evento: 1 processed e 19 duplicate', async () => {
    const { db, app } = await setup();
    const raw = JSON.stringify(validEvent());
    const res = await Promise.all(Array.from({ length: 20 }, () => postWebhook(app, 'demo', raw)));
    expect(res.every((r) => r.statusCode === 200)).toBe(true);
    const status = res.map((r) => r.json().status);
    expect(status.filter((s) => s === 'processed')).toHaveLength(1);
    expect(status.filter((s) => s === 'duplicate')).toHaveLength(19);
    const ev = await db.query<{ n: number }>('select count(*) as n from webhook_events');
    const sa = await db.query<{ n: number }>('select count(*) as n from sales');
    expect(ev.rows[0].n).toBe(1);
    expect(sa.rows[0].n).toBe(1);
    await app.close();
  });

  it('transação que falha responde 500 internal_error', async () => {
    const { db } = await setup();
    const app = buildApp({ db: { query: db.query, transaction: () => Promise.reject(new Error('x')) } });
    const res = await postWebhook(app, 'demo', JSON.stringify(validEvent()));
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal_error' });
    await app.close();
  });
});

describe('POST /webhooks/:clientId', () => {
  it('assinatura válida responde 200 processed', async () => {
    const db = await createTestDb();
    await seedClient(db);
    const app = buildApp({ db });
    const res = await postWebhook(app, 'demo', JSON.stringify(validEvent()));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'processed' });
    await app.close();
  });

  it('corpo com espaçamento estranho assinado nos bytes exatos responde 200', async () => {
    const db = await createTestDb();
    await seedClient(db);
    const app = buildApp({ db });
    const raw = JSON.stringify(validEvent(), null, 4).replace(/":/g, '" :  ');
    const res = await postWebhook(app, 'demo', raw);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('sem cabeçalho, assinatura errada e cliente inexistente dão o mesmo 401', async () => {
    const db = await createTestDb();
    await seedClient(db);
    const app = buildApp({ db });
    const raw = JSON.stringify(validEvent());
    const semCabecalho = await postWebhook(app, 'demo', raw, { signature: null });
    const errada = await postWebhook(app, 'demo', raw, { secret: 'outro' });
    const inexistente = await postWebhook(app, 'ninguem', raw);
    for (const res of [semCabecalho, errada, inexistente]) {
      expect(res.statusCode).toBe(401);
      expect(res.body).toBe('{"error":"invalid_signature"}');
    }
    await app.close();
  });

  it('corpo acima de 64 KB responde 413', async () => {
    const db = await createTestDb();
    await seedClient(db);
    const app = buildApp({ db });
    const raw = JSON.stringify(validEvent({ padding: 'x'.repeat(64 * 1024) }));
    const res = await postWebhook(app, 'demo', raw);
    expect(res.statusCode).toBe(413);
    await app.close();
  });

  it('falha no banco responde 500 internal_error', async () => {
    const db: Db = {
      query: () => Promise.reject(new Error('down')),
      transaction: () => Promise.reject(new Error('down')),
    };
    const app = buildApp({ db });
    const res = await postWebhook(app, 'demo', JSON.stringify(validEvent()));
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal_error' });
    await app.close();
  });
});
