import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('lança citando DATABASE_URL quando falta', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('usa os padrões', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x' });
    expect(c.PORT).toBe(3000);
    expect(c.NODE_ENV).toBe('development');
  });

  it('converte PORT para número', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://x', PORT: '8080' }).PORT).toBe(8080);
  });

  it('as variáveis DEMO_* são opcionais', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x' });
    expect(c.DEMO_CLIENT_ID).toBeUndefined();
    expect(c.DEMO_READ_TOKEN).toBeUndefined();
  });

  it('lança com PORT inválida', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', PORT: 'abc' })).toThrow(/PORT/);
  });
});
