// T030/T036 — MetaMask EIP-712 signing path.
//
// We talk to MetaMask via the EIP-1193 provider (`window.ethereum`) directly.
// Bringing in wagmi+viem for a single signTypedData_v4 call would push the
// bundle past Constitution V budget; the manual path is ~30 lines and gives
// exact control over the JSON sent to MetaMask.

import type { L1TypedData, SignatureRSV, UserSignedTypedData } from '@/lib/signing';
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

// Hyperliquid L1 actions embed a phantom domain with chainId 1337. MetaMask v11+
// enforces that typed-data domain.chainId equals the wallet's active chainId,
// so we must add/switch to a 1337 chain in the wallet before signing.
//
// The chain entry left in the user's MetaMask network list is deliberately
// generic — "EIP712signer" with currency "TMP" — so that the wallet entry
// reads as a tool the operator uses, not as a real Hyperliquid network they
// might mistake for trading. The chain has no real RPC and is signer-only.
const HL_PHANTOM_CHAIN = {
  chainId: '0x539', // 1337
  chainName: 'EIP712signer',
  nativeCurrency: { name: 'Temp', symbol: 'TMP', decimals: 18 },
  // MetaMask requires at least one rpcUrls entry. This URL never receives
  // JSON-RPC traffic from us; we only use this chain for typed-data signing.
  rpcUrls: ['https://api.hyperliquid-testnet.xyz'],
  blockExplorerUrls: [],
};

export class WalletChainError extends Error {}

export async function ensureHLPhantomChain(): Promise<void> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();

  // Already on 1337? Done.
  const currentHex = (await p.request({ method: 'eth_chainId' })) as string;
  if (currentHex === '0x539') return;

  // Try to switch first.
  try {
    await p.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x539' }],
    });
    return;
  } catch (e) {
    const code = (e as { code?: number }).code;
    // 4902 = chain not added to wallet
    if (code !== 4902 && code !== -32603) {
      if (code === 4001) throw new WalletRejectedError('User rejected chain switch.');
      throw e;
    }
  }

  // Add the phantom chain, then switch.
  try {
    await p.request({
      method: 'wallet_addEthereumChain',
      params: [HL_PHANTOM_CHAIN],
    });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw new WalletRejectedError('User rejected adding the phantom chain.');
    throw new WalletChainError(
      `Failed to add signer chain (1337): ${(e as Error).message}. ` +
        `Add it manually in MetaMask: Settings → Networks → Add manually. ` +
        `chainId=1337, name="EIP712signer", any RPC, currency TMP.`,
    );
  }

  // wallet_addEthereumChain typically auto-switches, but verify and switch if not.
  const afterHex = (await p.request({ method: 'eth_chainId' })) as string;
  if (afterHex !== '0x539') {
    await p.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x539' }],
    });
  }
}

// ---- Scheme B (user-signed) chain ---------------------------------------
//
// Multisig SendMultiSig / ConvertToMultiSigUser are *user-signed* actions:
// their EIP-712 domain.chainId is fixed at int("0x66eee") = 421614 (the SDK
// hardcodes signatureChainId="0x66eee"). HF recovers the signer using that
// domain.chainId, so it must be exactly 421614 for BOTH HL mainnet and testnet
// — the hyperliquidChain field ("Mainnet"/"Testnet"), not the chainId,
// distinguishes the network. MetaMask v11+ enforces domain.chainId == active
// chainId, so the wallet must sit on 0x66eee (Arbitrum Sepolia) while signing.
const HL_USER_SIGNED_CHAIN = {
  chainId: '0x66eee', // 421614
  chainName: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
  blockExplorerUrls: ['https://sepolia.arbiscan.io'],
};

export async function ensureUserSignedChain(): Promise<void> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();

  const currentHex = (await p.request({ method: 'eth_chainId' })) as string;
  if (currentHex === '0x66eee') return;

  try {
    await p.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x66eee' }],
    });
    return;
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 4902 && code !== -32603) {
      if (code === 4001) throw new WalletRejectedError('User rejected chain switch.');
      throw e;
    }
  }

  try {
    await p.request({
      method: 'wallet_addEthereumChain',
      params: [HL_USER_SIGNED_CHAIN],
    });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw new WalletRejectedError('User rejected adding the signer chain.');
    throw new WalletChainError(
      `Failed to add the user-signed chain (Arbitrum Sepolia, 421614): ${(e as Error).message}. ` +
        `Add it manually in MetaMask: chainId=421614, RPC https://sepolia-rollup.arbitrum.io/rpc.`,
    );
  }

  const afterHex = (await p.request({ method: 'eth_chainId' })) as string;
  if (afterHex !== '0x66eee') {
    await p.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x66eee' }],
    });
  }
}

/** Sign a user-signed (scheme B) typed-data — switches to 0x66eee first. */
export async function signUserSignedMetaMask(
  account: `0x${string}`,
  typed: UserSignedTypedData,
): Promise<SignatureRSV> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();

  await ensureUserSignedChain();

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

/** Returns the wallet's currently active chain id as a decimal number. */
export async function getActiveChainId(): Promise<number> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();
  const hex = (await p.request({ method: 'eth_chainId' })) as string;
  return parseInt(hex, 16);
}

export async function signTypedDataMetaMask(
  account: `0x${string}`,
  typed: L1TypedData,
): Promise<SignatureRSV> {
  const p = getProvider();
  if (!p) throw new WalletNotFoundError();

  // Experiment (Jan/x402 commit 7618ddf) tried signing with the wallet's
  // active chainId instead of forcing 1337. Result: HF still recovers
  // with chainId=1337 hardcoded for L1 actions, so signing with anything
  // else produces a "random" recovered address that doesn't match any
  // registered v-key. Outcome was `status:"err", "Must deposit ... User:
  // 0x3e30e42b..."` — a stranger's address falling out of bad recovery.
  //
  // Conclusion: L1 actions (`validatorL1Vote`, `placeOrder`, etc.) require
  // chainId=1337 on the wire. User-signed actions (`SendAsset` etc., which
  // carry `signatureChainId` in their body) can use any chainId, which is
  // what Jan's PR demonstrated. The two paths are NOT interchangeable.
  // Keep `ensureHLPhantomChain` in the call sequence.
  await ensureHLPhantomChain();

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
