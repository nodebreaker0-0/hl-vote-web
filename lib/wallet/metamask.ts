// T030/T036 — MetaMask EIP-712 signing path.
//
// We talk to MetaMask via the EIP-1193 provider (`window.ethereum`) directly.
// Bringing in wagmi+viem for a single signTypedData_v4 call would push the
// bundle past Constitution V budget; the manual path is ~30 lines and gives
// exact control over the JSON sent to MetaMask.

import type { L1TypedData, SignatureRSV } from '@/lib/signing';
import { fromHex } from '@/lib/signing';

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
}

function getProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

export function hasMetaMask(): boolean {
  return getProvider()?.isMetaMask === true;
}

export class WalletNotFoundError extends Error {
  constructor() {
    super('MetaMask provider not detected.');
  }
}
export class WalletRejectedError extends Error {}

export async function connectMetaMask(): Promise<`0x${string}`> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();
  try {
    const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
    const a = accounts[0];
    if (typeof a !== 'string' || !a.startsWith('0x')) {
      throw new Error('No account returned.');
    }
    return a as `0x${string}`;
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw new WalletRejectedError('User rejected wallet connect.');
    throw e;
  }
}

export async function signTypedDataMetaMask(
  account: `0x${string}`,
  typed: L1TypedData,
): Promise<SignatureRSV> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();
  // eth_signTypedData_v4 takes the typed-data JSON as a string.
  const payload = JSON.stringify(typed);
  let sigHex: string;
  try {
    sigHex = (await p.request({
      method: 'eth_signTypedData_v4',
      params: [account, payload],
    })) as string;
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw new WalletRejectedError('User rejected the signature.');
    throw e;
  }
  return splitSignature(sigHex);
}

export function splitSignature(sig: string): SignatureRSV {
  if (!sig.startsWith('0x') || sig.length !== 132) {
    throw new Error(`bad signature hex length: ${sig.length}`);
  }
  const r = ('0x' + sig.slice(2, 66)) as `0x${string}`;
  const s = ('0x' + sig.slice(66, 130)) as `0x${string}`;
  // v as integer
  const vBytes = fromHex(('0x' + sig.slice(130, 132)) as `0x${string}`);
  const v = vBytes[0] ?? 0;
  return { r, s, v };
}
