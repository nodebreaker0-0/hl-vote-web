// Golden fixture parity test — Constitution VI.
//
// Reads tests/golden/fixtures.json (produced by scripts/gen_golden_fixtures.py
// against the Python SDK) and asserts that the TS signing pipeline produces
// byte-exact equal:
//   - msgpack(action)
//   - action_hash(action, nonce, null, null)
//   - domain_hash / message_hash / signing_hash for the EIP-712 typed-data
//
// If this file's expect() fails on any row, signing has drifted and any
// production sign would be slashing-unsafe. STOP work and reconcile.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  serialize,
  toHex,
  actionHash,
  phantomAgent,
  l1Payload,
  typedDataHashes,
} from '../../lib/signing';
import type { Hex } from '../../lib/signing/types';

interface Fixture {
  label: string;
  is_mainnet: boolean;
  nonce: string; // decimal string — see gen_golden_fixtures.py
  action: object;
  msgpack_hex: Hex;
  action_hash: Hex;
  domain_hash: Hex;
  message_hash: Hex;
  signing_hash: Hex;
}

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures.json');

const fixturesAvailable = fs.existsSync(FIXTURE_PATH);
const fixtures: Fixture[] = fixturesAvailable
  ? (JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8')) as Fixture[])
  : [];

describe.runIf(fixturesAvailable)('golden fixtures (Python SDK parity)', () => {
  it('has at least 50 fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(50);
  });

  it.each(fixtures)('$label — msgpack + hashes match', (fx) => {
    // 1. msgpack
    expect(toHex(serialize(fx.action))).toBe(fx.msgpack_hex);

    // 2. action_hash
    const ah = actionHash(fx.action, BigInt(fx.nonce), null, null);
    expect(ah).toBe(fx.action_hash);

    // 3. EIP-712 hashes
    const pa = phantomAgent(ah, fx.is_mainnet);
    const typed = l1Payload(pa);
    const h = typedDataHashes(typed);
    expect(h.domainHash).toBe(fx.domain_hash);
    expect(h.messageHash).toBe(fx.message_hash);
    expect(h.signingHash).toBe(fx.signing_hash);
  });
});

describe.runIf(!fixturesAvailable)('golden fixtures (skipped — file missing)', () => {
  it('placeholder — run `make golden-gen` first', () => {
    expect(fixturesAvailable).toBe(false);
  });
});
