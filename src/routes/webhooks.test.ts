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
    const raw = JSON.stringify(validEvent(), null, 4).replace(/:/g, ' :  ');
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
