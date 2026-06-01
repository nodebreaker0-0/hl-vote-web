// Multi-sig validatorL1Vote signing builders (G-2). Pure: build the typed-data
// to sign + the wire envelope; the UI does the actual MetaMask/Ledger signing.
// SLASHING-GRADE — gated by tests/golden/multisig* (byte-exact vs Python SDK).
// See contracts/multisig-signing.md.

import { actionHash } from './actionHash';
import { phantomAgent } from './phantomAgent';
import { l1Payload } from './l1Payload';
import {
  userSignedTypedData,
  userSignedHashes,
  SEND_MULTI_SIG_TYPES,
  CONVERT_TO_MULTI_SIG_USER_TYPES,
  SIGNATURE_CHAIN_ID,
  type UserSignedTypedData,
} from './userSigned';
import type { Hex, L1TypedData } from './types';

/** `[multiSigUser, outerSigner, innerAction]` — what each cosigner signs (scheme A). */
export type MultiSigEnvelope = [string, string, object];

export function multiSigEnvelope(
  multiSigUser: Hex,
  outerSigner: Hex,
  action: object,
): MultiSigEnvelope {
  return [multiSigUser.toLowerCase(), outerSigner.toLowerCase(), action];
}

/** Cosigner typed-data (Agent / chainId 1337) — sign with eth_signTypedData_v4. */
export function cosignTypedData(
  envelope: MultiSigEnvelope,
  nonce: bigint,
  isMainnet: boolean,
): L1TypedData {
  const ah = actionHash(envelope, nonce, null, null);
  return l1Payload(phantomAgent(ah, isMainnet));
}

export interface MultiSigAction {
  type: 'multiSig';
  signatureChainId: string;
  signatures: unknown[];
  payload: { multiSigUser: string; outerSigner: string; action: object };
}

export function buildMultiSigAction(
  multiSigUser: Hex,
  outerSigner: Hex,
  action: object,
  signatures: unknown[],
): MultiSigAction {
  return {
    type: 'multiSig',
    signatureChainId: SIGNATURE_CHAIN_ID,
    signatures,
    payload: {
      multiSigUser: multiSigUser.toLowerCase(),
      outerSigner: outerSigner.toLowerCase(),
      action,
    },
  };
}

/** Outer signer (transaction lead) typed-data — SendMultiSig (scheme B). */
export function sendMultiSigTypedData(
  multiSigAction: MultiSigAction,
  nonce: bigint,
  isMainnet: boolean,
): UserSignedTypedData {
  // action minus "type" — key order preserved (signatureChainId, signatures, payload).
  const withoutTag = {
    signatureChainId: multiSigAction.signatureChainId,
    signatures: multiSigAction.signatures,
    payload: multiSigAction.payload,
  };
  const multiSigActionHash = actionHash(withoutTag, nonce, null, null);
  return userSignedTypedData('HyperliquidTransaction:SendMultiSig', SEND_MULTI_SIG_TYPES, {
    hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
    multiSigActionHash,
    nonce: Number(nonce),
  });
}

export interface ConvertToMultiSigUserAction {
  type: 'convertToMultiSigUser';
  signers: string;
  nonce: number;
}

/**
 * Python `json.dumps(obj)` (default separators `", "` / `": "`) — NOT
 * `JSON.stringify`, which omits the spaces. The `signers` field is signed as a
 * string, so the exact bytes must match the SDK (golden ms-convert-*). ASCII
 * only (validator addresses + fixed keys); non-ASCII would need \uXXXX escaping.
 */
function pyJsonDumps(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(pyJsonDumps).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const body = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${JSON.stringify(k)}: ${pyJsonDumps(v)}`)
      .join(', ');
    return `{${body}}`;
  }
  throw new Error('pyJsonDumps: unsupported value');
}

/**
 * Build a convertToMultiSigUser action. authorizedUsers are sorted (SDK parity).
 * Pass empty authorizedUsers + threshold 0 to convert back to a normal user.
 */
export function convertToMultiSigUserAction(
  authorizedUsers: string[],
  threshold: number,
  nonce: bigint,
): ConvertToMultiSigUserAction {
  const sorted = [...authorizedUsers].sort();
  const signers = pyJsonDumps({ authorizedUsers: sorted, threshold });
  return { type: 'convertToMultiSigUser', signers, nonce: Number(nonce) };
}

/** convertToMultiSigUser typed-data — ConvertToMultiSigUser (scheme B). */
export function convertTypedData(
  action: ConvertToMultiSigUserAction,
  isMainnet: boolean,
): UserSignedTypedData {
  return userSignedTypedData(
    'HyperliquidTransaction:ConvertToMultiSigUser',
    CONVERT_TO_MULTI_SIG_USER_TYPES,
    {
      hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
      signers: action.signers,
      nonce: action.nonce,
    },
  );
}

export { userSignedHashes };
