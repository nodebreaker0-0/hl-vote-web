// Scheme B — "user-signed" EIP-712 (domain `HyperliquidSignTransaction`,
// chainId 0x66eee). NEW signing code, used by multisig (SendMultiSig /
// ConvertToMultiSigUser). Distinct from scheme A (Agent / chainId 1337) which
// every existing validatorL1Vote uses. SLASHING-GRADE: byte-exact parity with
// the Python SDK (`sign_user_signed_action`) is enforced by the multisig golden
// fixtures (tests/golden/multisig*). See contracts/multisig-signing.md §1.

import { keccak_256 } from '@noble/hashes/sha3';
import { fromHex, toHex } from './serialize';
import type { Hex } from './types';
import type { TypedDataHashes } from './typedDataHashes';

/** signatureChainId on the wire for user-signed actions (metadata, not signed). */
export const SIGNATURE_CHAIN_ID = '0x66eee';
/** EIP-712 domain.chainId for HyperliquidSignTransaction = int("0x66eee") = 421614. */
const USER_SIGNED_CHAIN_ID = 421614;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Hex;

export interface Eip712Field {
  name: string;
  type: string;
}

export const SEND_MULTI_SIG_TYPES: Eip712Field[] = [
  { name: 'hyperliquidChain', type: 'string' },
  { name: 'multiSigActionHash', type: 'bytes32' },
  { name: 'nonce', type: 'uint64' },
];

export const CONVERT_TO_MULTI_SIG_USER_TYPES: Eip712Field[] = [
  { name: 'hyperliquidChain', type: 'string' },
  { name: 'signers', type: 'string' },
  { name: 'nonce', type: 'uint64' },
];

export interface UserSignedTypedData {
  domain: { name: string; version: string; chainId: number; verifyingContract: Hex };
  types: Record<string, Eip712Field[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

const TE = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function encStr(s: string): Uint8Array {
  return keccak_256(TE.encode(s));
}

function encU256(n: bigint): Uint8Array {
  if (n < 0n) throw new Error('uint negative');
  const out = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function encAddr(addr: Hex): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error('bad address');
  const raw = fromHex(addr);
  const out = new Uint8Array(32);
  out.set(raw, 12);
  return out;
}

function encBytes32(hex: Hex): Uint8Array {
  const raw = fromHex(hex);
  if (raw.length !== 32) throw new Error('bytes32 expected 32B');
  return raw;
}

function encodeField(type: string, value: unknown): Uint8Array {
  switch (type) {
    case 'string':
      return encStr(String(value));
    case 'bytes32':
      return encBytes32(value as Hex);
    case 'address':
      return encAddr(value as Hex);
    case 'uint64':
    case 'uint256':
      return encU256(BigInt(value as number | string | bigint));
    default:
      throw new Error(`unsupported EIP-712 field type: ${type}`);
  }
}

const DOMAIN_TYPE_STRING =
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
const DOMAIN_TYPE_HASH = keccak_256(TE.encode(DOMAIN_TYPE_STRING));

const EIP712_DOMAIN_FIELDS: Eip712Field[] = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

/** Build the user-signed EIP-712 typed data (for MetaMask eth_signTypedData_v4). */
export function userSignedTypedData(
  primaryType: string,
  fields: Eip712Field[],
  message: Record<string, unknown>,
): UserSignedTypedData {
  return {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: USER_SIGNED_CHAIN_ID,
      verifyingContract: ZERO_ADDR,
    },
    types: { EIP712Domain: EIP712_DOMAIN_FIELDS, [primaryType]: fields },
    primaryType,
    message,
  };
}

/** domain/message/signing hashes for a user-signed typed-data (golden + Ledger display). */
export function userSignedHashes(typed: UserSignedTypedData): TypedDataHashes {
  const d = typed.domain;
  const domainHash = toHex(
    keccak_256(
      concat([
        DOMAIN_TYPE_HASH,
        encStr(d.name),
        encStr(d.version),
        encU256(BigInt(d.chainId)),
        encAddr(d.verifyingContract),
      ]),
    ),
  );

  const fields = typed.types[typed.primaryType];
  if (!fields) throw new Error(`no types for primaryType ${typed.primaryType}`);
  const typeString = `${typed.primaryType}(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`;
  const messageHash = toHex(
    keccak_256(
      concat([
        keccak_256(TE.encode(typeString)),
        ...fields.map((f) => encodeField(f.type, typed.message[f.name])),
      ]),
    ),
  );

  const signingHash = toHex(
    keccak_256(concat([new Uint8Array([0x19, 0x01]), fromHex(domainHash), fromHex(messageHash)])),
  );

  return { domainHash, messageHash, signingHash };
}
