import { hashToken } from './clients.js';
import type { Config } from './config.js';
import type { Db } from './db.js';

// Cria o cliente demo se as variáveis DEMO_* estiverem todas definidas; não mexe em um que já exista.
export async function ensureDemoClient(db: Db, config: Config): Promise<boolean> {
  const { DEMO_CLIENT_ID: id, DEMO_CLIENT_NAME: name, DEMO_WEBHOOK_SECRET: secret, DEMO_READ_TOKEN: token } = config;
  if (!id || !name || !secret || !token) return false;
  await db.query(
    'insert into clients (id, name, webhook_secret, read_token_hash) values ($1, $2, $3, $4) on conflict (id) do nothing',
    [id, name, secret, hashToken(token)],
  );
  return true;
}
