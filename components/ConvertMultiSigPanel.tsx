'use client';

// MS-040b — change signers / convert BACK to a normal user, for an address that
// is ALREADY a multi-sig. This requires threshold cosigning of a
// convertToMultiSigUser inner action wrapped in a multiSig.
//
// Coordination is the same copy-paste flow as a multi-sig vote, BUT the inner
// action is user-signed, so BOTH the cosigners and the outer signer sign with
// scheme B (domain HyperliquidSignTransaction, chainId 0x66eee). Byte-exact
// construction is golden-gated (tests/golden ms-cvt-*). Confirm on TESTNET.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildMultiSigAction,
  convertInnerAction,
  convertToMultiSigUserAction,
  cosignConvertTypedData,
  sendMultiSigTypedData,
  submitMultiSig,
  SubmitHttpError,
  SubmitNetworkError,
  type Network,
} from '@/lib/signing';
import {
  getActiveAccount,
  signUserSignedMetaMask,
  WalletChainError,
  WalletRejectedError,
} from '@/lib/wallet/metamask';
import {
  parseConvertRequest,
  serializeConvertRequest,
  parseCosigs,
  serializeCosig,
  isAddress,
  type ConvertRequest,
  type CosignerSig,
} from '@/lib/multisigSession';
import { fetchUserToMultiSigSigners, type MultiSigSigners } from '@/lib/api';
import { useActiveAccount } from './useActiveAccount';

interface Props {
  network: Network | null;
}

type Role = 'lead' | 'cosigner';
type Mode = 'teardown' | 'change';

