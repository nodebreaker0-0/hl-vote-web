'use client';

// Live `validatorL1Votes` panel — what is currently up for vote, who already
// voted, who hasn't (by name), and a 1-click button to bring a row into the
// signer above.

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  fetchValidatorL1Votes,
  fetchValidatorSummaries,
  pendingToAction,
  type ValidatorL1VotePending,
} from '@/lib/api';
import {
  buildValidatorIndex,
  governanceForSignerAccount,
  splitVoters,
  type ValidatorIndex,
} from '@/lib/validators';
import type { Network } from '@/lib/signing';

const REFRESH_MS = 30_000;

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
          const split = idx
            ? splitVoters(idx, p.votes)
            : { voted: [], notVoted: [], unknownVoters: [] };
          const selfGov = idx && selfSigner ? governanceForSignerAccount(idx, selfSigner) : null;
          const youVoted = !!selfGov && p.votes.some((a) => a.toLowerCase() === selfGov.toLowerCase());
          return (
            <li
              key={i}
              className={clsx(
                'rounded border p-3',
                p.quorumReached
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
                    {p.votes.length} / {idx ? idx.active.length : '?'} voted{' '}
                    {p.quorumReached && (
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

              <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="text-hl-subtle">voted ({split.voted.length})</div>
                  <div className="mt-1 max-h-24 overflow-y-auto leading-snug text-hl-text">
                    {split.voted.length === 0 ? (
                      <span className="text-hl-subtle">—</span>
                    ) : (
                      split.voted.map((v) => v.name).join(', ')
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-hl-subtle">not voted ({split.notVoted.length})</div>
                  <div className="mt-1 max-h-24 overflow-y-auto leading-snug text-hl-text">
                    {split.notVoted.length === 0 ? (
                      <span className="text-hl-subtle">—</span>
                    ) : (
                      split.notVoted.map((v) => v.name).join(', ')
                    )}
                  </div>
                </div>
              </div>

              {split.unknownVoters.length > 0 && (
                <div className="mt-2 text-[10px] text-hl-subtle">
                  unknown voters (jailed / inactive): {split.unknownVoters.length}
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
