import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createTestDb, seedClient } from '../../test/helpers.js';

async function setup() {
  const db = await createTestDb();
  const a = await seedClient(db, { id: 'a', readToken: 'token-a' });
  const b = await seedClient(db, { id: 'b', readToken: 'token-b' });
  return { app: buildApp({ db }), a, b };
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe('GET /clients/:clientId/report', () => {
  it('401 com corpo idêntico em todos os casos de falha', async () => {
    const { app, b } = await setup();
    const casos = [
      { url: '/clients/a/report' },
      { url: '/clients/a/report', headers: { authorization: 'token-a' } },
      { url: '/clients/a/report', headers: bearer('errado') },
      { url: '/clients/a/report', headers: bearer(b.readToken) },
      { url: '/clients/zzz/report', headers: bearer('token-a') },
    ];
    for (const c of casos) {
      const res = await app.inject({ method: 'GET', ...c });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'unauthorized' });
    }
    await app.close();
  });

  it('sem token + query inválida → 401', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/clients/a/report?from=xx' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('token certo + query inválida → 400', async () => {
    const { app, a } = await setup();
    for (const q of ['from=2026-02-30', 'from=2026-10-02&to=2026-10-01']) {
      const res = await app.inject({
        method: 'GET',
        url: `/clients/a/report?${q}`,
        headers: bearer(a.readToken),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_query' });
    }
    await app.close();
  });

  it('token certo sem query → 200 com filters null', async () => {
    const { app, a } = await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/clients/a/report',
      headers: bearer(a.readToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body)).toEqual(['client_id', 'filters', 'generated_at', 'currencies']);
    expect(body.client_id).toBe('a');
    expect(body.filters).toEqual({ from: null, to: null, platform: null });
    expect(typeof body.generated_at).toBe('string');
    expect(body.currencies).toEqual([]);
    await app.close();
  });
});
