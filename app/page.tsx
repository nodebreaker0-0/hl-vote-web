'use client';

// T035 — main page. Orchestrates the state machine described in contracts/ui.md.

import { useCallback, useMemo, useState } from 'react';
import { NetworkSelector } from '@/components/NetworkSelector';
import { ActionPasteBox } from '@/components/ActionPasteBox';
import { ActionPreview } from '@/components/ActionPreview';
import { WalletSelector, type WalletState } from '@/components/WalletSelector';
import { ResponseViewer } from '@/components/ResponseViewer';
import { DedupModal } from '@/components/DedupModal';
import {
  actionHash,
  l1Payload,
  phantomAgent,
  submitExchange,
  SubmitHttpError,
  SubmitNetworkError,
  type Network,
  type ValidatorL1VoteAction,
} from '@/lib/signing';
import { signTypedDataMetaMask, WalletRejectedError } from '@/lib/wallet/metamask';
import {
  actionFingerprint,
  getEntry,
  recordEntry,
  storageStatus,
  type HistoryEntry,
} from '@/lib/history';
import type { ParseResult } from '@/lib/parseAction';
import { BUILD_TIME } from '@/lib/env';

type ResponseState =
  | { kind: 'idle' }
  | { kind: 'pending'; phase: 'signing' | 'submitting' }
  | { kind: 'success'; response: unknown }
  | { kind: 'error'; error: string };

export default function HomePage() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [resp, setResp] = useState<ResponseState>({ kind: 'idle' });
  const [dedupOverride, setDedupOverride] = useState<string | null>(null); // fingerprint user OK'd
  const [pendingDedup, setPendingDedup] = useState<HistoryEntry | null>(null);

  const action: ValidatorL1VoteAction | null = parsed?.ok ? parsed.action : null;
  const storageWarn = useMemo(() => storageStatus(), []);

  const canSign = network !== null && action !== null && wallet !== null && resp.kind !== 'pending';

  const doSubmit = useCallback(
    async (a: ValidatorL1VoteAction, n: Network, w: WalletState) => {
      // Re-compute everything at submit time so the nonce is fresh.
      const nonce = BigInt(Date.now());
      const isMainnet = n === 'mainnet';
      const ah = actionHash(a, nonce, null, null);
      const pa = phantomAgent(ah, isMainnet);
      const typed = l1Payload(pa);

      setResp({ kind: 'pending', phase: 'signing' });
      let signature;
      try {
        signature = await signTypedDataMetaMask(w.account, typed);
      } catch (e) {
        if (e instanceof WalletRejectedError) {
          setResp({ kind: 'error', error: 'User rejected the signature.' });
          return;
        }
        setResp({ kind: 'error', error: (e as Error).message });
        return;
      }

      setResp({ kind: 'pending', phase: 'submitting' });
      let response: unknown;
      try {
        response = await submitExchange({ network: n, action: a, nonce, signature });
      } catch (e) {
        if (e instanceof SubmitNetworkError) {
          setResp({ kind: 'error', error: `Network error: ${e.message}` });
        } else if (e instanceof SubmitHttpError) {
          setResp({ kind: 'error', error: `HTTP ${e.status}: ${e.body}` });
        } else {
          setResp({ kind: 'error', error: (e as Error).message });
        }
        return;
      }

      setResp({ kind: 'success', response });

      // record dedup entry
      const fp = actionFingerprint(a);
      const entry: HistoryEntry = {
        key: fp,
        nonce: nonce.toString(),
        network: n,
        sentAt: new Date().toISOString(),
        response,
        actionPreview: JSON.stringify(a).slice(0, 120),
      };
      recordEntry(entry);
    },
    [],
  );

  const onSign = useCallback(() => {
    if (!action || !network || !wallet) return;
    const fp = actionFingerprint(action);
    if (dedupOverride !== fp) {
      const prior = getEntry(fp);
      if (prior) {
        setPendingDedup(prior);
        return;
      }
    }
    void doSubmit(action, network, wallet);
  }, [action, network, wallet, dedupOverride, doSubmit]);

  const onDedupConfirm = useCallback(() => {
    if (!pendingDedup || !action || !network || !wallet) return;
    setDedupOverride(pendingDedup.key);
    setPendingDedup(null);
    void doSubmit(action, network, wallet);
  }, [pendingDedup, action, network, wallet, doSubmit]);

  return (
    <main className="space-y-5">
      <header className="border-b border-hl-border pb-4">
        <h1 className="text-2xl font-semibold text-hl-mint">hl-vote-web</h1>
        <p className="mt-1 text-sm text-hl-subtle">
          Hyperliquid <code className="mono text-hl-text">validatorL1Vote</code> signer — outcome,
          delisting, any inner shape. Paste &middot; preview &middot; sign &middot; submit. No
          backend.
        </p>
      </header>

      {storageWarn && (
        <div className="rounded-md border border-mainnet bg-mainnet/10 p-3 text-sm text-mainnet">
          {storageWarn}. Duplicate-send protection is OFF — proceed with caution.
        </div>
      )}

      <NetworkSelector value={network} onChange={setNetwork} />

      <ActionPasteBox onResult={setParsed} />

      {action && network && (
        <ActionPreview action={action} network={network} />
      )}

      <WalletSelector value={wallet} onChange={setWallet} />

      <div className="rounded-md border border-hl-border bg-hl-surface p-4">
        <button
          type="button"
          disabled={!canSign}
          onClick={onSign}
          className="w-full rounded bg-hl-mint px-4 py-3 text-sm font-semibold text-hl-bg transition-opacity hover:bg-hl-mint-dim disabled:cursor-not-allowed disabled:opacity-40"
        >
          {resp.kind === 'pending' && resp.phase === 'signing' && 'Waiting for signature…'}
          {resp.kind === 'pending' && resp.phase === 'submitting' && 'Submitting…'}
          {resp.kind !== 'pending' && 'Sign + Submit'}
        </button>
        {!canSign && resp.kind !== 'pending' && (
          <p className="mt-2 text-center text-xs text-hl-subtle">
            {network === null && 'Choose a network. '}
            {action === null && 'Paste a valid validatorL1Vote action. '}
            {wallet === null && 'Connect a wallet. '}
          </p>
        )}
      </div>

      <ResponseViewer state={resp} />

      {pendingDedup && (
        <DedupModal
          entry={pendingDedup}
          onCancel={() => setPendingDedup(null)}
          onConfirm={onDedupConfirm}
        />
      )}

      <footer className="border-t border-hl-border pt-3 text-[10px] text-hl-subtle">
        build {BUILD_TIME} &middot; static SPA &middot; no analytics &middot; no backend
      </footer>
    </main>
  );
}
