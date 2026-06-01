'use client';

// Cross-check: does the action we're about to sign byte-match the action the
// publisher posted in Slack? The signer pastes the publisher's Slack message
// here; we extract its JSON (same wrapper-stripping parser as the main input)
// and compare the *msgpack bytes* — the exact thing that gets signed. This makes
// the universal sanity item ("exactly as published, not hand-edited") verifiable
// rather than a blind checkbox. Display-only; never affects what is signed.

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { parseAction } from '@/lib/parseAction';
import { serialize, toHex, type ValidatorL1VoteAction } from '@/lib/signing';

type Status =
  | { kind: 'none' }
  | { kind: 'no-action' }
  | { kind: 'unparseable'; detail: string }
  | { kind: 'match' }
  | { kind: 'mismatch' };

export interface PublisherMatchProps {
  /** The currently-parsed action from the main input, or null if not valid yet. */
  action: ValidatorL1VoteAction | null;
}

function msgpackHex(a: ValidatorL1VoteAction): string {
  return toHex(serialize(a as unknown as Record<string, unknown>));
}

export function PublisherMatch({ action }: PublisherMatchProps) {
  const [slackText, setSlackText] = useState('');

  const status = useMemo<Status>(() => {
    if (!slackText.trim()) return { kind: 'none' };
    if (!action) return { kind: 'no-action' };
    const parsed = parseAction(slackText);
    if (!parsed.ok) return { kind: 'unparseable', detail: parsed.error };
    try {
      return msgpackHex(action) === msgpackHex(parsed.action)
        ? { kind: 'match' }
        : { kind: 'mismatch' };
    } catch (e) {
      return { kind: 'unparseable', detail: (e as Error).message };
    }
  }, [slackText, action]);

  const { icon, color } = ((): { icon: string; color: string } => {
    switch (status.kind) {
      case 'match':
        return { icon: '✓', color: 'text-hl-mint' };
      case 'mismatch':
        return { icon: '✗', color: 'text-mainnet' };
      case 'unparseable':
        return { icon: '!', color: 'text-testnet' };
      default:
        return { icon: '·', color: 'text-hl-subtle/50' };
    }
  })();

  const note: string = (() => {
    switch (status.kind) {
      case 'match':
        return 'Byte-identical to the publisher message — safe.';
      case 'mismatch':
        return 'DIFFERS from the pasted action — do NOT sign until resolved.';
      case 'unparseable':
        return `Could not find a valid action in the pasted message (${status.detail}).`;
      case 'no-action':
        return 'Enter a valid action above first.';
      default:
        return 'Paste the publisher’s Slack message to verify (optional but recommended).';
    }
  })();

  return (
    <div className="mt-2">
      <div className="flex items-baseline gap-2 text-xs">
        <span className={clsx('mono inline-block w-4 text-center font-bold', color)}>{icon}</span>
        <span className={clsx(status.kind === 'none' ? 'text-hl-subtle/60' : 'text-hl-text')}>
          Matches publisher’s Slack message
        </span>
      </div>
      <p
        className={clsx(
          'ml-6 text-[11px]',
          status.kind === 'mismatch' ? 'text-mainnet' : 'text-hl-subtle',
        )}
      >
        {note}
      </p>
      <textarea
        value={slackText}
        onChange={(e) => setSlackText(e.target.value)}
        rows={3}
        placeholder="Paste the publisher’s Slack message (the action JSON, with or without surrounding text)…"
        className="mono mt-1 w-full rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text"
      />
    </div>
  );
}
