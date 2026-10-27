import { z } from 'zod';

const text = z.string().min(1);

export const webhookEventSchema = z
  .object({
    event_id: text,
    event_type: z.enum(['sale.pending', 'sale.approved', 'sale.canceled', 'sale.refunded', 'sale.chargeback']),
    occurred_at: z.iso.datetime({ offset: true }),
    platform: text,
    sale: z.object({
      id: text,
      amount_cents: z.number().int().min(0),
      currency: z.string().regex(/^[A-Z]{3}$/),
      product: z.object({ id: text, name: text }),
    }),
  })
  .passthrough();

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export type ParseResult =
  | { ok: true; event: WebhookEvent }
  | { ok: false; details: { path: string; message: string }[] };

export function parseEvent(raw: Buffer): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ok: false, details: [{ path: '', message: 'invalid json' }] };
  }
  const result = webhookEventSchema.safeParse(json);
  if (result.success) return { ok: true, event: result.data };
  return {
    ok: false,
    details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
