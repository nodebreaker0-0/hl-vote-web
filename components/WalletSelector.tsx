'use client';

// T032 — Tier 0 = MetaMask only. Ledger is added in Tier 1 (T050+).

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  connectMetaMask,
  hasMetaMask,
  WalletNotFoundError,
  WalletRejectedError,
} from '@/lib/wallet/metamask';

export type WalletKind = 'metamask';

export interface WalletState {
  kind: WalletKind;
  account: `0x${string}`;
}

export interface WalletSelectorProps {
  value: WalletState | null;
  onChange: (w: WalletState | null) => void;
}

export function WalletSelector({ value, onChange }: WalletSelectorProps) {
  const [mounted, setMounted] = useState(false);
  const [available, setAvailable] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setAvailable(hasMetaMask());
  }, []);

  const connect = async () => {
    setErr(null);
    try {
      const account = await connectMetaMask();
      onChange({ kind: 'metamask', account });
    } catch (e) {
      if (e instanceof WalletNotFoundError) setErr('MetaMask not detected. Install the extension.');
      else if (e instanceof WalletRejectedError) setErr('Connect rejected.');
      else setErr((e as Error).message);
    }
  };

  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">Wallet</legend>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={connect}
          disabled={!mounted || !available || value?.kind === 'metamask'}
          className={clsx(
            'rounded px-4 py-2 text-sm font-medium transition-colors',
            value?.kind === 'metamask'
              ? 'bg-hl-mint/20 text-hl-mint ring-2 ring-hl-mint'
              : available
                ? 'bg-hl-bg text-hl-text hover:bg-hl-border'
                : 'cursor-not-allowed bg-hl-bg text-hl-subtle opacity-40',
          )}
        >
          {value?.kind === 'metamask' ? 'MetaMask connected' : 'Connect MetaMask'}
        </button>

        <button
          type="button"
          disabled
          title="Ledger (WebHID) — Tier 1 (T050+)"
          className="cursor-not-allowed rounded bg-hl-bg px-4 py-2 text-sm text-hl-subtle opacity-40"
        >
          Ledger
          <span className="ml-2 text-[10px] uppercase tracking-wider">tier 1</span>
        </button>
      </div>

      {value && (
        <p className="mt-3 text-xs text-hl-subtle">
          account: <code className="font-mono text-hl-text">{value.account}</code>
        </p>
      )}

      {mounted && !available && (
        <p className="mt-2 text-xs text-mainnet">MetaMask extension not detected in this browser.</p>
      )}
      {err && <p className="mt-2 text-xs text-mainnet">{err}</p>}
    </fieldset>
  );
}
