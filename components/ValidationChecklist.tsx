'use client';

// Per-step ✅/❌/— display of the parser checks. Constitution II / IV directly:
// every line that turns ✅ here narrows what we will sign.

import clsx from 'clsx';
import type { ValidationChecks } from '@/lib/parseAction';

interface Item {
  key: keyof ValidationChecks;
  label: string;
  hint?: string;
  /** Failure (false) is fatal vs just a warning (variantKnown=false is fine). */
  warnOnly?: boolean;
}

const ITEMS: Item[] = [
  { key: 'notEmpty', label: 'Input not empty' },
  { key: 'noCredentials', label: 'No private key / mnemonic pattern' },
  { key: 'validJson', label: 'Valid JSON' },
  { key: 'topLevelObject', label: 'Top-level is an object' },
  { key: 'typeIsValidatorL1Vote', label: '`type` is `validatorL1Vote`' },
  { key: 'variantKnown', label: 'Known variant (`O` / `D`)', hint: 'unknown variant still signs but UI flags it', warnOnly: true },
];

export interface ValidationChecklistProps {
  checks: ValidationChecks;
}

export function ValidationChecklist({ checks }: ValidationChecklistProps) {
  return (
    <ul className="space-y-1 text-xs">
      {ITEMS.map(({ key, label, hint, warnOnly }) => {
        const v = checks[key];
        let icon: string;
        let color: string;
        if (v === true) {
          icon = '✓';
          color = 'text-hl-mint';
        } else if (v === false) {
          icon = warnOnly ? '!' : '✗';
          color = warnOnly ? 'text-testnet' : 'text-mainnet';
        } else {
          icon = '·';
          color = 'text-hl-subtle/50';
        }
        return (
          <li key={key} className="flex items-baseline gap-2">
            <span className={clsx('mono inline-block w-4 text-center font-bold', color)}>
              {icon}
            </span>
            <span className={clsx(v === null && 'text-hl-subtle/60', v !== null && 'text-hl-text')}>
              {label}
              {hint && <span className="ml-1 text-hl-subtle"> — {hint}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
