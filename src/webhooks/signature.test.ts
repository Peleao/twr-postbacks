import { describe, expect, it } from 'vitest';
import { sign } from '../../test/helpers.js';
import { verifySignature } from './signature.js';

const secret = 'test-secret';
const body = '{"a":1,"b":2}';

describe('verifySignature', () => {
  it('aceita a assinatura certa', () => {
    expect(verifySignature(Buffer.from(body), sign(body, secret), secret)).toBe(true);
  });

  it('rejeita segredo errado', () => {
    expect(verifySignature(Buffer.from(body), sign(body, 'outro'), secret)).toBe(false);
  });

  it('rejeita cabeçalho ausente', () => {
    expect(verifySignature(Buffer.from(body), undefined, secret)).toBe(false);
  });

  it('rejeita formato malformado sem lançar', () => {
    const hex = sign(body, secret).slice('sha256='.length);
    expect(verifySignature(Buffer.from(body), hex, secret)).toBe(false);
    expect(verifySignature(Buffer.from(body), 'sha256=' + hex.slice(2), secret)).toBe(false);
    expect(verifySignature(Buffer.from(body), 'sha256=' + hex + '00', secret)).toBe(false);
    expect(verifySignature(Buffer.from(body), 'sha256=' + 'zz'.repeat(32), secret)).toBe(false);
    expect(verifySignature(Buffer.from(body), '', secret)).toBe(false);
  });

  it('confere sobre os bytes exatos, não sobre JSON re-serializado', () => {
    const raw = '{ "b": 2,   "a": 1 }';
    const header = sign(raw, secret);
    expect(verifySignature(Buffer.from(raw), header, secret)).toBe(true);
    const reserialized = JSON.stringify(JSON.parse(raw));
    expect(verifySignature(Buffer.from(reserialized), header, secret)).toBe(false);
  });
});
