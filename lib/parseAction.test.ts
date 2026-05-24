import { describe, it, expect } from 'vitest';
import { parseAction } from './parseAction';

describe('parseAction', () => {
  it('parses a delisting action', () => {
    const r = parseAction('{"type":"validatorL1Vote","D":"BTC"}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.variant).toBe('delisting');
      expect(r.innerKey).toBe('D');
    }
  });

  it('parses an outcome action', () => {
    const r = parseAction('{"type":"validatorL1Vote","O":{"settle":{"x":1}}}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.variant).toBe('outcome');
      expect(r.innerKey).toBe('O');
    }
  });

  it('flags unknown variant but still ok', () => {
    const r = parseAction('{"type":"validatorL1Vote","X":{"future":true}}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.variant).toBe('unknown');
  });

  it('rejects non-validatorL1Vote', () => {
    const r = parseAction('{"type":"order","o":{}}');
    expect(r.ok).toBe(false);
  });

  it('rejects malformed JSON', () => {
    const r = parseAction('{type: validatorL1Vote');
    expect(r.ok).toBe(false);
  });

  it('detects private-key pattern', () => {
    const r = parseAction(
      '{"type":"validatorL1Vote","D":"0xdeadbeef1234567890abcdef0123456789abcdef0123456789abcdef01234567"}',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.credentialDetected).toBe(true);
  });

  it('detects mnemonic pattern', () => {
    const r = parseAction(
      'abandon ability able about above absent absorb abstract absurd abuse access accident',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.credentialDetected).toBe(true);
  });

  it('handles Python-style "action = {...}" paste', () => {
    const r = parseAction('action = {"type": "validatorL1Vote", "D": "test"}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.variant).toBe('delisting');
      expect(r.action).toEqual({ type: 'validatorL1Vote', D: 'test' });
    }
  });

  it('handles trailing semicolon', () => {
    const r = parseAction('{"type":"validatorL1Vote","D":"x"};');
    expect(r.ok).toBe(true);
  });

  it('handles "const action = {...};" wrapper', () => {
    const r = parseAction('const action = {"type":"validatorL1Vote","D":"x"};');
    expect(r.ok).toBe(true);
  });

  it('handles nested braces inside string values', () => {
    const r = parseAction(
      'action = {"type":"validatorL1Vote","D":"contains } and { chars"}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action['D']).toBe('contains } and { chars');
  });
});
