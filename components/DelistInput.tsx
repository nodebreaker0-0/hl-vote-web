'use client';

// Friendly form for the most-common variant: delisting a single ticker.
// Constructs `{"type":"validatorL1Vote","D":"<ticker>"}` deterministically.

import { useState, useEffect, useId } from 'react';
import type { ParseResult } from '@/lib/parseAction';
import { parseAction } from '@/lib/parseAction';

export interface DelistInputProps {
  onResult: (r: ParseResult, raw: string) => void;
}

export function DelistInput({ onResult }: DelistInputProps) {
  const [ticker, setTicker] = useState('');
  const inputId = useId();

  useEffect(() => {
    const trimmed = ticker.trim();
    if (trimmed.length === 0) {
      // mimic the "empty" state that ActionPasteBox sends so downstream
      // ActionPreview unmounts cleanly.
      onResult({ ok: false, error: 'Empty input.', checks: parseAction('').checks }, '');
      return;
    }
    // We deliberately re-use the same parseAction path so all guards
    // (credential pattern, JSON validity) apply identically.
    const raw = JSON.stringify({ type: 'validatorL1Vote', D: trimmed });
    onResult(parseAction(raw), raw);
  }, [ticker, onResult]);

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs text-hl-subtle">
        Ticker / market id
      </label>
      <input
        id={inputId}
        type="text"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        placeholder="e.g. BTC"
        className="mt-1 w-full rounded bg-hl-bg p-3 font-mono text-base text-hl-text ring-1 ring-hl-border focus:outline-none focus:ring-hl-mint"
      />
      <p className="mt-2 text-[11px] text-hl-subtle">
        Will sign:{' '}
        <code className="font-mono text-hl-text">
          {`{"type":"validatorL1Vote","D":"${ticker.trim() || '<ticker>'}"}`}
        </code>
      </p>
    </div>
  );
}
