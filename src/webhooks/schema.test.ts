import { describe, expect, it } from 'vitest';
import { parseEvent } from './schema.js';

function evento(over: Record<string, unknown> = {}) {
  return {
    event_id: 'evt_1',
    event_type: 'sale.approved',
    occurred_at: '2026-10-27T14:03:00Z',
    platform: 'kiwify',
    sale: {
      id: 'ord_123',
      amount_cents: 19790,
      currency: 'BRL',
      product: { id: 'curso-ts', name: 'Curso de TypeScript' },
    },
    ...over,
  };
}

const parse = (o: unknown) => parseEvent(Buffer.from(JSON.stringify(o)));

function paths(o: unknown): string[] {
  const r = parse(o);
  if (r.ok) throw new Error('esperava erro');
  return r.details.map((d) => d.path);
}

describe('parseEvent', () => {
  it('evento válido', () => {
    expect(parse(evento()).ok).toBe(true);
  });

  it('aceita offset +00:00', () => {
    expect(parse(evento({ occurred_at: '2026-10-27T14:03:00+00:00' })).ok).toBe(true);
  });

  it('campo extra no topo é aceito e preservado', () => {
    const r = parse(evento({ foo: 1 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.event as Record<string, unknown>).foo).toBe(1);
  });

  it('sem event_id', () => {
    const { event_id: _omit, ...resto } = evento();
    expect(paths(resto)).toContain('event_id');
  });

  it('amount_cents negativo ou fracionário', () => {
    const sale = evento().sale;
    expect(paths(evento({ sale: { ...sale, amount_cents: -1 } }))).toContain('sale.amount_cents');
    expect(paths(evento({ sale: { ...sale, amount_cents: 10.5 } }))).toContain('sale.amount_cents');
  });

  it('currency inválida', () => {
    const sale = evento().sale;
    expect(paths(evento({ sale: { ...sale, currency: 'brl' } }))).toContain('sale.currency');
    expect(paths(evento({ sale: { ...sale, currency: 'BRLL' } }))).toContain('sale.currency');
  });

  it('occurred_at inválido', () => {
    expect(paths(evento({ occurred_at: '2026-10-27' }))).toContain('occurred_at');
    expect(paths(evento({ occurred_at: 'ontem' }))).toContain('occurred_at');
  });

  it('event_type desconhecido', () => {
    expect(paths(evento({ event_type: 'sale.paid' }))).toContain('event_type');
  });

  it('JSON quebrado', () => {
    expect(parseEvent(Buffer.from('{oi'))).toEqual({
      ok: false,
      details: [{ path: '', message: 'invalid json' }],
    });
  });
});
