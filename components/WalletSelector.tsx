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
  disconnectWallet,
  getActiveChainId,
  hasMetaMask,
  subscribeAccounts,
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

function chainLabel(id: number): string {
  if (id === 999) return 'HyperEVM Mainnet (999)';
  if (id === 998) return 'HyperEVM Testnet (998)';
  if (id === 1337) return 'EIP712signer (1337)';
  return String(id);
}

export function WalletSelector({ value, onChange }: WalletSelectorProps) {
  const [mounted, setMounted] = useState(false);
  const [available, setAvailable] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setAvailable(hasMetaMask());
  }, []);

  // Poll chainId while connected (handles wallet's chain switches).
  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    const update = () => {
      getActiveChainId()
        .then((c) => {
          if (!cancelled) setChainId(c);
        })
        .catch(() => {
          /* ignore */
        });
    };
    update();
    const t = setInterval(update, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [value]);

  // Keep the connected account in sync with MetaMask. If the user disconnects
  // from the extension side (revoke → accounts empty), clear our state too.
  useEffect(() => {
    return subscribeAccounts((account) => {
      onChange(account ? { kind: 'metamask', account } : null);
    });
  }, [onChange]);

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

  const disconnect = async () => {
    setErr(null);
    await disconnectWallet();
    setChainId(null);
    onChange(null);
  };

  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">Wallet</legend>

      <div className="flex items-center gap-2">
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
        {value?.kind === 'metamask' && (
          <button
            type="button"
            onClick={() => void disconnect()}
            className="rounded border border-hl-border px-3 py-2 text-sm text-hl-subtle transition-colors hover:border-mainnet hover:text-mainnet"
          >
            Disconnect
          </button>
        )}
      </div>
      {value?.kind === 'metamask' && (
        <p className="mt-2 text-[11px] text-hl-subtle">
          To sign with a different account (e.g. a cosigner), click Disconnect, then Connect and pick
          the account in MetaMask.
        </p>
      )}

      {value && (
        <p className="mt-3 text-xs text-hl-subtle">
          account: <code className="font-mono text-hl-text">{value.account}</code>
          {chainId !== null && (
            <>
              {' '}
              &middot; active chain:{' '}
              <code className="font-mono text-hl-text">{chainLabel(chainId)}</code>
            </>
          )}
        </p>
      )}

      {mounted && !available && (
        <p className="mt-2 text-xs text-mainnet">MetaMask extension not detected in this browser.</p>
      )}
      {err && <p className="mt-2 text-xs text-mainnet">{err}</p>}

      <p className="mt-3 border-t border-hl-border pt-3 text-[11px] leading-relaxed text-hl-subtle">
        HL signing requires <code className="font-mono text-hl-text">chainId 1337</code> on the
        wire (verified: HF&apos;s recovery hardcodes 1337 for L1 actions). On first sign,
        MetaMask will prompt to add &amp; switch to a signer-only chain entry called{' '}
        <code className="font-mono text-hl-text">EIP712signer</code> (currency{' '}
        <code className="font-mono text-hl-text">TMP</code>). Subsequent signs are one popup.
        <br />
        <strong className="text-hl-text">Testnet</strong>: hot v-key imported into MetaMask.{' '}
        <strong className="text-hl-text">Mainnet</strong>: use a MetaMask account that&apos;s an
        imported Ledger (Connect hardware wallet → Ledger). The device displays the same hashes
        you see in the Preview — compare them before approving on device.
      </p>
    </fieldset>
  );
}
