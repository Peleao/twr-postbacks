import { describe, expect, it } from 'vitest';
import { dateRange, parseReportQuery } from './query.js';

describe('parseReportQuery', () => {
  it('vazio → todos null', () => {
    expect(parseReportQuery({})).toEqual({ from: null, to: null, platform: null });
  });

  it('from/to/platform válidos ecoam', () => {
    expect(parseReportQuery({ from: '2026-10-01', to: '2026-10-31', platform: 'hotmart' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      platform: 'hotmart',
    });
  });

  it('rejeita datas inexistentes ou mal formatadas', () => {
    expect(parseReportQuery({ from: '2026-02-30' })).toBeNull();
    expect(parseReportQuery({ from: '2026-13-01' })).toBeNull();
    expect(parseReportQuery({ to: '2026-1-1' })).toBeNull();
  });

  it('from > to é inválido; from == to é válido', () => {
    expect(parseReportQuery({ from: '2026-10-02', to: '2026-10-01' })).toBeNull();
    expect(parseReportQuery({ from: '2026-10-01', to: '2026-10-01' })).not.toBeNull();
  });

  it('platform vazio é inválido', () => {
    expect(parseReportQuery({ platform: '' })).toBeNull();
  });
});

describe('dateRange', () => {
  it('to inclusivo vira o início do dia seguinte', () => {
    const r = dateRange({ from: '2026-10-01', to: '2026-10-31', platform: null });
    expect(r.start?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.endExclusive?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('sem filtros → null', () => {
    expect(dateRange({ from: null, to: null, platform: null })).toEqual({
      start: null,
      endExclusive: null,
    });
  });
});
