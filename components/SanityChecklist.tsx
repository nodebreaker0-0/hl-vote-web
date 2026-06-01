'use client';

// I-3 — required sanity-check gate before signing. The action is LLM-generated
// (Jeff), so the operator must explicitly confirm the error-prone fields before
// the Sign + Submit button enables. Remount (key = action fingerprint in the
// parent) resets the checks for a new action.

import { useState } from 'react';
import clsx from 'clsx';

export interface SanityChecklistProps {
  items: string[];
  /** Called with true only when every item is checked. */
  onChange: (allChecked: boolean) => void;
}

export function SanityChecklist({ items, onChange }: SanityChecklistProps) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      onChange(next.every(Boolean));
      return next;
    });
  };

  const allOk = checked.every(Boolean);

  return (
    <fieldset
      className={clsx(
        'rounded-md border bg-hl-surface p-4',
        allOk ? 'border-hl-mint' : 'border-hl-border',
      )}
    >
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">
        Sanity check (required before signing)
      </legend>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-hl-text">
              <input
                type="checkbox"
                checked={checked[i] ?? false}
                onChange={() => toggle(i)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-hl-mint"
              />
              <span>{it}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
