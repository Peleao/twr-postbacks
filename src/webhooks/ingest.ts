import type { Db } from '../db.js';
import type { WebhookEvent } from './schema.js';

// posto do status: em empate de occurred_at, o de maior posto vence
const RANK = ['pending', 'approved', 'canceled', 'refunded', 'chargeback'];

export async function ingestEvent(
  db: Db,
  clientId: string,
  event: WebhookEvent,
): Promise<'duplicate' | 'applied' | 'stale'> {
  return db.transaction(async (tx) => {
    // a unicidade (client_id, event_id) do banco decide quem é duplicado, inclusive em corrida
    const inserted = await tx.query(
      `insert into webhook_events (client_id, event_id, event_type, sale_id, platform, occurred_at, payload)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (client_id, event_id) do nothing
       returning id`,
      [
        clientId,
        event.event_id,
        event.event_type,
        event.sale.id,
        event.platform,
        event.occurred_at,
        JSON.stringify(event),
      ],
    );
    if (inserted.rows.length === 0) return 'duplicate';

    const status = event.event_type.replace(/^sale\./, '');
    const created = await tx.query(
      `insert into sales (client_id, platform, sale_id, product_id, product_name, amount_cents, currency,
                          status, sold_at, last_event_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $9::timestamptz)
       on conflict (client_id, platform, sale_id) do nothing
       returning 1`,
      [
        clientId,
        event.platform,
        event.sale.id,
        event.sale.product.id,
        event.sale.product.name,
        event.sale.amount_cents,
        event.sale.currency,
        status,
        event.occurred_at,
      ],
    );
    if (created.rows.length > 0) return 'applied';

    // a venda já existe: sold_at é sempre o menor occurred_at visto
    await tx.query(
      `update sales set sold_at = least(sold_at, $4::timestamptz)
       where client_id = $1 and platform = $2 and sale_id = $3`,
      [clientId, event.platform, event.sale.id, event.occurred_at],
    );
    // e o evento só muda o status se for mais novo (ou do mesmo instante e de posto maior)
    const updated = await tx.query(
      `update sales set status = $5, product_id = $6, product_name = $7, amount_cents = $8, currency = $9,
                        last_event_at = $4::timestamptz, updated_at = now()
       where client_id = $1 and platform = $2 and sale_id = $3
         and ($4::timestamptz > last_event_at
              or ($4::timestamptz = last_event_at
                  and array_position($10::text[], $5::text) > array_position($10::text[], status)))
       returning 1`,
      [
        clientId,
        event.platform,
        event.sale.id,
        event.occurred_at,
        status,
        event.sale.product.id,
        event.sale.product.name,
        event.sale.amount_cents,
        event.sale.currency,
        RANK,
      ],
    );
    return updated.rows.length > 0 ? 'applied' : 'stale';
  });
}
