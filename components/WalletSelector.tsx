'use client';

// T032 — MetaMask is the single wallet path.
// MetaMask itself supports importing a Ledger hardware wallet as one of its
// accounts (Connect hardware wallet → Ledger). When the user picks that
// account, eth_signTypedData_v4 is transparently routed to the device and
// the device displays the same domain/message hashes the SPA shows in the
// preview panel — operator verifies them visually before approving on device.
//
// This collapses what used to be two code paths (MetaMask hot key for testnet,
// direct WebHID for Ledger) into one. The ensureHLPhantomChain() helper in
// lib/wallet/metamask.ts handles the chainId 1337 switch for both.

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
      if (e instanceof WalletNotFoundError)
        setErr('MetaMask not detected. Install the extension.');
      else if (e instanceof WalletRejectedError) setErr('Connect rejected.');
      else setErr((e as Error).message);
    }
  };

  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">Wallet</legend>

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

      {value && (
        <p className="mt-3 text-xs text-hl-subtle">
          account: <code className="font-mono text-hl-text">{value.account}</code>
        </p>
      )}

      {mounted && !available && (
        <p className="mt-2 text-xs text-mainnet">MetaMask extension not detected in this browser.</p>
      )}
      {err && <p className="mt-2 text-xs text-mainnet">{err}</p>}

      <p className="mt-3 border-t border-hl-border pt-3 text-[11px] leading-relaxed text-hl-subtle">
        HL signing requires <code className="font-mono text-hl-text">chainId 1337</code>. On first
        sign, MetaMask will prompt to add &amp; switch to a signer-only chain entry called{' '}
        <code className="font-mono text-hl-text">EIP712signer</code> (currency{' '}
        <code className="font-mono text-hl-text">TMP</code>) — approve. The chain never receives
        RPC traffic; it exists only so MetaMask&apos;s chain-match check on EIP-712 typed-data
        passes.
        <br />
        <strong className="text-hl-text">Testnet</strong>: hot v-key imported into MetaMask.{' '}
        <strong className="text-hl-text">Mainnet</strong>: use a MetaMask account that&apos;s an
        imported Ledger (Connect hardware wallet → Ledger). The device displays the same hashes
        you see in the Preview — compare them before approving on device.
      </p>
    </fieldset>
  );
}
