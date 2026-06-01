'use client';

// MS-040 (v1) — convert a NORMAL address into a multi-sig user (setup).
//
// This is the single-signature path: the address being converted signs the
// convertToMultiSigUser action itself (scheme B, user-signed). It does NOT
// apply to an address that is already a multi-sig — changing signers or
// converting back requires threshold cosigning (a multiSig-wrapped convert),
// which is a separate, golden-gated flow (not built here yet).
//
// Byte-exactness of the signed action is covered by tests/golden (ms-convert-*).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  convertToMultiSigUserAction,
  convertTypedData,
  submitUserSigned,
  SubmitHttpError,
  SubmitNetworkError,
  SIGNATURE_CHAIN_ID,
  type Network,
} from '@/lib/signing';
import {
  getActiveAccount,
  signUserSignedMetaMask,
  WalletChainError,
  WalletRejectedError,
} from '@/lib/wallet/metamask';
import { fetchUserToMultiSigSigners, type MultiSigSigners } from '@/lib/api';
import { isAddress } from '@/lib/multisigSession';
import { useActiveAccount } from './useActiveAccount';

interface Props {
  network: Network | null;
}

function errText(e: unknown): string {
  if (e instanceof WalletRejectedError || e instanceof WalletChainError) return e.message;
  if (e instanceof SubmitNetworkError) return `Network error: ${e.message}`;
  if (e instanceof SubmitHttpError) return `HTTP ${e.status}: ${e.body}`;
  return (e as Error).message ?? String(e);
}

