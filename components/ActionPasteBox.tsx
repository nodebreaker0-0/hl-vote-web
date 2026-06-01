'use client';

// T033 — paste box + JSON parse + slashing-safety guards.
// Constitution II: input goes into `lib/signing/serialize` *as-is*. No
// pretty-print/reorder/normalization. The textarea shows what was pasted.

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { parseAction, type ParseResult } from '@/lib/parseAction';

export interface ActionPasteBoxProps {
  /** Controlled value — owned by the parent so "Vote on this" can fill it
   *  without DOM hacks (which previously mis-targeted the Slack-match box). */
  value: string;
  onChange: (next: string) => void;
  onResult: (r: ParseResult, raw: string) => void;
}

export function ActionPasteBox({ value, onChange, onResult }: ActionPasteBoxProps) {
  const [result, setResult] = useState<ParseResult | null>(null);

  // Parse whenever the value changes — typed by the user OR injected by the
  // parent (pin). onResult / onChange are stable (memoised in the parent).
  useEffect(() => {
    const r = parseAction(value);
    setResult(r);
    onResult(r, value);
    // Constitution IV: if credentials detected, blank the box to limit exposure.
    if (!r.ok && r.credentialDetected && value !== '') onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        rows={8}
        placeholder={
          'Paste the validatorL1Vote action exactly as posted by validator-publisher in Slack.\n\n' +
          'Example (delisting): {"type":"validatorL1Vote","D":"<id>"}\n' +
          'Example (outcome):   {"type":"validatorL1Vote","O":{...}}'
        }
        className={clsx(
          'w-full resize-y rounded bg-hl-bg p-3 font-mono text-sm leading-relaxed text-hl-text',
          'placeholder:text-hl-subtle/60 focus:outline-none focus:ring-2',
          result?.ok
            ? 'ring-1 ring-hl-mint-dim focus:ring-hl-mint'
            : result && !result.ok && value.trim().length > 0
              ? 'ring-2 ring-mainnet focus:ring-mainnet'
              : 'ring-1 ring-hl-border focus:ring-hl-mint',
        )}
      />

      {result && !result.ok && value.trim().length > 0 && (
        <div
          className={clsx(
            'mt-3 rounded p-3 text-sm',
            result.credentialDetected
              ? 'bg-mainnet/20 text-mainnet'
              : 'bg-mainnet/10 text-mainnet/90',
          )}
          role="alert"
        >
          {result.credentialDetected && (
            <p className="mb-1 font-semibold uppercase tracking-wider">
              Credential pattern detected
            </p>
          )}
          <p>{result.error}</p>
        </div>
      )}
    </div>
  );
}
