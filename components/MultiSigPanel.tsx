'use client';

// G-2 — multi-sig validatorL1Vote signing UI (contract multisig-signing.md).
//
// Two roles, coordinated by copy-paste (no backend):
//   • Lead (outerSigner): pins multiSigUser + the inner action + a shared nonce,
//     hands a "request" blob to cosigners, collects their {r,s,v} until the
//     multisig threshold is met, then signs the SendMultiSig envelope (scheme B,
//     chainId 0x66eee) and submits.
//   • Cosigner: pastes the request, signs the inner action (scheme A, 1337),
//     hands their {r,s,v} back to the lead.
//
// The well-tested single-sig flow on the main page is untouched; this panel is
// purely additive. Byte-exact construction is golden-gated (tests/golden/
// multisig.test.ts); END-TO-END acceptance by HF must be confirmed on TESTNET
// before any mainnet use.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionSummary } from './ActionSummary';
import {
  buildMultiSigAction,
  cosignTypedData,
  multiSigEnvelope,
  sendMultiSigTypedData,
  submitMultiSig,
  SubmitHttpError,
  SubmitNetworkError,
  type Network,
} from '@/lib/signing';
import {
  getActiveAccount,
  signTypedDataMetaMask,
  signUserSignedMetaMask,
  WalletChainError,
  WalletRejectedError,
} from '@/lib/wallet/metamask';
import { useActiveAccount } from './useActiveAccount';
import {
  parseRequest,
  serializeRequest,
  parseCosigs,
  serializeCosig,
  isAddress,
  type MultiSigRequest,
  type CosignerSig,
} from '@/lib/multisigSession';
import { fetchUserToMultiSigSigners, type MultiSigSigners } from '@/lib/api';

type Role = 'lead' | 'cosigner';

interface Props {
  /** The validatorL1Vote action currently pasted/validated on the main page. */
  action: { type: 'validatorL1Vote'; [k: string]: unknown } | null;
  /** Verbatim pasted JSON for that action — embedded as-is in the request blob. */
  actionRaw?: string | null;
  network: Network | null;
}

function CopyBox({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-hl-subtle">{label}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded border border-hl-border px-2 py-0.5 text-[11px] text-hl-subtle hover:text-hl-mint"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="mono max-h-48 overflow-auto rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text">
        {text}
      </pre>
    </div>
  );
}

function errText(e: unknown): string {
  if (e instanceof WalletRejectedError || e instanceof WalletChainError) return e.message;
  if (e instanceof SubmitNetworkError) return `Network error: ${e.message}`;
  if (e instanceof SubmitHttpError) return `HTTP ${e.status}: ${e.body}`;
  return (e as Error).message ?? String(e);
}

export function MultiSigPanel({ action, actionRaw, network }: Props) {
  const [role, setRole] = useState<Role>('lead');

  return (
    <details className="rounded-md border border-hl-border bg-hl-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-hl-mint">
        Multi-sig signing <span className="text-hl-subtle">(advanced)</span>
      </summary>
      <div className="space-y-4 border-t border-hl-border p-4">
        <p className="text-xs text-hl-subtle">
          For validators whose address is a Hyperliquid multi-sig user. Coordinate by copy-paste —
          there is no backend. Confirm the full flow on <strong className="text-hl-text">testnet</strong>{' '}
          before mainnet.
        </p>

        <div className="flex gap-2">
          {(['lead', 'cosigner'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`rounded px-3 py-1 text-xs ${
                role === r
                  ? 'bg-hl-mint text-hl-bg'
                  : 'border border-hl-border text-hl-subtle hover:text-hl-text'
              }`}
            >
              {r === 'lead' ? "I'm the lead (collect + submit)" : "I'm a cosigner (sign only)"}
            </button>
          ))}
        </div>

        {role === 'lead' ? (
          <LeadView action={action} actionRaw={actionRaw} network={network} />
        ) : (
          <CosignerView />
        )}
      </div>
    </details>
  );
}

// ---- Lead ---------------------------------------------------------------