export function ConvertPanel({ network }: Props) {
  const activeAccount = useActiveAccount();
  const [usersText, setUsersText] = useState('');
  const [threshold, setThreshold] = useState(1);
  const [existing, setExisting] = useState<MultiSigSigners | null | 'loading' | 'error'>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { kind: 'ok'; response: unknown } | { kind: 'err'; msg: string } | null
  >(null);

  // Is the connected address ALREADY a multi-sig? If so, setup doesn't apply.
  useEffect(() => {
    if (!activeAccount || !network) {
      setExisting(null);
      return;
    }
    let cancelled = false;
    setExisting('loading');
    fetchUserToMultiSigSigners(network, activeAccount)
      .then((s) => {
        if (!cancelled) setExisting(s);
      })
      .catch(() => {
        if (!cancelled) setExisting('error');
      });
    return () => {
      cancelled = true;
    };
  }, [activeAccount, network]);

  const alreadyMultisig =
    existing !== null && existing !== 'loading' && existing !== 'error' ? existing : null;

  const parsedUsers = useMemo<{ users: `0x${string}`[]; error: string | null }>(() => {
    const lines = usersText
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter(Boolean);
    const users: `0x${string}`[] = [];
    for (const l of lines) {
      if (!isAddress(l)) return { users: [], error: `Not a valid address: ${l}` };
      const lower = l.toLowerCase() as `0x${string}`;
      if (!users.includes(lower)) users.push(lower);
    }
    return { users, error: null };
  }, [usersText]);

  const users = parsedUsers.users;
  const thresholdValid = Number.isInteger(threshold) && threshold >= 1 && threshold <= users.length;
  const canSubmit =
    !!activeAccount &&
    !!network &&
    !alreadyMultisig &&
    users.length > 0 &&
    thresholdValid &&
    !parsedUsers.error &&
    !busy;

  // Preview the exact `signers` string that will be signed (sorted, json.dumps).
  const signersPreview = useMemo(() => {
    if (users.length === 0 || !thresholdValid) return null;
    return convertToMultiSigUserAction(users, threshold, 0n).signers;
  }, [users, threshold, thresholdValid]);

  const convert = useCallback(async () => {
    if (!network) return;
    setBusy(true);
    setResult(null);
    try {
      const signer = await getActiveAccount();
      if (!signer) throw new Error('Connect MetaMask first.');
      const isMainnet = network === 'mainnet';
      const nonce = BigInt(Date.now());
      const action = convertToMultiSigUserAction(users, threshold, nonce);
      const signature = await signUserSignedMetaMask(signer, convertTypedData(action, isMainnet));
      // sign_user_signed_action adds these to the submitted action (SDK parity).
      const wireAction = {
        ...action,
        signatureChainId: SIGNATURE_CHAIN_ID,
        hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
      };
      const response = await submitUserSigned({ network, action: wireAction, nonce, signature });
      setResult({ kind: 'ok', response });
    } catch (e) {
      setResult({ kind: 'err', msg: errText(e) });
    } finally {
      setBusy(false);
    }
  }, [network, users, threshold]);

  return (
    <details className="rounded-md border border-hl-border bg-hl-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-hl-mint">
        Convert to multi-sig <span className="text-hl-subtle">(setup)</span>
      </summary>
      <div className="space-y-4 border-t border-hl-border p-4">
        <p className="text-xs text-hl-subtle">
          Makes your <strong className="text-hl-text">connected address</strong> a multi-sig user.
          Authorized users must already be existing (deposited) users. Confirm on{' '}
          <strong className="text-hl-text">testnet</strong> first. Changing signers or converting
          back on an address that is <em>already</em> multi-sig needs threshold cosigning — not
          supported here yet.
        </p>

        {!activeAccount && (
          <p className="text-xs text-mainnet">Connect MetaMask on the main page first.</p>
        )}
        {activeAccount && (
          <p className="mono text-[11px] text-hl-subtle">
            converting: {activeAccount.toLowerCase()}
          </p>
        )}

        {alreadyMultisig && (
          <p className="rounded border border-mainnet bg-mainnet/10 p-2 text-xs text-mainnet">
            This address is already a multi-sig user ({alreadyMultisig.threshold} of{' '}
            {alreadyMultisig.authorizedUsers.length}). Setup is disabled — use the cosigned change
            flow (not built yet).
          </p>
        )}

        <label className="block space-y-1">
          <span className="text-xs text-hl-subtle">Authorized users (one address per line)</span>
          <textarea
            value={usersText}
            onChange={(e) => setUsersText(e.target.value)}
            rows={4}
            placeholder={'0x…\n0x…'}
            className="mono w-full rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text"
          />
        </label>
        {parsedUsers.error && <p className="text-xs text-mainnet">{parsedUsers.error}</p>}

        <label className="flex items-center gap-2">
          <span className="text-xs text-hl-subtle">Threshold</span>
          <input
            type="number"
            min={1}
            max={Math.max(users.length, 1)}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)}
            className="mono w-20 rounded border border-hl-border bg-hl-bg p-1 text-xs text-hl-text"
          />
          <span className="text-[11px] text-hl-subtle">of {users.length} authorized</span>
        </label>
        {users.length > 0 && !thresholdValid && (
          <p className="text-xs text-mainnet">Threshold must be between 1 and {users.length}.</p>
        )}

        {signersPreview && (
          <div className="space-y-1">
            <span className="text-xs text-hl-subtle">signers (signed verbatim)</span>
            <pre className="mono overflow-auto rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text">
              {signersPreview}
            </pre>
          </div>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void convert()}
          className="w-full rounded bg-hl-mint px-4 py-3 text-sm font-semibold text-hl-bg transition-opacity hover:bg-hl-mint-dim disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Working…' : 'Sign + convert to multi-sig'}
        </button>

        {result?.kind === 'ok' && (
          <pre className="mono max-h-48 overflow-auto rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text">
            {JSON.stringify(result.response, null, 2)}
          </pre>
        )}
        {result?.kind === 'err' && (
          <pre className="mono whitespace-pre-wrap rounded border border-mainnet bg-mainnet/10 p-2 text-xs text-mainnet">
            {result.msg}
          </pre>
        )}
      </div>
    </details>
  );
}
