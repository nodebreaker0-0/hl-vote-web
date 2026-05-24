'use client';

// T031 — Constitution VIII: no default, mainnet disabled in testnet builds.
// Visual cues are slashing-safety signals (CHARTER §6): testnet=yellow,
// mainnet=red. Do not soften them.

import clsx from 'clsx';
import type { Network } from '@/lib/signing';
import { MAINNET_ENABLED } from '@/lib/env';

export interface NetworkSelectorProps {
  value: Network | null;
  onChange: (n: Network) => void;
}

export function NetworkSelector({ value, onChange }: NetworkSelectorProps) {
  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">
        Network
      </legend>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onChange('testnet')}
          aria-pressed={value === 'testnet'}
          className={clsx(
            'rounded px-4 py-2 text-sm font-medium transition-colors',
            value === 'testnet'
              ? 'bg-testnet/20 text-testnet ring-2 ring-testnet'
              : 'bg-hl-bg text-hl-subtle hover:text-hl-text hover:bg-hl-border',
          )}
        >
          Testnet
        </button>
        <button
          type="button"
          onClick={() => MAINNET_ENABLED && onChange('mainnet')}
          aria-pressed={value === 'mainnet'}
          disabled={!MAINNET_ENABLED}
          title={MAINNET_ENABLED ? '' : 'Build with NEXT_PUBLIC_MAINNET_ENABLED=true to enable'}
          className={clsx(
            'rounded px-4 py-2 text-sm font-medium transition-colors',
            !MAINNET_ENABLED && 'cursor-not-allowed opacity-40',
            MAINNET_ENABLED && value === 'mainnet'
              ? 'bg-mainnet/20 text-mainnet ring-2 ring-mainnet'
              : MAINNET_ENABLED
                ? 'bg-hl-bg text-hl-subtle hover:text-hl-text hover:bg-hl-border'
                : 'bg-hl-bg text-hl-subtle',
          )}
        >
          Mainnet
          {!MAINNET_ENABLED && (
            <span className="ml-2 text-[10px] uppercase tracking-wider">disabled</span>
          )}
        </button>
      </div>
      {value === null && (
        <p className="mt-2 text-xs text-hl-subtle">Choose a network to continue.</p>
      )}
      {value === 'mainnet' && (
        <p className="mt-2 text-xs text-mainnet">
          Mainnet — signatures here move real value. Double-check the action.
        </p>
      )}
    </fieldset>
  );
}
