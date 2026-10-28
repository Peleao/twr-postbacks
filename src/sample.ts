import { createHmac, randomUUID } from 'node:crypto';

export function buildSampleEvent(opts: {
  type: string;
  saleId: string;
  amountCents?: number;
  eventId?: string;
  platform?: string;
  now?: Date;
}): string {
  return JSON.stringify({
    event_id: opts.eventId ?? `evt_${randomUUID()}`,
    event_type: opts.type,
    occurred_at: (opts.now ?? new Date()).toISOString(),
    platform: opts.platform ?? 'kiwify',
    sale: {
      id: opts.saleId,
      amount_cents: opts.amountCents ?? 19790,
      currency: 'BRL',
      product: { id: 'curso-ts', name: 'Curso de TypeScript' },
    },
  });
}

export function signBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}
