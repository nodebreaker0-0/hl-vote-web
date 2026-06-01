// Backend-less multisig coordination format (G-2, contract §5 D1).
//
// There is no server, so the "transaction lead" (outerSigner) and the cosigners
// coordinate by copy-pasting two small JSON blobs:
//
//   1. MultiSigRequest  — lead → cosigners. Pins EXACTLY what everyone signs:
//      multiSigUser, outerSigner, the inner validatorL1Vote action, and the
//      shared nonce. The nonce MUST be identical across every cosigner and the
//      final outer submit, so it lives here and nowhere else.
//   2. CosignerSig      — cosigner → lead. The cosigner's {r,s,v} over the inner
//      envelope, tagged with their signer address so the lead can check it
//      against the multisig's authorizedUsers and dedupe.
//
// This module is pure (no React / no window) so it is unit-tested directly.

import type { Network, SignatureRSV, ValidatorL1VoteAction } from '@/lib/signing';

export interface MultiSigRequest {
  v: 1;
  network: Network;
  /** The multisig validator address that is casting the vote. */
  multiSigUser: `0x${string}`;
  /** The lead that will bundle signatures + submit (must be an authorized user). */
  outerSigner: `0x${string}`;
  /** Shared nonce (ms timestamp) as a decimal string — identical for everyone. */
  nonce: string;
  action: ValidatorL1VoteAction;
}

export interface CosignerSig extends SignatureRSV {
  /** Address that produced this signature (lowercased). */
  signer: `0x${string}`;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX32_RE = /^0x[0-9a-fA-F]{64}$/;

export function isAddress(x: unknown): x is `0x${string}` {
  return typeof x === 'string' && ADDR_RE.test(x);
}

function lower(addr: string): `0x${string}` {
  return addr.toLowerCase() as `0x${string}`;
}

/**
 * Serialize the request as COMPACT JSON (single line, no pretty-printing) and
 * embed the `action` VERBATIM from `actionRaw` — the exact text from the Action
 * input — rather than re-serializing it. So the blob is never reformatted or
 * key-reordered (Constitution II); it looks just like the Action input content.
 * Falls back to a compact JSON.stringify of the parsed action if no raw text.
 */
export function serializeRequest(req: MultiSigRequest, actionRaw?: string): string {
  const actionText = (actionRaw ?? JSON.stringify(req.action)).trim();
  return (
    `{"v":1,"network":${JSON.stringify(req.network)},` +
    `"multiSigUser":${JSON.stringify(req.multiSigUser)},` +
    `"outerSigner":${JSON.stringify(req.outerSigner)},` +
    `"nonce":${JSON.stringify(req.nonce)},` +
    `"action":${actionText}}`
  );
}

export function parseRequest(text: string): MultiSigRequest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('Expected a JSON object.');
  const o = raw as Record<string, unknown>;

  if (o.network !== 'mainnet' && o.network !== 'testnet') {
    throw new Error('network must be "mainnet" or "testnet".');
  }
  if (!isAddress(o.multiSigUser)) throw new Error('multiSigUser is not a valid address.');
  if (!isAddress(o.outerSigner)) throw new Error('outerSigner is not a valid address.');
  if (typeof o.nonce !== 'string' || !/^\d+$/.test(o.nonce)) {
    throw new Error('nonce must be a decimal string.');
  }
  if (typeof o.action !== 'object' || o.action === null) throw new Error('action missing.');
  const action = o.action as Record<string, unknown>;
  if (action.type !== 'validatorL1Vote') {
    throw new Error('action.type must be "validatorL1Vote".');
  }

  return {
    v: 1,
    network: o.network,
    multiSigUser: lower(o.multiSigUser),
    outerSigner: lower(o.outerSigner),
    nonce: o.nonce,
    action: o.action as ValidatorL1VoteAction,
  };
}

// ---- convert-via-multisig (MS-040b) request ------------------------------
// Same copy-paste coordination as a vote, but the inner action is a
// convertToMultiSigUser (teardown → `signers:"null"`, or change → JSON signers).

export interface ConvertRequest {
  v: 1;
  kind: 'convertToMultiSigUser';
  network: Network;
  multiSigUser: `0x${string}`;
  outerSigner: `0x${string}`;
  nonce: string;
  /** The exact `signers` string that will be signed: `"null"` or a JSON object. */
  signers: string;
}

export function serializeConvertRequest(req: ConvertRequest): string {
  return (
    `{"v":1,"kind":"convertToMultiSigUser","network":${JSON.stringify(req.network)},` +
    `"multiSigUser":${JSON.stringify(req.multiSigUser)},` +
    `"outerSigner":${JSON.stringify(req.outerSigner)},` +
    `"nonce":${JSON.stringify(req.nonce)},` +
    `"signers":${JSON.stringify(req.signers)}}`
  );
}

export function parseConvertRequest(text: string): ConvertRequest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('Expected a JSON object.');
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'convertToMultiSigUser') throw new Error('kind must be "convertToMultiSigUser".');
  if (o.network !== 'mainnet' && o.network !== 'testnet') {
    throw new Error('network must be "mainnet" or "testnet".');
  }
  if (!isAddress(o.multiSigUser)) throw new Error('multiSigUser is not a valid address.');
  if (!isAddress(o.outerSigner)) throw new Error('outerSigner is not a valid address.');
  if (typeof o.nonce !== 'string' || !/^\d+$/.test(o.nonce)) {
    throw new Error('nonce must be a decimal string.');
  }
  if (typeof o.signers !== 'string') throw new Error('signers must be a string.');
  return {
    v: 1,
    kind: 'convertToMultiSigUser',
    network: o.network,
    multiSigUser: lower(o.multiSigUser),
    outerSigner: lower(o.outerSigner),
    nonce: o.nonce,
    signers: o.signers,
  };
}

export function serializeCosig(sig: CosignerSig): string {
  return JSON.stringify({ signer: sig.signer, r: sig.r, s: sig.s, v: sig.v });
}

function parseOneCosig(o: Record<string, unknown>): CosignerSig {
  if (!isAddress(o.signer)) throw new Error('signer is not a valid address.');
  if (typeof o.r !== 'string' || !HEX32_RE.test(o.r)) throw new Error('r must be 32-byte hex.');
  if (typeof o.s !== 'string' || !HEX32_RE.test(o.s)) throw new Error('s must be 32-byte hex.');
  if (typeof o.v !== 'number' || !Number.isInteger(o.v)) throw new Error('v must be an integer.');
  return { signer: lower(o.signer), r: o.r as `0x${string}`, s: o.s as `0x${string}`, v: o.v };
}

/**
 * Parse one-or-more cosigner signatures. Accepts a JSON array, a single JSON
 * object, or several JSON objects separated by newlines / blank lines — whatever
 * is most convenient to paste. Duplicates (same signer) keep the LAST one.
 */
export function parseCosigs(text: string): CosignerSig[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  let items: unknown[];
  try {
    const asJson = JSON.parse(trimmed) as unknown;
    items = Array.isArray(asJson) ? asJson : [asJson];
  } catch {
    // Fall back to one JSON object per non-empty line.
    items = trimmed
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => {
        try {
          return JSON.parse(l) as unknown;
        } catch {
          throw new Error(`Line ${i + 1} is not valid JSON.`);
        }
      });
  }

  const bySigner = new Map<string, CosignerSig>();
  for (const it of items) {
    if (typeof it !== 'object' || it === null) throw new Error('Each signature must be an object.');
    const sig = parseOneCosig(it as Record<string, unknown>);
    bySigner.set(sig.signer, sig);
  }
  return [...bySigner.values()];
}
