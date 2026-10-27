import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Db } from './db.js';
import { createTestDb } from '../test/helpers.js';

describe('app', () => {
  it('GET /health responde 200 com o banco no ar', async () => {
    const app = buildApp({ db: await createTestDb() });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('GET /health responde 503 quando o banco falha', async () => {
    const db: Db = {
      query: () => Promise.reject(new Error('down')),
      transaction: () => Promise.reject(new Error('down')),
    };
    const app = buildApp({ db });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable' });
    await app.close();
  });
});