function errText(e: unknown): string {
  if (e instanceof WalletRejectedError || e instanceof WalletChainError) return e.message;
  if (e instanceof SubmitNetworkError) return `Network error: ${e.message}`;
  if (e instanceof SubmitHttpError) return `HTTP ${e.status}: ${e.body}`;
  return (e as Error).message ?? String(e);
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

/** Human-readable summary of a `signers` string. */
function describeSigners(signers: string): string {
  if (signers === 'null') return 'Convert BACK to a normal user (remove multi-sig).';
  try {
    const o = JSON.parse(signers) as { authorizedUsers?: string[]; threshold?: number };
    return `Set ${o.threshold} of ${o.authorizedUsers?.length} signers.`;
  } catch {
    return signers;
  }
}

export function ConvertMultiSigPanel({ network }: Props) {
  const [role, setRole] = useState<Role>('lead');
  return (
    <details className="rounded-md border border-hl-border bg-hl-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-hl-mint">
        Change / remove multi-sig <span className="text-hl-subtle">(cosigned)</span>
      </summary>
      <div className="space-y-4 border-t border-hl-border p-4">
        <p className="text-xs text-hl-subtle">
          For an address that is <strong className="text-hl-text">already</strong> a multi-sig:
          change its signers/threshold or convert it back to a normal user. Needs threshold
          cosigning (copy-paste, same as a vote). Confirm on{' '}
          <strong className="text-hl-text">testnet</strong> first.
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
        {role === 'lead' ? <ConvertLead network={network} /> : <ConvertCosigner />}
      </div>
    </details>
  );
}

// ---- Lead ---------------------------------------------------------------

function ConvertLead({ network }: Props) {
  const activeAccount = useActiveAccount();
  const [mode, setMode] = useState<Mode>('teardown');
  const [multiSigUser, setMultiSigUser] = useState('');
  const [usersText, setUsersText] = useState('');
  const [threshold, setThreshold] = useState(1);
  const [nonce, setNonce] = useState<string | null>(null);
  const [signers, setSigners] = useState<MultiSigSigners | null | 'loading' | 'error'>(null);
  const [cosigText, setCosigText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { kind: 'ok'; response: unknown } | { kind: 'err'; msg: string } | null
  >(null);

  const msuValid = isAddress(multiSigUser);
  const outerSigner = activeAccount ? (activeAccount.toLowerCase() as `0x${string}`) : null;

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

  const current = signers && signers !== 'loading' && signers !== 'error' ? signers : null;
  const authorizedSet = useMemo(
    () => new Set((current?.authorizedUsers ?? []).map((a) => a.toLowerCase())),
    [current],
  );
  const threshold_ = current?.threshold ?? null;
  const leadAuthorized = outerSigner !== null && authorizedSet.has(outerSigner);

  // new signers from inputs
  const newUsers = useMemo<{ users: `0x${string}`[]; error: string | null }>(() => {
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

  const changeThresholdValid =
    Number.isInteger(threshold) && threshold >= 1 && threshold <= newUsers.users.length;

  const signersString = useMemo<string | null>(() => {
    if (mode === 'teardown') return 'null';
    if (newUsers.users.length === 0 || !changeThresholdValid) return null;
    return convertToMultiSigUserAction(newUsers.users, threshold, 0n).signers;
  }, [mode, newUsers.users, threshold, changeThresholdValid]);

  const request = useMemo<ConvertRequest | null>(
    () =>
      msuValid && outerSigner && network && nonce && signersString !== null
        ? {
            v: 1,
            kind: 'convertToMultiSigUser',
            network,
            multiSigUser: multiSigUser.toLowerCase() as `0x${string}`,
            outerSigner,
            nonce,
            signers: signersString,
          }
        : null,
    [msuValid, outerSigner, network, nonce, signersString, multiSigUser],
  );

  const cosigs = useMemo<{ ok: CosignerSig[]; error: string | null }>(() => {
    try {
      return { ok: parseCosigs(cosigText), error: null };
    } catch (e) {
      return { ok: [], error: (e as Error).message };
    }
  }, [cosigText]);
  const acceptedCosigs = useMemo(
    () => (authorizedSet.size > 0 ? cosigs.ok.filter((c) => authorizedSet.has(c.signer)) : cosigs.ok),
    [cosigs.ok, authorizedSet],
  );
  const enough = threshold_ !== null && acceptedCosigs.length >= threshold_;

  const addMyCosig = useCallback(async () => {
    if (!request) return;
    setBusy(true);
    setResult(null);
    try {
      const signer = await getActiveAccount();
      if (!signer) throw new Error('Connect MetaMask first.');
      const inner = convertInnerAction(request.signers, BigInt(request.nonce), request.network === 'mainnet');
      const typed = cosignConvertTypedData(inner, request.multiSigUser, request.outerSigner, request.network === 'mainnet');
      const sig = await signUserSignedMetaMask(signer, typed);
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
          `Active account (${signer.toLowerCase()}) is not the session's outer signer ` +
            `(${request.outerSigner}). Switch back or start a new nonce.`,
        );
      }
      const isMainnet = request.network === 'mainnet';
      const inner = convertInnerAction(request.signers, BigInt(request.nonce), isMainnet);
      const signatures = acceptedCosigs.map((c) => ({ r: c.r, s: c.s, v: c.v }));
      const msa = buildMultiSigAction(request.multiSigUser, request.outerSigner, inner, signatures);
      const nonceBig = BigInt(request.nonce);
      const typed = sendMultiSigTypedData(msa, nonceBig, isMainnet);
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
      {!network && <p className="text-xs text-mainnet">Choose a network on the main page first.</p>}
      {!activeAccount && (
        <p className="text-xs text-mainnet">Connect MetaMask on the main page first.</p>
      )}

      <div className="flex gap-2">
        {(['teardown', 'change'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded px-3 py-1 text-xs ${
              mode === m
                ? 'bg-hl-mint/20 text-hl-mint ring-1 ring-hl-mint'
                : 'border border-hl-border text-hl-subtle hover:text-hl-text'
            }`}
          >
            {m === 'teardown' ? 'Convert back to normal' : 'Change signers / threshold'}
          </button>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-hl-subtle">Multi-sig address (multiSigUser)</span>
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
          {signers === 'error' && <span className="text-mainnet">query failed</span>}
          {signers === null && (
            <span className="text-mainnet">Not a multi-sig user — nothing to change.</span>
          )}
          {current && (
            <div className="space-y-1">
              <div>
                current: <strong className="text-hl-text">{current.threshold}</strong>
                <span className="text-hl-subtle"> of {current.authorizedUsers.length}</span>
              </div>
              <ul className="space-y-0.5">
                {current.authorizedUsers.map((u) => (
                  <li key={u} className="mono text-[11px] text-hl-subtle">
                    {u}
                    {outerSigner === u.toLowerCase() && <span className="text-hl-mint"> ← you</span>}
                  </li>
                ))}
              </ul>
              {activeAccount && !leadAuthorized && (
                <p className="text-mainnet">
                  Your active account ({outerSigner}) is not an authorized signer — submit will be
                  rejected.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'change' && (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs text-hl-subtle">New authorized users (one per line)</span>
            <textarea
              value={usersText}
              onChange={(e) => setUsersText(e.target.value)}
              rows={3}
              placeholder={'0x…\n0x…'}
              className="mono w-full rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text"
            />
          </label>
          {newUsers.error && <p className="text-xs text-mainnet">{newUsers.error}</p>}
          <label className="flex items-center gap-2">
            <span className="text-xs text-hl-subtle">New threshold</span>
            <input
              type="number"
              min={1}
              max={Math.max(newUsers.users.length, 1)}
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)}
              className="mono w-20 rounded border border-hl-border bg-hl-bg p-1 text-xs text-hl-text"
            />
            <span className="text-[11px] text-hl-subtle">of {newUsers.users.length}</span>
          </label>
        </div>
      )}

      {signersString !== null && (
        <p className="text-xs text-hl-subtle">
          Action: <strong className="text-hl-text">{describeSigners(signersString)}</strong>
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!msuValid || !outerSigner || signersString === null}
          onClick={() => setNonce(Date.now().toString())}
          className="rounded border border-hl-border px-3 py-1 text-xs text-hl-text hover:border-hl-mint disabled:opacity-40"
        >
          {nonce ? 'New nonce' : 'Start session (set nonce)'}
        </button>
        {nonce && <span className="mono text-[11px] text-hl-subtle">nonce {nonce}</span>}
      </div>

      {request && (
        <CopyBox label="① Send to every cosigner" text={serializeConvertRequest(request)} />
      )}

      {request && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-hl-subtle">② Paste cosigner signatures</span>
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
            rows={4}
            placeholder='{"signer":"0x…","r":"0x…","s":"0x…","v":27}'
            className="mono w-full rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text"
          />
          {cosigs.error && <p className="text-xs text-mainnet">{cosigs.error}</p>}
          <div className="text-xs text-hl-subtle">
            collected{' '}
            <strong className={enough ? 'text-hl-mint' : 'text-hl-text'}>
              {acceptedCosigs.length}
            </strong>
            {threshold_ !== null && <> / {threshold_} required</>}
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

function ConvertCosigner() {
  const activeAccount = useActiveAccount();
  const [reqText, setReqText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mySig, setMySig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const parsed = useMemo<{ req: ConvertRequest | null; error: string | null }>(() => {
    if (!reqText.trim()) return { req: null, error: null };
    try {
      return { req: parseConvertRequest(reqText), error: null };
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
      const signer = await getActiveAccount();
      if (!signer) throw new Error('Connect MetaMask first.');
      const isMainnet = req.network === 'mainnet';
      const inner = convertInnerAction(req.signers, BigInt(req.nonce), isMainnet);
      const typed = cosignConvertTypedData(inner, req.multiSigUser, req.outerSigner, isMainnet);
      const sig = await signUserSignedMetaMask(signer, typed);
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
          rows={5}
          placeholder='{"v":1,"kind":"convertToMultiSigUser",…}'
          className="mono w-full rounded border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-text"
        />
      </label>
      {parsed.error && <p className="text-xs text-mainnet">{parsed.error}</p>}

      {parsed.req && (
        <div className="rounded border border-hl-border bg-hl-bg p-2 text-xs text-hl-subtle">
          multiSigUser <span className="mono text-hl-text">{parsed.req.multiSigUser}</span>, lead{' '}
          <span className="mono text-hl-text">{parsed.req.outerSigner}</span>, nonce{' '}
          <span className="mono text-hl-text">{parsed.req.nonce}</span>, network{' '}
          <strong className="text-hl-text">{parsed.req.network}</strong>.
          <br />
          <strong className="text-hl-text">{describeSigners(parsed.req.signers)}</strong>
        </div>
      )}

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
        {busy ? 'Waiting for signature…' : '② Sign as cosigner'}
      </button>
      {mySig && <CopyBox label="③ Send this back to the lead" text={mySig} />}
      {err && (
        <pre className="mono whitespace-pre-wrap rounded border border-mainnet bg-mainnet/10 p-2 text-xs text-mainnet">
          {err}
        </pre>
      )}
    </div>
  );
}
