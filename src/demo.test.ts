import { describe, expect, it } from 'vitest';
import { checkReadToken, findClient } from './clients.js';
import { loadConfig } from './config.js';
import { ensureDemoClient } from './demo.js';
import { createTestDb, seedClient } from '../test/helpers.js';

const env = {
  DATABASE_URL: 'postgres://x',
  DEMO_CLIENT_ID: 'demo',
  DEMO_CLIENT_NAME: 'Cliente Demo',
  DEMO_WEBHOOK_SECRET: 'segredo-demo',
  DEMO_READ_TOKEN: 'token-demo',
};

describe('ensureDemoClient', () => {
  it('cria o cliente e o token de leitura vale', async () => {
    const db = await createTestDb();
    expect(await ensureDemoClient(db, loadConfig(env))).toBe(true);
    expect(await checkReadToken(db, 'demo', 'token-demo')).toBe(true);
    expect((await findClient(db, 'demo'))?.webhookSecret).toBe('segredo-demo');
  });

  it('chamar duas vezes não falha e deixa 1 linha', async () => {
    const db = await createTestDb();
    const config = loadConfig(env);
    await ensureDemoClient(db, config);
    await ensureDemoClient(db, config);
    const { rows } = await db.query<{ n: number }>('select count(*) as n from clients');
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('não sobrescreve um cliente que já existia', async () => {
    const db = await createTestDb();
    await seedClient(db, { id: 'demo', secret: 'outro-segredo' });
    await ensureDemoClient(db, loadConfig(env));
    expect((await findClient(db, 'demo'))?.webhookSecret).toBe('outro-segredo');
  });

  it('faltando uma variável, devolve false e não cria nada', async () => {
    const db = await createTestDb();
    const { DEMO_READ_TOKEN: _, ...parcial } = env;
    expect(await ensureDemoClient(db, loadConfig(parcial))).toBe(false);
    const { rows } = await db.query<{ n: number }>('select count(*) as n from clients');
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
