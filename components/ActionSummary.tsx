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

      <div className="mt-2 text-[10px] text-hl-subtle">
        {metaErr
          ? `live outcomeMeta error — using local cache where available (${metaErr})`
          : 'Resolved from outcomeMeta + local cache (deterministic, not AI). Settled/uncached ids show as not found.'}
      </div>
    </fieldset>
  );
}
