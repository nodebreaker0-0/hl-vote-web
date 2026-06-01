import { describe, it, expect } from 'vitest';
import {
  parseRequest,
  serializeRequest,
  parseCosigs,
  serializeCosig,
  isAddress,
  type MultiSigRequest,
  type CosignerSig,
} from './multisigSession';

const REQ: MultiSigRequest = {
  v: 1,
  network: 'testnet',
  multiSigUser: '0x000000000000000000000000000000000000000a',
  outerSigner: '0x0000000000000000000000000000000000000003',
  nonce: '1717200000000',
  action: { type: 'validatorL1Vote', O: { o: 1, s: 0 } },
};

describe('multisigSession.parseRequest', () => {
  it('round-trips a valid request', () => {
    expect(parseRequest(serializeRequest(REQ))).toEqual(REQ);
  });

  it('lowercases addresses', () => {
    const r = parseRequest(
      JSON.stringify({ ...REQ, multiSigUser: '0x000000000000000000000000000000000000000A' }),
    );
    expect(r.multiSigUser).toBe('0x000000000000000000000000000000000000000a');
  });

  it.each([
    ['bad network', { ...REQ, network: 'devnet' }],
    ['bad multiSigUser', { ...REQ, multiSigUser: '0x123' }],
    ['numeric nonce', { ...REQ, nonce: 123 }],
    ['wrong action type', { ...REQ, action: { type: 'order' } }],
  ])('rejects %s', (_label, bad) => {
    expect(() => parseRequest(JSON.stringify(bad))).toThrow();
  });

  it('rejects non-JSON', () => {
    expect(() => parseRequest('not json')).toThrow('Not valid JSON.');
  });
});

describe('multisigSession.parseCosigs', () => {
  const sig: CosignerSig = {
    signer: '0x0000000000000000000000000000000000000003',
    r: '0x' + '11'.repeat(32),
    s: '0x' + '22'.repeat(32),
    v: 27,
  } as CosignerSig;

  it('parses a single object', () => {
    expect(parseCosigs(serializeCosig(sig))).toEqual([sig]);
  });

  it('parses a JSON array', () => {
    expect(parseCosigs(JSON.stringify([sig]))).toEqual([sig]);
  });

  it('parses newline-delimited objects', () => {
    const two = { ...sig, signer: '0x0000000000000000000000000000000000000004' } as CosignerSig;
    const out = parseCosigs(`${serializeCosig(sig)}\n${serializeCosig(two)}`);
    expect(out).toHaveLength(2);
  });

  it('dedupes by signer (keeps last)', () => {
    const dup = { ...sig, r: ('0x' + '33'.repeat(32)) as `0x${string}` };
    const out = parseCosigs(JSON.stringify([sig, dup]));
    expect(out).toHaveLength(1);
    expect(out[0]?.r).toBe('0x' + '33'.repeat(32));
  });

  it('empty → []', () => {
    expect(parseCosigs('   ')).toEqual([]);
  });

  it.each([
    ['bad signer', { ...sig, signer: 'nope' }],
    ['short r', { ...sig, r: '0x12' }],
    ['float v', { ...sig, v: 1.5 }],
  ])('rejects %s', (_label, bad) => {
    expect(() => parseCosigs(JSON.stringify(bad))).toThrow();
  });
});

describe('multisigSession.isAddress', () => {
  it('accepts 20-byte hex, rejects others', () => {
    expect(isAddress('0x' + 'ab'.repeat(20))).toBe(true);
    expect(isAddress('0x12')).toBe(false);
    expect(isAddress(42)).toBe(false);
  });
});
