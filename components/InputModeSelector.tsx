'use client';

// Two input modes:
//   - delist: simple ticker form (builds {"D": "<id>"} for us)
//   - custom: paste raw validatorL1Vote JSON (outcome and anything else)

import clsx from 'clsx';

export type InputMode = 'delist' | 'custom';

export interface InputModeSelectorProps {
  value: InputMode;
  onChange: (m: InputMode) => void;
}

export function InputModeSelector({ value, onChange }: InputModeSelectorProps) {
  return (
    <div className="flex gap-2">
      {(['delist', 'custom'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={clsx(
            'rounded px-3 py-1.5 text-xs font-medium transition-colors',
            value === m
              ? 'bg-hl-mint/20 text-hl-mint ring-1 ring-hl-mint'
              : 'bg-hl-bg text-hl-subtle hover:bg-hl-border hover:text-hl-text',
          )}
        >
          {m === 'delist' ? 'Delisting (ticker)' : 'Custom (JSON paste)'}
        </button>
      ))}
    </div>
  );
}
