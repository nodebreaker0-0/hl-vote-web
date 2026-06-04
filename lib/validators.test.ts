import { describe, it, expect } from 'vitest';
import { buildValidatorIndex, governanceForSignerAccount } from './validators';
import type { ValidatorSummary } from './api';

function v(partial: Partial<ValidatorSummary>): ValidatorSummary {
  return {
    validator: '0x0000000000000000000000000000000000000000',
    signer: '0x0000000000000000000000000000000000000000',
    name: 'x',
    description: '',
    nRecentBlocks: 0,
    stake: 0,
    isJailed: false,
    unjailableAfter: null,
    isActive: true,
    commission: '0.0',
    stats: null,
    ...partial,
  } as ValidatorSummary;
}

describe('governanceForSignerAccount', () => {
  // Mainnet B-Harvest: validator ≠ signer.
  const idx = buildValidatorIndex([
    v({
      name: 'B-Harvest',
      validator: '0x15458aed3c7a49b215fbfa863c6ff550c31e1a31',
      signer: '0x21d50a1c2e70b2b4b25516c744da7f1de760b2ec',
    }),
  ]);

  it('resolves the signer account → governance address', () => {
    expect(governanceForSignerAccount(idx, '0x21d50a1c2e70b2b4b25516c744da7f1de760b2ec')).toBe(
      '0x15458aed3c7a49b215fbfa863c6ff550c31e1a31',
    );
  });

  it('also resolves when the connected account IS the governance address', () => {
    // The mainnet "Already voted" bug: operator connects with the validator
    // address itself; signer-only lookup returned null.
    expect(governanceForSignerAccount(idx, '0x15458aed3c7a49b215fbfa863c6ff550c31e1a31')).toBe(
      '0x15458aed3c7a49b215fbfa863c6ff550c31e1a31',
    );
  });

  it('is case-insensitive', () => {
    expect(governanceForSignerAccount(idx, '0x21D50A1C2E70B2B4B25516C744DA7F1DE760B2EC')).toBe(
      '0x15458aed3c7a49b215fbfa863c6ff550c31e1a31',
    );
  });

  it('returns null for an unknown account', () => {
    expect(governanceForSignerAccount(idx, '0x' + 'ab'.repeat(20))).toBeNull();
  });
});
