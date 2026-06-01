// Multi-sig golden parity (G-2) — Constitution VI, slashing-grade.
//
// Reads tests/golden/multisig-fixtures.json (from gen_golden_fixtures.py against
// the Python SDK) and asserts the TS multisig pipeline is byte-exact:
//   - cosign (scheme A / Agent): envelope msgpack + actionHash + domain/message/signing
//   - SendMultiSig (scheme B / user-signed): multiSigActionHash + the 3 hashes
//   - ConvertToMultiSigUser (scheme B): signers string + the 3 hashes
// Any mismatch = signing drift; STOP and reconcile before wiring multisig UI.
//
// Fixtures are shaped per `kind` by the Python generator; the `!` assertions
// below are safe because each branch only touches fields its kind populates.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  serialize,
  toHex,
  actionHash,
  typedDataHashes,
  multiSigEnvelope,
  cosignTypedData,
  buildMultiSigAction,
  sendMultiSigTypedData,
  convertToMultiSigUserAction,
  convertTypedData,
  userSignedHashes,
} from '../../lib/signing';
import type { Hex } from '../../lib/signing/types';

interface MsFixture {
  label: string;
  kind: 'cosign' | 'sendMultiSig' | 'convert';
  is_mainnet: boolean;
  nonce: string;
  multiSigUser?: Hex;
  outerSigner?: Hex;
  action?: object;
  envelope_msgpack_hex?: Hex;
  action_hash?: Hex;
  multi_sig_action_hash?: Hex;
  signatures?: unknown[];
  authorizedUsers?: string[];
  threshold?: number;
  signers?: string;
  domain_hash: Hex;
  message_hash: Hex;
  signing_hash: Hex;
}

const FIX = path.resolve(__dirname, 'multisig-fixtures.json');
const avail = fs.existsSync(FIX);
const fixtures: MsFixture[] = avail ? (JSON.parse(fs.readFileSync(FIX, 'utf-8')) as MsFixture[]) : [];

describe.runIf(avail)('multisig golden (Python SDK parity)', () => {
  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  it.each(fixtures)('$label', (fx) => {
    const nonce = BigInt(fx.nonce);

    if (fx.kind === 'cosign') {
      const env = multiSigEnvelope(fx.multiSigUser!, fx.outerSigner!, fx.action!);
      expect(toHex(serialize(env))).toBe(fx.envelope_msgpack_hex);
      expect(actionHash(env, nonce, null, null)).toBe(fx.action_hash);
      const h = typedDataHashes(cosignTypedData(env, nonce, fx.is_mainnet));
      expect(h.domainHash).toBe(fx.domain_hash);
      expect(h.messageHash).toBe(fx.message_hash);
      expect(h.signingHash).toBe(fx.signing_hash);
    } else if (fx.kind === 'sendMultiSig') {
      const msa = buildMultiSigAction(
        fx.multiSigUser!,
        fx.outerSigner!,
        fx.action!,
        fx.signatures ?? [],
      );
      const typed = sendMultiSigTypedData(msa, nonce, fx.is_mainnet);
      expect(typed.message.multiSigActionHash).toBe(fx.multi_sig_action_hash);
      const h = userSignedHashes(typed);
      expect(h.domainHash).toBe(fx.domain_hash);
      expect(h.messageHash).toBe(fx.message_hash);
      expect(h.signingHash).toBe(fx.signing_hash);
    } else {
      const act = convertToMultiSigUserAction(fx.authorizedUsers!, fx.threshold!, nonce);
      expect(act.signers).toBe(fx.signers);
      const h = userSignedHashes(convertTypedData(act, fx.is_mainnet));
      expect(h.domainHash).toBe(fx.domain_hash);
      expect(h.messageHash).toBe(fx.message_hash);
      expect(h.signingHash).toBe(fx.signing_hash);
    }
  });
});

describe.runIf(!avail)('multisig golden (skipped — file missing)', () => {
  it('run `make golden-gen` first', () => {
    expect(avail).toBe(false);
  });
});
