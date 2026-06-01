'use client';

// G-1 — deterministic human-readable decode of the pasted action, shown ABOVE
// the byte/hash preview so the operator can sanity-check WHAT they sign. Names
// are resolved from outcomeMeta (not AI). Display-only: never touches the action
// or its msgpack serialization (Constitution II).

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { fetchOutcomeMeta, type OutcomeMeta } from '@/lib/api';
import { cacheOutcomes, getCachedOutcomes } from '@/lib/outcomeMetaCache';
import { decodeAction } from '@/lib/decode';
import type { Network, ValidatorL1VoteAction } from '@/lib/signing';

export interface ActionSummaryProps {
  action: ValidatorL1VoteAction;
  network: Network;
}

export function ActionSummary({ action, network }: ActionSummaryProps) {
  const [meta, setMeta] = useState<OutcomeMeta | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setMetaErr(null);
    fetchOutcomeMeta(network)
      .then((m) => {
        cacheOutcomes(m.outcomes ?? []); // keep names resolvable after HF drops settled outcomes
        if (!cancelled) setMeta(m);
      })
      .catch((e) => {
        if (!cancelled) setMetaErr((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [network]);

  // Merge live outcomeMeta with the local cache so a settle vote still resolves
  // a name after HF drops the outcome from the live response. Uncached → decode
  // shows "NOT FOUND" (no DB; intentional).
  const effectiveMeta = useMemo<OutcomeMeta | null>(() => {
    const cached = getCachedOutcomes();
    if (!meta && cached.length === 0) return null;
    const live = meta?.outcomes ?? [];
    const liveIds = new Set(live.map((o) => o.outcome));
    return {
      outcomes: [...live, ...cached.filter((o) => !liveIds.has(o.outcome))],
      questions: meta?.questions ?? [],
    };
  }, [meta]);

  const decoded = decodeAction(action as unknown as Record<string, unknown>, effectiveMeta);

  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">
        Human summary (verify before signing)
      </legend>

      <div className="mb-2 flex items-baseline gap-2">
        <span className="shrink-0 rounded bg-hl-mint/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-hl-mint">
          {decoded.variant}
        </span>
        <span className="truncate text-sm text-hl-text" title={decoded.title}>
          {decoded.title}
        </span>
      </div>

      {decoded.warning && (
        <div className="mb-2 rounded border border-mainnet bg-mainnet/10 p-2 text-[11px] text-mainnet">
          {decoded.warning}
        </div>
      )}

      <dl className="space-y-1">
        {decoded.lines.map((ln, i) => (
          <div
            key={i}
            className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-3"
          >
            <dt className="text-xs uppercase tracking-wider text-hl-subtle">{ln.label}</dt>
            <dd
              className={clsx(
                'max-h-32 overflow-y-auto break-words text-xs leading-snug',
                ln.emphasis ? 'text-hl-text' : 'text-hl-subtle',
              )}
            >
              {ln.value || '—'}
            </dd>
          </div>
        ))}
      </dl>

      {decoded.options && decoded.options.length > 0 && (
        <div className="mt-3 rounded border border-hl-border bg-hl-bg p-2">
          <div className="mb-1 text-[11px] text-hl-subtle">
            Options <strong className="text-hl-text">({decoded.options.length})</strong> — verify
            every option before signing
          </div>
          <ol className="max-h-60 list-decimal space-y-1 overflow-y-auto pl-5">
            {decoded.options.map((o, i) => (
              <li key={i} className="text-[11px] text-hl-text">
                <span className="font-medium">{o.name}</span>
                {o.description && (
                  <span className="block text-hl-subtle">{o.description}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {decoded.multiOutcome && (
        <div className="mt-3 rounded border border-hl-border bg-hl-bg p-2">
          <div className="mb-1 text-[11px] text-hl-subtle">
            Multi-outcome question{' '}
            <span className="text-hl-text">#{decoded.multiOutcome.questionId}</span> —{' '}
            <strong className="text-hl-text">
              {decoded.multiOutcome.settledCount}/{decoded.multiOutcome.namedTotal}
            </strong>{' '}
            sides settled so far (piecemeal)
          </div>
          <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-[11px]">
            <tbody>
              {decoded.multiOutcome.rows.map((r) => (
                <tr
                  key={r.outcome}
                  className={clsx(
                    'border-t border-hl-border/50',
                    r.isTarget && 'bg-hl-mint/10',
                  )}
                >
                  <td className="py-1 pr-2 align-top">
                    {r.isTarget ? (
                      <span className="rounded bg-hl-mint px-1 text-[9px] font-semibold uppercase text-hl-bg">
                        this vote
                      </span>
                    ) : r.settled ? (
                      <span className="text-hl-subtle">settled</span>
                    ) : (
                      <span className="text-hl-subtle/60">open</span>
                    )}
                  </td>
                  <td className="py-1 pr-2 align-top text-hl-text">
                    {r.name}
                    {r.isFallback && (
                      <span className="ml-1 text-[9px] uppercase text-hl-subtle">fallback</span>
                    )}
                  </td>
                  <td className="mono py-1 text-right align-top text-hl-subtle">#{r.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="mt-2 text-[10px] text-hl-subtle">
        {metaErr
          ? `live outcomeMeta error — using local cache where available (${metaErr})`
          : 'Resolved from outcomeMeta + local cache (deterministic, not AI). Settled/uncached ids show as not found.'}
      </div>
    </fieldset>
  );
}
