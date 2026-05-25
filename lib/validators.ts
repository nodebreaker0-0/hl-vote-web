// Lookup tables built from a `validatorSummaries` response.
//
// IMPORTANT — two distinct address spaces:
//   - `validator` field = the validator's governance address. This is what
//     appears in `validatorL1Votes[*].votes[]`.
//   - `signer` field    = the address that signs L1 actions with EIP-712
//     (what the operator's wallet — MetaMask hot key or imported Ledger —
//     uses). This is `wallet.account` in our UI.
//
// We index by both so we can:
//   * resolve `votes[]` entries (governance) to names,
//   * detect whether the connected wallet account (signer) belongs to one of
//     the active validators, and whose governance address therefore would be
//     in `votes[]` after a successful sign.

import type { ValidatorSummary } from './api';

export interface ValidatorIndex {
  /** lowercased *validator* (governance) hex → entry. Use for vote matching. */
  byValidator: Map<string, ValidatorSummary>;
  /** lowercased *signer* hex → entry. Use to identify the connected wallet. */
  bySigner: Map<string, ValidatorSummary>;
  /** isActive && !isJailed */
  active: ValidatorSummary[];
  /** every row */
  all: ValidatorSummary[];
}

export function buildValidatorIndex(summaries: ValidatorSummary[]): ValidatorIndex {
  const byValidator = new Map<string, ValidatorSummary>();
  const bySigner = new Map<string, ValidatorSummary>();
  for (const v of summaries) {
    byValidator.set(v.validator.toLowerCase(), v);
    bySigner.set(v.signer.toLowerCase(), v);
  }
  const active = summaries.filter((v) => v.isActive && !v.isJailed);
  return { byValidator, bySigner, active, all: summaries };
}

/** Try to resolve any address to a validator entry — checks both fields. */
export function lookupValidator(
  idx: ValidatorIndex,
  addr: string,
): ValidatorSummary | undefined {
  const a = addr.toLowerCase();
  return idx.byValidator.get(a) ?? idx.bySigner.get(a);
}

export function displayName(idx: ValidatorIndex, addr: string): string {
  const v = lookupValidator(idx, addr);
  return v ? v.name : addr.slice(0, 6) + '…' + addr.slice(-4);
}

/**
 * Split the active set by whether their *governance* address appears in
 * `voterAddresses` (which is `validatorL1Votes[*].votes[]`).
 *
 * `unknownVoters` are governance addresses present in the votes[] but not
 * mapped to any active validator — should be effectively zero in steady
 * state; usually means a validator just got jailed/inactive between the
 * vote and our snapshot.
 */
export function splitVoters(
  idx: ValidatorIndex,
  voterAddresses: string[],
): { voted: ValidatorSummary[]; notVoted: ValidatorSummary[]; unknownVoters: string[] } {
  const lowerVoters = new Set(voterAddresses.map((s) => s.toLowerCase()));
  const voted: ValidatorSummary[] = [];
  const notVoted: ValidatorSummary[] = [];
  for (const v of idx.active) {
    if (lowerVoters.has(v.validator.toLowerCase())) voted.push(v);
    else notVoted.push(v);
  }
  const activeValidatorsLower = new Set(idx.active.map((v) => v.validator.toLowerCase()));
  const unknownVoters = voterAddresses.filter(
    (a) => !activeValidatorsLower.has(a.toLowerCase()),
  );
  return { voted, notVoted, unknownVoters };
}

/**
 * Given the operator's connected wallet account (a *signer* hex), find the
 * corresponding validator's *governance* address — that is what will land in
 * votes[] after the operator's sign succeeds.
 */
export function governanceForSignerAccount(
  idx: ValidatorIndex,
  signerAccount: string,
): `0x${string}` | null {
  const v = idx.bySigner.get(signerAccount.toLowerCase());
  return v ? (v.validator as `0x${string}`) : null;
}
