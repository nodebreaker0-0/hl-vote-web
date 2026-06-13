'use client';

// Live `validatorL1Votes` panel — what is currently up for vote, who already
// voted, who hasn't (by name), and a 1-click button to bring a row into the
// signer above.

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  fetchValidatorL1Votes,
  fetchValidatorSummaries,
  fetchOutcomeMeta,
  pendingToAction,
  type ValidatorL1VotePending,
} from '@/lib/api';
import { cacheOutcomes, cacheQuestions } from '@/lib/outcomeMetaCache';
import {
  buildValidatorIndex,
  governanceForSignerAccount,
  type ValidatorIndex,
} from '@/lib/validators';
import type { Network } from '@/lib/signing';

const REFRESH_MS = 30_000;

// Quorum rules by action variant (Jeff, tentative — verified vs quorumReached
// 2026-06-01: mainnet DIFF 0/8, testnet DIFF 1/12):
//   - Outcome (`O`):  stake ≥ 20% OR count ≥ 50% of the active set (either suffices).
//   - Delisting / general governance (`D` / other): 2/3 by stake.
// "Active set" = validators with isActive === true — JAILED MEMBERS INCLUDED. A
// validator that voted and was later jailed still counts (its vote stands and it
// is still a set member; e.g. testnet "bob node" is active+jailed ~63%). Using
// non-jailed instead drops those votes and diverges from HF (testnet 9/12 DIFF).
const OUTCOME_STAKE_THRESHOLD = 0.2;
const OUTCOME_COUNT_THRESHOLD = 0.5;
const GOV_STAKE_THRESHOLD = 2 / 3;

export interface VoteStatusProps {
  network: Network | null;
  /** Highlight rows whose voters[] contains this signer (the user). */
  selfSigner?: `0x${string}` | null;
  /** Called when the user clicks "Vote on this" on a row. */
  onPickAction: (raw: string) => void;
}

function actionSummary(p: ValidatorL1VotePending): { variant: string; title: string } {
  const inner = p.action;
  if ('D' in inner) {
    return { variant: 'Delisting', title: String((inner as { D: unknown }).D) };
  }
  if ('O' in inner) {
    const o = (inner as { O: Record<string, unknown> }).O;
    const innerKey = Object.keys(o)[0] ?? 'unknown';
    const innerVal = innerKey ? (o[innerKey] as Record<string, unknown> | undefined) : undefined;
    let title = innerKey;
    if (innerVal && 'nameAndDescription' in innerVal) {
      const nad = innerVal['nameAndDescription'];
      if (Array.isArray(nad) && typeof nad[0] === 'string') title = nad[0];
    }
    return { variant: 'Outcome', title };
  }
  const k = Object.keys(inner)[0] ?? '?';
  return { variant: 'Unknown', title: k };
}

