// POST /info — HF info endpoint wrapper.
// /exchange is in lib/signing/submit.ts; /info is read-only state queries.
//
// Endpoints we use:
//   - { type: "validatorL1Votes" } → pending governance/outcome/delisting votes
//   - { type: "validatorSummaries" } → all validator metadata incl. signer→name

import type { Network, ValidatorL1VoteAction } from '@/lib/signing';

const MAINNET_INFO = 'https://api.hyperliquid.xyz/info';
const TESTNET_INFO = 'https://api.hyperliquid-testnet.xyz/info';

function infoUrl(n: Network): string {
  return n === 'mainnet' ? MAINNET_INFO : TESTNET_INFO;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postInfo<T = any>(n: Network, body: object): Promise<T> {
  const res = await fetch(infoUrl(n), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`info ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ---- validatorL1Votes ---------------------------------------------------

export interface ValidatorL1VotePending {
  expireTime: number;
  /** The bare action *without* the {type:"validatorL1Vote"} wrapper.
   *  i.e. just the inner shape — `{O: {...}}` or `{D: "BTC"}`. */
  action: Record<string, unknown>;
  /** Signer addresses that already voted on this pending action. */
  votes: `0x${string}`[];
  quorumReached: boolean;
}

export async function fetchValidatorL1Votes(n: Network): Promise<ValidatorL1VotePending[]> {
  return postInfo<ValidatorL1VotePending[]>(n, { type: 'validatorL1Votes' });
}

/** Reassemble a full `validatorL1Vote` action object from a pending row. */
export function pendingToAction(p: ValidatorL1VotePending): ValidatorL1VoteAction {
  return { type: 'validatorL1Vote', ...p.action };
}

// ---- validatorSummaries -------------------------------------------------

export interface ValidatorSummary {
  validator: `0x${string}`;
  signer: `0x${string}`;
  name: string;
  description: string;
  nRecentBlocks: number;
  stake: number;
  isJailed: boolean;
  unjailableAfter: number | null;
  isActive: boolean;
  commission: string;
  // stats: [[period, {uptimeFraction, predictedApr, nSamples}]]
  stats: unknown;
}

export async function fetchValidatorSummaries(n: Network): Promise<ValidatorSummary[]> {
  return postInfo<ValidatorSummary[]>(n, { type: 'validatorSummaries' });
}

// ---- outcomeMeta --------------------------------------------------------
// Deterministic lookup so the operator can resolve an outcome id → market name
// and side index → side name before signing (the biggest source of human error
// per validators; see docs/ENDPOINTS.md §1.3). Read-only.

export interface OutcomeSideSpec {
  name: string;
}

export interface OutcomeInfo {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: OutcomeSideSpec[];
  quoteToken: string;
}

export interface QuestionInfo {
  question: number;
  name: string;
  description: string;
  fallbackOutcome?: number;
  namedOutcomes?: number[];
  settledNamedOutcomes?: number[];
}

export interface OutcomeMeta {
  outcomes: OutcomeInfo[];
  questions: QuestionInfo[];
}

export async function fetchOutcomeMeta(n: Network): Promise<OutcomeMeta> {
  return postInfo<OutcomeMeta>(n, { type: 'outcomeMeta' });
}

// ---- userToMultiSigSigners (G-2) ----------------------------------------
// Authorized signers + threshold of a multi-sig user. null = not a multisig user.

export interface MultiSigSigners {
  authorizedUsers: `0x${string}`[];
  threshold: number;
}

export async function fetchUserToMultiSigSigners(
  n: Network,
  user: string,
): Promise<MultiSigSigners | null> {
  return postInfo<MultiSigSigners | null>(n, { type: 'userToMultiSigSigners', user });
}
