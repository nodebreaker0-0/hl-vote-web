// Lookup table: signer-address → validator name (case-insensitive).
//
// Built from a `validatorSummaries` response. Used by VoteStatus to render
// "who voted / who hasn't" with human names instead of raw 0x addresses.

import type { ValidatorSummary } from './api';

export interface ValidatorIndex {
  /** lowercased signer hex → validator entry */
  bySigner: Map<string, ValidatorSummary>;
  /** filtered for isActive=true && !isJailed */
  active: ValidatorSummary[];
  /** total count including inactive/jailed */
  all: ValidatorSummary[];
}

export function buildValidatorIndex(summaries: ValidatorSummary[]): ValidatorIndex {
  const bySigner = new Map<string, ValidatorSummary>();
  for (const v of summaries) {
    bySigner.set(v.signer.toLowerCase(), v);
  }
  const active = summaries.filter((v) => v.isActive && !v.isJailed);
  return { bySigner, active, all: summaries };
}

export function nameForSigner(idx: ValidatorIndex, signer: string): string {
  const v = idx.bySigner.get(signer.toLowerCase());
  return v ? v.name : signer.slice(0, 6) + '…' + signer.slice(-4);
}

/** Returns {voted: [Validator…], notVoted: [Validator…]} over the active set. */
export function splitVoters(
  idx: ValidatorIndex,
  voterAddresses: string[],
): { voted: ValidatorSummary[]; notVoted: ValidatorSummary[]; unknownVoters: string[] } {
  const lowerVoters = new Set(voterAddresses.map((s) => s.toLowerCase()));
  const voted: ValidatorSummary[] = [];
  const notVoted: ValidatorSummary[] = [];
  for (const v of idx.active) {
    if (lowerVoters.has(v.signer.toLowerCase())) voted.push(v);
    else notVoted.push(v);
  }
  // signer addresses in votes[] that don't map to any active validator
  // (jailed, inactive, or unknown — rare but possible)
  const activeLower = new Set(idx.active.map((v) => v.signer.toLowerCase()));
  const unknownVoters = voterAddresses.filter((a) => !activeLower.has(a.toLowerCase()));
  return { voted, notVoted, unknownVoters };
}
