import { createHmac, timingSafeEqual } from 'node:crypto';

const FORMATO = /^sha256=([0-9a-f]{64})$/i;

// HMAC-SHA256 sobre os bytes exatos recebidos; nunca lança
export function verifySignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  const match = header ? FORMATO.exec(header) : null;
  if (!match) return false;
  const given = Buffer.from(match[1]!, 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  // timingSafeEqual lança se os tamanhos diferem
  return given.length === expected.length && timingSafeEqual(given, expected);
}
