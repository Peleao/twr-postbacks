import { describe, expect, it } from 'vitest';
import { buildSampleEvent, signBody } from './sample.js';
import { webhookEventSchema } from './webhooks/schema.js';
import { sign } from '../test/helpers.js';

describe('signBody', () => {
  it('bate com o sign dos testes', () => {
    expect(signBody('{"a":1}', 'segredo')).toBe(sign('{"a":1}', 'segredo'));
  });
});

describe('buildSampleEvent', () => {
  it('gera um evento que passa no schema do webhook', () => {
    const body = buildSampleEvent({ type: 'sale.approved', saleId: 'ord_1' });
    expect(webhookEventSchema.safeParse(JSON.parse(body)).success).toBe(true);
  });

  it('respeita o eventId', () => {
    const e = JSON.parse(buildSampleEvent({ type: 'sale.approved', saleId: 'ord_1', eventId: 'evt_fixo' }));
    expect(e.event_id).toBe('evt_fixo');
  });

  it('usa os padrões', () => {
    const now = new Date('2026-01-02T03:04:05.000Z');
    const e = JSON.parse(buildSampleEvent({ type: 'sale.pending', saleId: 'ord_9', now }));
    expect(e.event_id).toMatch(/^evt_.+/);
    expect(e.event_type).toBe('sale.pending');
    expect(e.occurred_at).toBe('2026-01-02T03:04:05.000Z');
    expect(e.platform).toBe('kiwify');
    expect(e.sale).toEqual({
      id: 'ord_9',
      amount_cents: 19790,
      currency: 'BRL',
      product: { id: 'curso-ts', name: 'Curso de TypeScript' },
    });
  });
});