function LeadView({ action, actionRaw, network }: Props) {
  const [multiSigUser, setMultiSigUser] = useState('');
  const [nonce, setNonce] = useState<string | null>(null);
  const [signers, setSigners] = useState<MultiSigSigners | null | 'loading' | 'error'>(null);
  const [cosigText, setCosigText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok'; response: unknown } | { kind: 'err'; msg: string } | null>(
    null,
  );

  const activeAccount = useActiveAccount();
  const msuValid = isAddress(multiSigUser);
  // Lead signs the OUTER envelope, so the session's outerSigner tracks the live
  // MetaMask account. Switching accounts changes outerSigner → the request (and
  // thus what cosigners must sign) changes too.
  const outerSigner = activeAccount ? (activeAccount.toLowerCase() as `0x${string}`) : null;

  // MS-031 — resolve the multisig's authorized signers + threshold.
  useEffect(() => {
    if (!msuValid || !network) {
      setSigners(null);
      return;
    }
    let cancelled = false;
    setSigners('loading');
    fetchUserToMultiSigSigners(network, multiSigUser)
      .then((s) => {
        if (!cancelled) setSigners(s);
      })
      .catch(() => {
        if (!cancelled) setSigners('error');
      });
    return () => {
      cancelled = true;
    };
  }, [msuValid, multiSigUser, network]);

  const authorizedSet = useMemo(() => {
    const s = signers && signers !== 'loading' && signers !== 'error' ? signers : null;
    return new Set((s?.authorizedUsers ?? []).map((a) => a.toLowerCase()));
  }, [signers]);
  const threshold =
    signers && signers !== 'loading' && signers !== 'error' ? signers.threshold : null;
  const leadAuthorized = outerSigner !== null && authorizedSet.has(outerSigner);

  const request = useMemo<MultiSigRequest | null>(
    () =>
      msuValid && outerSigner && action && network && nonce
        ? {
            v: 1,
            network,
            multiSigUser: multiSigUser.toLowerCase() as `0x${string}`,
            outerSigner,
            nonce,
            action,
          }
        : null,
    [msuValid, outerSigner, action, network, nonce, multiSigUser],
  );

  const cosigs = useMemo<{ ok: CosignerSig[]; error: string | null }>(() => {
    try {
      return { ok: parseCosigs(cosigText), error: null };
    } catch (e) {
      return { ok: [], error: (e as Error).message };
    }
  }, [cosigText]);

  const acceptedCosigs = useMemo(
    () =>
      authorizedSet.size > 0
        ? cosigs.ok.filter((c) => authorizedSet.has(c.signer))
        : cosigs.ok,
    [cosigs.ok, authorizedSet],
  );
  const rejectedCosigs = cosigs.ok.filter((c) => !acceptedCosigs.includes(c));
  const enough = threshold !== null && acceptedCosigs.length >= threshold;

  const addMyCosig = useCallback(async () => {
    if (!request) return;
    setBusy(true);
    setResult(null);
    try {
      const signer = await getActiveAccount();
      if (!signer) throw new Error('Connect MetaMask first.');
      const env = multiSigEnvelope(request.multiSigUser, request.outerSigner, request.action);
      const typed = cosignTypedData(env, BigInt(request.nonce), request.network === 'mainnet');
      const sig = await signTypedDataMetaMask(signer, typed);
      const line = serializeCosig({ signer: signer.toLowerCase() as `0x${string}`, ...sig });
      setCosigText((t) => (t.trim() ? `${t.trim()}\n${line}` : line));
    } catch (e) {
      setResult({ kind: 'err', msg: errText(e) });
    } finally {
      setBusy(false);
    }
  }, [request]);

  const signAndSubmit = useCallback(async () => {
    if (!request || !enough) return;
    setBusy(true);
    setResult(null);
    try {
      const signer = await getActiveAccount();
      if (!signer) throw new Error('Connect MetaMask first.');
      if (signer.toLowerCase() !== request.outerSigner) {
        throw new Error(
          `Active MetaMask account (${signer.toLowerCase()}) is not the session's outer signer ` +
            `(${request.outerSigner}). Switch back to it, or set a new nonce and reshare.`,
        );
      }
      const signatures = acceptedCosigs.map((c) => ({ r: c.r, s: c.s, v: c.v }));
      const msa = buildMultiSigAction(
        request.multiSigUser,
        request.outerSigner,
        request.action,
        signatures,
      );
      const nonceBig = BigInt(request.nonce);
      const typed = sendMultiSigTypedData(msa, nonceBig, request.network === 'mainnet');
      const outerSig = await signUserSignedMetaMask(signer, typed);
      const response = await submitMultiSig({
        network: request.network,
        action: msa,
        nonce: nonceBig,
        signature: outerSig,
      });
      setResult({ kind: 'ok', response });
    } catch (e) {
      setResult({ kind: 'err', msg: errText(e) });
    } finally {
      setBusy(false);
    }
  }, [request, enough, acceptedCosigs]);

  return (
    <div className="space-y-4">
      {(!action || !network) && (
        <p className="text-xs text-mainnet">
          Choose a network and paste a valid validatorL1Vote action on the main page first — the lead
          reuses it.
        </p>
      )}
      {!activeAccount && (
        <p className="text-xs text-mainnet">Connect MetaMask on the main page first.</p>
      )}
      {activeAccount && (
        <p className="mono text-[11px] text-hl-subtle">
          outer signer (active account): {activeAccount.toLowerCase()}
        </p>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-hl-subtle">Multisig validator address (multiSigUser)</span>
        <input
          value={multiSigUser}
          onChange={(e) => setMultiSigUser(e.target.value.trim())}
          placeholder="0x…"
          className="mono w-full rounded border border-hl-border bg-hl-bg p-2 text-xs text-hl-text"
        />
      </label>

      {msuValid && (
        <div className="rounded border border-hl-border bg-hl-bg p-2 text-xs">
          {signers === 'loading' && <span className="text-hl-subtle">resolving signers…</span>}
          {signers === 'error' && <span className="text-mainnet">could not query userToMultiSigSigners</span>}
          {signers === null && (
            <span className="text-mainnet">Not a multi-sig user (no authorized signers).</span>
          )}
          {signers && signers !== 'loading' && signers !== 'error' && (
            <div className="space-y-1">
              <div>
                <strong className="text-hl-text">{signers.threshold}</strong>
                <span className="text-hl-subtle">
                  {' '}
                  of {signers.authorizedUsers.length} required
                </span>
              </div>
              <ul className="space-y-0.5">
                {signers.authorizedUsers.map((u) => (
                  <li key={u} className="mono text-[11px] text-hl-subtle">
                    {u}
                    {outerSigner === u.toLowerCase() && <span className="text-hl-mint"> ← you</span>}
                  </li>
                ))}
              </ul>
              {activeAccount && !leadAuthorized && (
                <p className="text-mainnet">
                  Your active account ({outerSigner}) is not an authorized signer — the outer submit
                  will be rejected.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {action && network && <ActionSummary action={action} network={network} />}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!msuValid || !outerSigner || !action}
          onClick={() => setNonce(Date.now().toString())}
          className="rounded border border-hl-border px-3 py-1 text-xs text-hl-text hover:border-hl-mint disabled:opacity-40"
        >
          {nonce ? 'New nonce' : 'Start session (set nonce)'}
        </button>
        {nonce && <span className="mono text-[11px] text-hl-subtle">nonce {nonce}</span>}
      </div>

      {request && (
        <CopyBox
          label="① Send this request to every cosigner"
          text={serializeRequest(request, actionRaw ?? undefined)}
        />
      )}

      {request && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-hl-subtle">② Paste cosigner signatures (one per line or a JSON array)</span>
            {activeAccount && leadAuthorized && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void addMyCosig()}
                className="rounded border border-hl-border px-2 py-0.5 text-[11px] text-hl-subtle hover:text-hl-mint disabled:opacity-40"
              >
                + add my cosignature
              </button>
            )}
          </div>
          <textarea
            value={cosigText}
            onChange={(e) => setCosigText(e.target.value)}
            rows={5}
            placeholder='{"signer":"0x…","r":"0x…","s":"0x…","v":27}'
            className="mono w-full rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text"
          />
          {cosigs.error && <p className="text-xs text-mainnet">{cosigs.error}</p>}
          <div className="text-xs text-hl-subtle">
            collected{' '}
            <strong className={enough ? 'text-hl-mint' : 'text-hl-text'}>
              {acceptedCosigs.length}
            </strong>
            {threshold !== null && <> / {threshold} required</>}
            {rejectedCosigs.length > 0 && (
              <span className="text-mainnet"> · {rejectedCosigs.length} ignored (not authorized)</span>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!request || !enough || busy}
        onClick={() => void signAndSubmit()}
        className="w-full rounded bg-hl-mint px-4 py-3 text-sm font-semibold text-hl-bg transition-opacity hover:bg-hl-mint-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Working…' : '③ Sign outer envelope + submit'}
      </button>

      {result?.kind === 'ok' && (
        <CopyBox label="HF /exchange response" text={JSON.stringify(result.response, null, 2)} />
      )}
      {result?.kind === 'err' && (
        <pre className="mono whitespace-pre-wrap rounded border border-mainnet bg-mainnet/10 p-2 text-xs text-mainnet">
          {result.msg}
        </pre>
      )}
    </div>
  );
}

// ---- Cosigner -----------------------------------------------------------

function CosignerView() {
  const activeAccount = useActiveAccount();
  const [reqText, setReqText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mySig, setMySig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const parsed = useMemo<{ req: MultiSigRequest | null; error: string | null }>(() => {
    if (!reqText.trim()) return { req: null, error: null };
    try {
      return { req: parseRequest(reqText), error: null };
    } catch (e) {
      return { req: null, error: (e as Error).message };
    }
  }, [reqText]);

  const sign = useCallback(async () => {
    const req = parsed.req;
    if (!req) return;
    setBusy(true);
    setErr(null);
    setMySig(null);
    try {
      // Read the account fresh: cosigners typically switch to their authorized
      // account in MetaMask right before signing.
      const signer = await getActiveAccount();
      if (!signer) throw new Error('Connect MetaMask first.');
      const env = multiSigEnvelope(req.multiSigUser, req.outerSigner, req.action);
      const typed = cosignTypedData(env, BigInt(req.nonce), req.network === 'mainnet');
      const sig = await signTypedDataMetaMask(signer, typed);
      setMySig(serializeCosig({ signer: signer.toLowerCase() as `0x${string}`, ...sig }));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }, [parsed.req]);

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs text-hl-subtle">① Paste the request from the lead</span>
        <textarea
          value={reqText}
          onChange={(e) => setReqText(e.target.value)}
          rows={6}
          placeholder='{"v":1,"network":"testnet","multiSigUser":"0x…",…}'
          className="mono w-full rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text"
        />
      </label>
      {parsed.error && <p className="text-xs text-mainnet">{parsed.error}</p>}

      {parsed.req && (
        <div className="rounded border border-hl-border bg-hl-bg p-2 text-xs text-hl-subtle">
          Cosigning for multiSigUser <span className="mono text-hl-text">{parsed.req.multiSigUser}</span>,
          lead <span className="mono text-hl-text">{parsed.req.outerSigner}</span>, nonce{' '}
          <span className="mono text-hl-text">{parsed.req.nonce}</span>, network{' '}
          <strong className="text-hl-text">{parsed.req.network}</strong>.
        </div>
      )}

      {parsed.req && <ActionSummary action={parsed.req.action} network={parsed.req.network} />}

      {activeAccount ? (
        <p className="mono text-[11px] text-hl-subtle">
          signing as {activeAccount.toLowerCase()} — switch account in MetaMask to change
        </p>
      ) : (
        <p className="text-xs text-hl-subtle">Connect MetaMask on the main page first.</p>
      )}

      <button
        type="button"
        disabled={!parsed.req || !activeAccount || busy}
        onClick={() => void sign()}
        className="w-full rounded bg-hl-mint px-4 py-3 text-sm font-semibold text-hl-bg transition-opacity hover:bg-hl-mint-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Waiting for signature…' : '② Sign inner action as cosigner'}
      </button>
      {err && (
        <pre className="mono whitespace-pre-wrap rounded border border-mainnet bg-mainnet/10 p-2 text-xs text-mainnet">
          {err}
        </pre>
      )}
      {mySig && <CopyBox label="③ Send this back to the lead" text={mySig} />}
    </div>
  );
}
