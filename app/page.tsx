'use client';

// T035 — main page. State machine described in contracts/ui.md.
// Single wallet path: MetaMask (with optional Ledger-import account inside it).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { NetworkSelector } from '@/components/NetworkSelector';
import { ActionInput } from '@/components/ActionInput';
import { ActionSummary } from '@/components/ActionSummary';
import { ActionPreview } from '@/components/ActionPreview';
import { SanityChecklist } from '@/components/SanityChecklist';
import { sanityChecklist } from '@/lib/decode';
import { WalletSelector, type WalletState } from '@/components/WalletSelector';
import { ResponseViewer } from '@/components/ResponseViewer';
import { DedupModal } from '@/components/DedupModal';
import { VoteStatus } from '@/components/VoteStatus';
import { MultiSigPanel } from '@/components/MultiSigPanel';
import {
  actionHash,
  l1Payload,
  phantomAgent,
  submitExchange,
  SubmitHttpError,
  SubmitNetworkError,
  type Network,
  type SignatureRSV,
  type ValidatorL1VoteAction,
} from '@/lib/signing';
import {
  getActiveChainId,
  signTypedDataMetaMask,
  WalletChainError,
  WalletRejectedError,
} from '@/lib/wallet/metamask';
import {
  actionFingerprint,
  getEntry,
  recordEntry,
  storageStatus,
  type HistoryEntry,
} from '@/lib/history';
import type { ParseResult } from '@/lib/parseAction';
import type { InputMode } from '@/components/InputModeSelector';
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
  const [dedupOverride, setDedupOverride] = useState<string | null>(null);
  const [pendingDedup, setPendingDedup] = useState<HistoryEntry | null>(null);
  const [sanityOk, setSanityOk] = useState(false);

  // When the user clicks "Vote on this" in VoteStatus we push the raw JSON
  // into ActionInput's custom mode via a remount-keyed prop.
  const [pinned, setPinned] = useState<{ mode: InputMode; raw: string; key: number } | null>(null);

  const action: ValidatorL1VoteAction | null = parsed?.ok ? parsed.action : null;
  const actionFp = action ? actionFingerprint(action) : '';
  // Reset the sanity gate whenever the pasted action changes.
  useEffect(() => {
    setSanityOk(false);
  }, [actionFp]);

  // Run storage probe only after mount (avoid SSR hydration mismatch).
  const [storageWarn, setStorageWarn] = useState<string | null>(null);
  useEffect(() => {
    setStorageWarn(storageStatus());
  }, []);

  // Track wallet's active chainId so ActionPreview shows hashes that actually
  // match what we'll sign (we sign with whatever chain MetaMask is on).
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  useEffect(() => {
    if (!wallet) {
      setWalletChainId(null);
      return;
    }
    let cancelled = false;
    const update = () => {
      getActiveChainId()
        .then((c) => {
          if (!cancelled) setWalletChainId(c);
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
  }, [wallet]);

  const canSign =
    network !== null && action !== null && wallet !== null && resp.kind !== 'pending' && sanityOk;

  const doSubmit = useCallback(
    async (a: ValidatorL1VoteAction, n: Network, w: WalletState) => {
      const nonce = BigInt(Date.now());
      const isMainnet = n === 'mainnet';
      const ah = actionHash(a, nonce, null, null);
      const pa = phantomAgent(ah, isMainnet);
      const typed = l1Payload(pa);

      setResp({ kind: 'pending', phase: 'signing' });
      let signature: SignatureRSV;
      try {
        signature = await signTypedDataMetaMask(w.account, typed);
      } catch (e) {
        if (e instanceof WalletRejectedError) {
          setResp({ kind: 'error', error: e.message });
          return;
        }
        if (e instanceof WalletChainError) {
          setResp({
            kind: 'error',
            error:
              `${e.message}\n\nHL signing forces chainId=1337. Your MetaMask must be on this ` +
              `chain before signing. If auto-add failed, add it manually: ` +
              `Networks → Add → chainId 1337, name "EIP712signer", any RPC, currency TMP.`,
          });
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

  // "Vote on this" → switch to custom mode + push raw JSON.
  const onPickAction = useCallback((raw: string) => {
    setPinned({ mode: 'custom', raw, key: Date.now() });
    // Push the raw JSON straight into ActionInput's child by remount + initial value.
    // We do it via the remount key; ActionInput will read the raw on mount in custom mode.
    // The simpler implementation: render ActionInput with a controlled initial textarea value.
    // To keep ActionPasteBox simple we just rely on the user to ⌘V again,
    // but to make the click meaningful we also pre-fill via the textarea below.
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>('textarea');
      if (!ta) return;
      // Use the native setter so React's onChange listener fires.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      setter?.set?.call(ta, raw);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

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

      <ActionInput onResult={setParsed} pinned={pinned ?? undefined} />

      {action && network && <ActionSummary action={action} network={network} />}

      {action && network && (
        <ActionPreview
          action={action}
          network={network}
          walletChainId={walletChainId ?? undefined}
        />
      )}

      <WalletSelector value={wallet} onChange={setWallet} />

      {action && network && (
        <SanityChecklist
          key={actionFp}
          items={sanityChecklist(action as unknown as Record<string, unknown>)}
          onChange={setSanityOk}
        />
      )}

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
            {action !== null && network !== null && wallet !== null && !sanityOk &&
              'Confirm the sanity checklist. '}
          </p>
        )}
      </div>

      <ResponseViewer state={resp} />

      <VoteStatus
        network={network}
        selfSigner={wallet?.account ?? null}
        onPickAction={onPickAction}
      />

      <MultiSigPanel action={action} network={network} />

      {pendingDedup && (
        <DedupModal
          entry={pendingDedup}
          onCancel={() => setPendingDedup(null)}
          onConfirm={onDedupConfirm}
        />
      )}

      <footer className="flex items-baseline justify-between border-t border-hl-border pt-3 text-[10px] text-hl-subtle">
        <span>build {BUILD_TIME} &middot; static SPA &middot; no analytics &middot; no backend</span>
        <Link href="/history" className="hover:text-hl-mint">
          history →
        </Link>
      </footer>
    </main>
  );
}
