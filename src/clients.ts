import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from './db.js';

export type Client = { id: string; name: string; webhookSecret: string };

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function findClient(db: Db, id: string): Promise<Client | null> {
  const { rows } = await db.query<{ id: string; name: string; webhook_secret: string }>(
    'select id, name, webhook_secret from clients where id = $1',
    [id],
  );
  const row = rows[0];
  return row ? { id: row.id, name: row.name, webhookSecret: row.webhook_secret } : null;
}

export async function checkReadToken(db: Db, clientId: string, token: string): Promise<boolean> {
  const { rows } = await db.query<{ read_token_hash: string }>(
    'select read_token_hash from clients where id = $1',
    [clientId],
  );
  if (!rows[0]) return false;
  // compara hashes (tamanho fixo), não o token: timingSafeEqual exige buffers do mesmo tamanho
  const given = Buffer.from(hashToken(token), 'hex');
  const stored = Buffer.from(rows[0].read_token_hash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}

export async function createClient(
  db: Db,
  c: { id: string; name: string; secret?: string; token?: string },
): Promise<{ id: string; secret: string; token: string }> {
  const secret = c.secret ?? randomBytes(32).toString('hex');
  const token = c.token ?? randomBytes(32).toString('hex');
  await db.query(
    'insert into clients (id, name, webhook_secret, read_token_hash) values ($1, $2, $3, $4)',
    [c.id, c.name, secret, hashToken(token)],
  );
  return { id: c.id, secret, token };
}
