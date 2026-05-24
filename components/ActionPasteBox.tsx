'use client';

// T033 — paste box + JSON parse + slashing-safety guards.
// Constitution II: input goes into `lib/signing/serialize` *as-is*. No
// pretty-print/reorder/normalization. The textarea shows what was pasted.

import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { parseAction, type ParseResult } from '@/lib/parseAction';

export interface ActionPasteBoxProps {
  onResult: (r: ParseResult, raw: string) => void;
}

export function ActionPasteBox({ onResult }: ActionPasteBoxProps) {
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);

  const run = useCallback(
    (next: string) => {
      setRaw(next);
      if (next.trim().length === 0) {
        setResult(null);
        return;
      }
      const r = parseAction(next);
      setResult(r);
      onResult(r, next);
      // Constitution IV: if credentials detected, blank the textarea to limit exposure.
      if (!r.ok && r.credentialDetected) {
        setRaw('');
      }
    },
    [onResult],
  );

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => run(e.target.value);
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Allow default paste; the change handler picks it up.
    void e;
  };

  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">
        Action JSON
      </legend>
      <textarea
        value={raw}
        onChange={onChange}
        onPaste={onPaste}
        spellCheck={false}
        autoComplete="off"
        rows={10}
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
            : result && !result.ok
              ? 'ring-2 ring-mainnet focus:ring-mainnet'
              : 'ring-1 ring-hl-border focus:ring-hl-mint',
        )}
      />

      {result && !result.ok && (
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

      {result?.ok && result.variant === 'unknown' && (
        <div className="mt-3 rounded bg-testnet/10 p-3 text-sm text-testnet" role="status">
          Unknown validatorL1Vote variant (inner key:{' '}
          <code className="font-mono">{result.innerKey}</code>). Proceed only if validator-publisher
          surfaced this exact JSON.
        </div>
      )}

      {result?.ok && result.variant !== 'unknown' && (
        <p className="mt-3 text-xs text-hl-subtle">
          variant:{' '}
          <span className="text-hl-text">
            {result.variant} (inner key <code className="font-mono">{result.innerKey}</code>)
          </span>
        </p>
      )}
    </fieldset>
  );
}
