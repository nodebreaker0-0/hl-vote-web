import { describe, it, expect } from 'vitest';
import { actionFingerprint } from './history';

describe('actionFingerprint', () => {
  it('is stable across calls', () => {
    const a = { type: 'validatorL1Vote', D: 'BTC' };
    expect(actionFingerprint(a)).toBe(actionFingerprint(a));
  });

  it('differs for different actions', () => {
    expect(
      actionFingerprint({ type: 'validatorL1Vote', D: 'BTC' }),
    ).not.toBe(actionFingerprint({ type: 'validatorL1Vote', D: 'ETH' }));
  });

  it('is sensitive to key order (msgpack-level distinct)', () => {
    const a = { type: 'validatorL1Vote', D: 'x' };
    const b = { D: 'x', type: 'validatorL1Vote' };
    expect(actionFingerprint(a)).not.toBe(actionFingerprint(b));
  });
});
