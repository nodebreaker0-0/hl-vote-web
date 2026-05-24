'use client';

// T034 — show the operator the bytes/hashes they're about to sign.
// All computation is pure: lib/signing/* deterministically derives:
//   - msgpack(action)         — what HF hashes
//   - action_hash             — keccak256 of (msgpack || nonce || flags)
//   - EIP-712 typed_data
//   - domain/message/signing hashes (Ledger will display these)
//
// nonce is reactive to now() so this can re-render as time passes (refresh button).

import { useMemo, useState } from 'react';
import {
  actionHash,
  l1Payload,
  phantomAgent,
  serialize,
  toHex,
  typedDataHashes,
  type Network,
  type ValidatorL1VoteAction,
} from '@/lib/signing';

export interface ActionPreviewProps {
  action: ValidatorL1VoteAction;
  network: Network;
  /** Inject a nonce externally (so submit can re-use the same one).
   *  If absent, preview derives its own `BigInt(Date.now())`. */
  nonce?: bigint;
  onNonceRefresh?: (n: bigint) => void;
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-3 py-1">
      <span className="text-xs uppercase tracking-wider text-hl-subtle">{label}</span>
      <code className="break-all font-mono text-xs text-hl-text">{value}</code>
    </div>
  );
}

export function ActionPreview({ action, network, nonce, onNonceRefresh }: ActionPreviewProps) {
  const [internalNonce, setInternalNonce] = useState<bigint>(() => BigInt(Date.now()));
  const effectiveNonce = nonce ?? internalNonce;

  const isMainnet = network === 'mainnet';

  const { msgpackHex, ahash, typed, hashes, byteLen } = useMemo(() => {
    const bytes = serialize(action);
    const ah = actionHash(action, effectiveNonce, null, null);
    const pa = phantomAgent(ah, isMainnet);
    const td = l1Payload(pa);
    const h = typedDataHashes(td);
    return {
      msgpackHex: toHex(bytes),
      ahash: ah,
      typed: td,
      hashes: h,
      byteLen: bytes.length,
    };
  }, [action, effectiveNonce, isMainnet]);

  const refresh = () => {
    const n = BigInt(Date.now());
    setInternalNonce(n);
    onNonceRefresh?.(n);
  };

  return (
    <fieldset className="rounded-md border border-hl-border bg-hl-surface p-4">
      <legend className="px-2 text-xs uppercase tracking-wider text-hl-subtle">
        Preview (what gets signed)
      </legend>

      <div className="space-y-2">
        <HashRow label="network" value={`${network} (phantom source = "${isMainnet ? 'a' : 'b'}")`} />

        <div className="grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-3 py-1">
          <span className="text-xs uppercase tracking-wider text-hl-subtle">nonce</span>
          <div className="flex items-baseline gap-2">
            <code className="font-mono text-xs text-hl-text">{effectiveNonce.toString()}</code>
            <button
              type="button"
              onClick={refresh}
              className="rounded bg-hl-bg px-2 py-0.5 text-xs text-hl-subtle hover:text-hl-mint"
            >
              refresh
            </button>
          </div>
        </div>

        <HashRow label={`msgpack (${byteLen}B)`} value={msgpackHex} />
        <HashRow label="action_hash" value={ahash} />
        <HashRow label="domain_hash" value={hashes.domainHash} />
        <HashRow label="message_hash" value={hashes.messageHash} />
        <HashRow label="signing_hash" value={hashes.signingHash} />
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-hl-subtle hover:text-hl-mint">
          EIP-712 typed_data (raw)
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-hl-bg p-3 text-[11px] leading-snug text-hl-text">
          {JSON.stringify(typed, null, 2)}
        </pre>
      </details>
    </fieldset>
  );
}
