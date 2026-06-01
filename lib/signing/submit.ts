// POST /exchange — the only legitimate fetch caller (eslint exception is granted
// only to this file). HF endpoint allow-list is hardcoded — Constitution III/IV.

import type { ExchangePayload, Network, SignatureRSV, ValidatorL1VoteAction } from './types';

const MAINNET_URL = 'https://api.hyperliquid.xyz/exchange';
const TESTNET_URL = 'https://api.hyperliquid-testnet.xyz/exchange';

export interface SubmitArgs {
  network: Network;
  action: ValidatorL1VoteAction;
  nonce: bigint;
  signature: SignatureRSV;
}

export class SubmitNetworkError extends Error {}
export class SubmitHttpError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`HF /exchange responded ${status}`);
  }
}

export async function submitExchange(args: SubmitArgs): Promise<unknown> {
  return postExchange(args.network, {
    action: args.action,
    nonce: Number(args.nonce),
    signature: args.signature,
    vaultAddress: null,
    expiresAfter: null,
  });
}

/** Submit a multi-sig action (`{type:"multiSig", ...}`) signed by the outer signer. */
export interface SubmitMultiSigArgs {
  network: Network;
  /** The full `{type:"multiSig", signatureChainId, signatures, payload}` object. */
  action: object;
  /** Shared nonce — identical to the one all cosigners + the outer signer used. */
  nonce: bigint;
  /** Outer signer's `SendMultiSig` (scheme B) signature. */
  signature: SignatureRSV;
}

export async function submitMultiSig(args: SubmitMultiSigArgs): Promise<unknown> {
  return postExchange(args.network, {
    action: args.action,
    nonce: Number(args.nonce),
    signature: args.signature,
    vaultAddress: null,
    expiresAfter: null,
  });
}

/** Submit a plain user-signed action (e.g. convertToMultiSigUser setup). */
export interface SubmitUserSignedArgs {
  network: Network;
  /** The full action object as it should appear on the wire. */
  action: object;
  nonce: bigint;
  signature: SignatureRSV;
}

export async function submitUserSigned(args: SubmitUserSignedArgs): Promise<unknown> {
  return postExchange(args.network, {
    action: args.action,
    nonce: Number(args.nonce),
    signature: args.signature,
    vaultAddress: null,
    expiresAfter: null,
  });
}

async function postExchange(network: Network, body: ExchangePayload): Promise<unknown> {
  if (network === 'mainnet' && process.env.NEXT_PUBLIC_MAINNET_ENABLED !== 'true') {
    // Defense in depth — UI already disables this, but trip again here.
    throw new Error('mainnet not enabled in this build');
  }
  const url = network === 'mainnet' ? MAINNET_URL : TESTNET_URL;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new SubmitNetworkError((e as Error).message);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new SubmitHttpError(res.status, text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
