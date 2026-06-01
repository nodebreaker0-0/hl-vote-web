'use client';

// Wraps the two input modes (Delisting ticker form / Custom JSON paste)
// behind one toggle + emits a single ParseResult to the parent.

import { useCallback, useEffect, useState } from 'react';
import { InputModeSelector, type InputMode } from '@/components/InputModeSelector';
import { DelistInput } from '@/components/DelistInput';
import { ActionPasteBox } from '@/components/ActionPasteBox';
import { ValidationChecklist } from '@/components/ValidationChecklist';
import { PublisherMatch } from '@/components/PublisherMatch';
import { parseAction, type ParseResult } from '@/lib/parseAction';

export interface ActionInputProps {
  onResult: (r: ParseResult, raw: string) => void;
  /** If the parent wants to push an action into the input (e.g. "Vote on this"
   *  click from VoteStatus), it can swap mode to `custom` and feed JSON in. */
  pinned?: { mode: InputMode; raw: string; key: number };
}

export function ActionInput({ onResult, pinned }: ActionInputProps) {
  const [mode, setMode] = useState<InputMode>('delist');
  const [lastResult, setLastResult] = useState<ParseResult>(() => parseAction(''));

  // External "pin" — when VoteStatus injects an action ("Vote on this"), switch
  // to its mode ONCE (a new pin = new object identity). After that the user can
  // freely toggle modes again. We must NOT permanently force pinned.mode, or the
  // toggle gets stuck (bug: Custom → Vote on this → Delisting wouldn't switch).
  useEffect(() => {
    if (pinned) setMode(pinned.mode);
  }, [pinned]);

  const effectiveMode = mode;

  const handle = useCallback(
    (r: ParseResult, raw: string) => {
      setLastResult(r);
      onResult(r, raw);
    },
    [onResult],
  );

  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">
        Action input
      </legend>

      <div className="mb-3">
        <InputModeSelector value={effectiveMode} onChange={setMode} />
      </div>

      <div key={`mode-${effectiveMode}-${pinned?.key ?? 0}`}>
        {effectiveMode === 'delist' ? (
          <DelistInput onResult={handle} />
        ) : (
          <ActionPasteBox onResult={handle} />
        )}
      </div>

      <div className="mt-4 border-t border-hl-border pt-3">
        <div className="mb-2 text-xs uppercase tracking-wider text-hl-subtle">
          Validation
        </div>
        <ValidationChecklist checks={lastResult.checks} />
        {lastResult.ok && (
          <p className="mt-2 text-xs text-hl-mint">
            variant: <span className="text-hl-text">{lastResult.variant}</span>
            {lastResult.innerKey && (
              <>
                {' '}
                (inner key <code className="font-mono">{lastResult.innerKey}</code>)
              </>
            )}
          </p>
        )}
        <PublisherMatch action={lastResult.ok ? lastResult.action : null} />
      </div>
    </fieldset>
  );
}
