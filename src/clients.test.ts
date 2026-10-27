import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedClient } from '../test/helpers.js';
import type { Db } from './db.js';
import { checkReadToken, createClient, findClient, hashToken } from './clients.js';

describe('clients', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedClient(db);
  });

  it('hashToken é sha256 hex determinístico', () => {
    const h = hashToken('test-token');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe('4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e');
    expect(hashToken('test-token')).toBe(h);
  });

  it('findClient devolve o cliente semeado', async () => {
    expect(await findClient(db, 'demo')).toEqual({ id: 'demo', name: 'demo', webhookSecret: 'test-secret' });
  });

  it('findClient devolve null se não existe', async () => {
    expect(await findClient(db, 'nao-existe')).toBeNull();
  });

  it('checkReadToken aceita o token certo', async () => {
    expect(await checkReadToken(db, 'demo', 'test-token')).toBe(true);
  });

  it('checkReadToken recusa token errado', async () => {
    expect(await checkReadToken(db, 'demo', 'errado')).toBe(false);
  });

  it('checkReadToken recusa cliente inexistente', async () => {
    expect(await checkReadToken(db, 'nao-existe', 'test-token')).toBe(false);
  });

  it('createClient gera secret e token', async () => {
    const c = await createClient(db, { id: 'novo', name: 'Novo' });
    expect(c.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(c.token).toMatch(/^[0-9a-f]{64}$/);
    expect(await checkReadToken(db, 'novo', c.token)).toBe(true);
    expect((await findClient(db, 'novo'))?.webhookSecret).toBe(c.secret);
  });

  it('createClient usa secret e token dados', async () => {
    const c = await createClient(db, { id: 'x', name: 'X', secret: 's1', token: 't1' });
    expect(c).toEqual({ id: 'x', secret: 's1', token: 't1' });
    expect(await checkReadToken(db, 'x', 't1')).toBe(true);
  });
});