function fmtExpire(unixMs: number): string {
  const ms = unixMs - Date.now();
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

export function VoteStatus({ network, selfSigner, onPickAction }: VoteStatusProps) {
  const [pending, setPending] = useState<ValidatorL1VotePending[] | null>(null);
  const [idx, setIdx] = useState<ValidatorIndex | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!network) return;
    setBusy(true);
    setErr(null);
    try {
      const [votes, summaries] = await Promise.all([
        fetchValidatorL1Votes(network),
        fetchValidatorSummaries(network),
      ]);
      setPending(votes);
      setIdx(buildValidatorIndex(summaries));
      setLoadedAt(Date.now());
      // Continuously cache live outcome + question names (best-effort) so settle
      // votes can still be name-resolved after HF drops them from outcomeMeta.
      fetchOutcomeMeta(network)
        .then((m) => {
          cacheOutcomes(m.outcomes ?? []);
          cacheQuestions(m.questions ?? []);
        })
        .catch(() => {});
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [network]);

  useEffect(() => {
    if (!network) return;
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [network, load]);

  if (!network) return null;

  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">
        Pending votes ({network})
      </legend>

      <div className="mb-3 flex items-center gap-3 text-xs text-hl-subtle">
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="rounded bg-hl-bg px-2 py-1 text-hl-text ring-1 ring-hl-border hover:bg-hl-border disabled:opacity-40"
        >
          {busy ? 'refreshing…' : 'refresh'}
        </button>
        {loadedAt && (
          <span>
            loaded {new Date(loadedAt).toLocaleTimeString()} · auto-refresh{' '}
            {REFRESH_MS / 1000}s
          </span>
        )}
      </div>

      {err && <p className="text-xs text-mainnet">{err}</p>}

      {pending && pending.length === 0 && (
        <p className="text-sm text-hl-subtle">No pending votes.</p>
      )}

      {/* selfSigner is a *signer* hex (wallet account); votes[] holds *governance* addresses,
          so we resolve via validatorSummaries first. */}
      <ul className="space-y-3">
        {pending?.map((p, i) => {
          const summary = actionSummary(p);
          const selfGov = idx && selfSigner ? governanceForSignerAccount(idx, selfSigner) : null;
          const youVoted = !!selfGov && p.votes.some((a) => a.toLowerCase() === selfGov.toLowerCase());

          // Two sets (verified vs HF quorumReached 2026-06-01: mainnet 0/8, testnet 1/12):
          //   STAKE over isActive (jailed INCLUDED) — a vote stands even if the validator
          //     is later jailed (testnet "bob node" active+jailed ~63%).
          //   COUNT over current active = isActive && !isJailed (the live active
          //     validator count; avoids testnet's bloated isActive≈102).
          const isOutcome = 'O' in p.action;
          const stakeSet = idx ? idx.all.filter((v) => v.isActive) : []; // incl jailed
          const countSet = idx ? idx.active : []; // non-jailed = current active
          const voterSet = new Set(p.votes.map((a) => a.toLowerCase()));
          const votedStakeSide = stakeSet.filter((v) => voterSet.has(v.validator.toLowerCase()));
          const votedCountSide = countSet.filter((v) => voterSet.has(v.validator.toLowerCase()));
          const notVotedCount = countSet.filter((v) => !voterSet.has(v.validator.toLowerCase()));
          // Jailed members who voted: their stake counts but they're not in the headcount.
          const jailedVoters = votedStakeSide.filter((v) => v.isJailed).map((v) => v.name);
          const stakeGov = new Set(stakeSet.map((v) => v.validator.toLowerCase()));
          // Voters not in the active set at all (isActive === false: inactive / removed).
          const outsideVoters = p.votes
            .filter((a) => !stakeGov.has(a.toLowerCase()))
            .map((a) => {
              const v = idx?.byValidator.get(a.toLowerCase());
              return v ? `${v.name} (inactive)` : `${a.slice(0, 6)}…${a.slice(-4)} (unmapped)`;
            });
          const stakeTotal = stakeSet.reduce((s, v) => s + Number(v.stake), 0);
          const votedStake = votedStakeSide.reduce((s, v) => s + Number(v.stake), 0);
          const stakeRatio = stakeTotal > 0 ? votedStake / stakeTotal : 0;
          // Jailed validators that VOTED are folded into the count set (they voted
          // while in the set) — added to numerator AND denominator. Only the ones
          // who voted, not all jailed (that would bloat to isActive ≈ 102).
          const countNum = votedCountSide.length + jailedVoters.length;
          const countDen = countSet.length + jailedVoters.length;
          const countRatio = countDen > 0 ? countNum / countDen : 0;
          const stakeThreshold = isOutcome ? OUTCOME_STAKE_THRESHOLD : GOV_STAKE_THRESHOLD;
          const stakeReached = stakeRatio >= stakeThreshold;
          const countReached = countRatio >= OUTCOME_COUNT_THRESHOLD;
          // Outcome passes on stake OR count; delisting / governance needs 2/3 stake.
          const quorumPass = isOutcome ? stakeReached || countReached : stakeReached;
          return (
            <li
              key={i}
              className={clsx(
                'rounded border p-3',
                quorumPass
                  ? 'border-hl-mint bg-hl-mint/5'
                  : youVoted
                    ? 'border-hl-mint-dim bg-hl-bg'
                    : 'border-hl-border bg-hl-bg',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-hl-subtle">
                    {summary.variant}
                  </div>
                  <div className="truncate text-sm text-hl-text" title={summary.title}>
                    {summary.title}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] text-hl-subtle">
                  <div>expires in {fmtExpire(p.expireTime)}</div>
                  <div>
                    {countNum} / {countDen} voted{' '}
                    {quorumPass && (
                      <span className="ml-1 rounded bg-hl-mint/20 px-1 text-hl-mint">
                        quorum
                      </span>
                    )}
                    {youVoted && (
                      <span className="ml-1 rounded bg-hl-mint-dim/30 px-1 text-hl-mint-dim">
                        you ✓
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quorum pass criteria — variant-aware (outcome: stake 20% + count
                  50%; delisting/gov: 2/3 by stake). */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                <span
                  className={clsx(
                    'rounded px-1.5 py-0.5 tabular-nums',
                    stakeReached
                      ? 'bg-hl-mint/15 text-hl-mint'
                      : 'bg-hl-bg text-hl-subtle ring-1 ring-hl-border',
                  )}
                  title="voted stake / total active stake"
                >
                  STAKE {(stakeRatio * 100).toFixed(1)}% {stakeReached ? '✓' : '✗'}{' '}
                  <span className="opacity-60">
                    / {(stakeThreshold * 100).toFixed(0)}%{isOutcome ? '' : ' (2/3)'}
                  </span>
                </span>
                {isOutcome && (
                  <span
                    className={clsx(
                      'rounded px-1.5 py-0.5 tabular-nums',
                      countReached
                        ? 'bg-hl-mint/15 text-hl-mint'
                        : 'bg-hl-bg text-hl-subtle ring-1 ring-hl-border',
                    )}
                    title="voted count / active validator count (need ≥ 50%)"
                  >
                    COUNT {countNum}/{countDen} {countReached ? '✓' : '✗'}{' '}
                    <span className="opacity-60">≥ {OUTCOME_COUNT_THRESHOLD * 100}%</span>
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="text-hl-subtle">voted ({votedCountSide.length})</div>
                  <div className="mt-1 max-h-24 overflow-y-auto leading-snug text-hl-text">
                    {votedCountSide.length === 0 ? (
                      <span className="text-hl-subtle">—</span>
                    ) : (
                      votedCountSide.map((v) => v.name).join(', ')
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-hl-subtle">not voted ({notVotedCount.length})</div>
                  <div className="mt-1 max-h-24 overflow-y-auto leading-snug text-hl-text">
                    {notVotedCount.length === 0 ? (
                      <span className="text-hl-subtle">—</span>
                    ) : (
                      notVotedCount.map((v) => v.name).join(', ')
                    )}
                  </div>
                </div>
              </div>

              {jailedVoters.length > 0 && (
                <div className="mt-2 text-[10px] text-hl-subtle">
                  voted but currently jailed (counted): {jailedVoters.join(', ')}
                </div>
              )}
              {outsideVoters.length > 0 && (
                <div className="mt-2 text-[10px] text-hl-subtle">
                  voted but inactive (excluded): {outsideVoters.join(', ')}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onPickAction(JSON.stringify(pendingToAction(p)))}
                  disabled={youVoted}
                  className={clsx(
                    'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    youVoted
                      ? 'cursor-not-allowed bg-hl-bg text-hl-subtle opacity-40'
                      : 'bg-hl-mint/20 text-hl-mint ring-1 ring-hl-mint hover:bg-hl-mint/30',
                  )}
                  title={youVoted ? 'You already voted on this action' : 'Load into the signer above'}
                >
                  {youVoted ? 'Already voted' : 'Vote on this →'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
