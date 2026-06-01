#!/usr/bin/env python3
"""
Generate golden fixtures matching the Python SDK's signing behavior.

Output: tests/golden/fixtures.json (list of 100 rows).

Each row contains:
    {
        "label": "...",
        "is_mainnet": bool,
        "nonce": int,
        "action": <object>,
        "msgpack_hex": "0x...",
        "action_hash": "0x...",
        "domain_hash": "0x...",
        "message_hash": "0x...",
        "signing_hash": "0x...",
        "typed_data": <object>
    }

The TS golden test (tests/golden/golden.test.ts) re-runs the equivalent TS
functions against `action` + `nonce` + `is_mainnet` and asserts byte-exact
equality on the four hash fields and on msgpack_hex.

Run:
    cd hl-vote-web
    make golden-gen
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import msgpack
from eth_account._utils import encode_typed_data
from eth_utils import keccak

# Make the local sibling SDK importable (no install required for examples).
THIS_DIR = Path(__file__).resolve().parent
SDK_DIR = THIS_DIR.parent.parent / "hyperliquid-python-sdk"
if SDK_DIR.exists():
    sys.path.insert(0, str(SDK_DIR))

from hyperliquid.utils.signing import (  # noqa: E402
    action_hash,
    construct_phantom_agent,
    l1_payload,
    user_signed_payload,
    MULTI_SIG_ENVELOPE_SIGN_TYPES,
    CONVERT_TO_MULTI_SIG_USER_SIGN_TYPES,
)


def signing_hash_from_typed(typed: dict) -> bytes:
    domain_hash = encode_typed_data.hash_domain(typed["domain"])
    message_types = {k: v for k, v in typed["types"].items() if k != "EIP712Domain"}
    message_hash = encode_typed_data.hash_eip712_message(message_types, typed["message"])
    signing_hash = keccak(b"\x19\x01" + domain_hash + message_hash)
    return domain_hash, message_hash, signing_hash


# Real-shape `validatorL1Vote` templates (field-accurate inner shapes taken from
# public on-chain mainnet outcome markets / app.hyperliquid.xyz) PLUS synthetic
# stress shapes. The real ones guarantee that the actual inner shapes — long
# unicode `details`/`nameAndDescription`, `metadata=` inline tags, large int
# arrays — serialize byte-exact to the Python SDK (1-byte drift = a different,
# slashing-unsafe action). No live/private payloads; only public examples.
_CL_DEPLOY_DESC = (
    "The market resolves to PSG if UEFA officially crowns Paris Saint-Germain as champion "
    "of the 2025-26 UEFA Champions League. The market resolves to Arsenal if UEFA officially "
    "crowns Arsenal as champion of the 2025-26 UEFA Champions League. Match results after "
    "regular time, extra time, and penalties, if applicable, are all valid for resolution "
    "purposes. If UEFA crowns either listed club as champion without a completed final match, "
    "including but not limited to following abandonment, walkover, forfeit, disqualification, "
    "or administrative decision, the market resolves for that club accordingly. If the final "
    "is postponed or delayed, the rescheduled final will be used, provided UEFA officially "
    "crowns a champion by July 1, 2026 at 23:59 UTC. The market resolves to 0.5 if: (a) UEFA "
    "cancels the 2025-26 UEFA Champions League, (b) UEFA declares no champion, (c) UEFA crowns "
    "a club other than PSG or Arsenal as champion, (d) UEFA declares any clubs as co-champions, "
    "or (e) UEFA has not officially crowned a champion by July 1, 2026 at 23:59 UTC. UEFA is the "
    "primary resolution source, although independent reputable news sources may be used as "
    "fallback sources if UEFA has not published the relevant result. Once resolved, subsequent "
    "appeals, corrections, reversals, or champion reassignments by UEFA or any other body will "
    "not affect the market resolution. metadata=category:sports|subCategory:football"
)
_CL_SETTLE_DETAILS = (
    "UEFA crowned Paris Saint-Germain as champion of the 2025-26 UEFA Champions League after "
    "PSG and Arsenal drew 1-1 and PSG prevailed 4-3 in the penalty shootout in the final at the "
    "Puskas Arena in Budapest on May 30, 2026."
)
BASE_ACTIONS = [
    # --- real settle (binary outcome) — mainnet CL + testnet "No Change" ---
    {"type": "validatorL1Vote", "O": {"settleOutcome": {"outcome": 110, "settleFraction": "1", "details": _CL_SETTLE_DETAILS}}},
    {"type": "validatorL1Vote", "O": {"settleOutcome": {"outcome": 10205, "settleFraction": "0", "details": "Resolved to No Change (testnet-only)"}}},
    # --- real deploy (standalone binary outcome) — long unicode + metadata tag ---
    {"type": "validatorL1Vote", "O": {"registerTokensAndStandaloneOutcome": {"quoteToken": 0, "nameAndDescription": ["Champions League Winner", _CL_DEPLOY_DESC], "sideNames": ["PSG", "Arsenal"]}}},
    # --- deploy (multi-option question) — stresses a large int array (49 named) ---
    {"type": "validatorL1Vote", "O": {"registerTokensAndQuestion": {"quoteToken": 0, "nameAndDescription": ["2026 World Cup champion", "Resolves Yes to the listed team officially declared champion. metadata=category:sports|subCategory:football"], "fallbackOutcome": 10231, "namedOutcomes": list(range(10232, 10281))}}},
    # --- delisting ---
    {"type": "validatorL1Vote", "D": "test"},
    {"type": "validatorL1Vote", "D": "BTC"},
    {"type": "validatorL1Vote", "D": ""},
    {"type": "validatorL1Vote", "D": "한글-id-😀"},
    # --- synthetic stress (nesting / mixed / big int / unknown / empty) ---
    {"type": "validatorL1Vote", "O": {"a": {"b": {"c": {"d": [1, 2, 3]}}}}},
    {"type": "validatorL1Vote", "O": {"flag": True, "n": 0, "x": None, "list": []}},
    {"type": "validatorL1Vote", "O": {"big": 4503599627370495}},
    {"type": "validatorL1Vote", "X": {"foo": "bar"}},
    {"type": "validatorL1Vote", "Y": [1, 2, 3]},
    {"type": "validatorL1Vote", "O": {}},
]

NONCES = [1, 1_000_000, 1_716_530_000_000, 1_999_999_999_999, 0xFFFFFFFFFFFFFFFF]


def gen() -> list[dict]:
    rows: list[dict] = []
    label_seq = 0
    # Full cartesian: every action × nonce × is_mainnet — guarantees every
    # inner shape is covered (test asserts >= 50; this yields ~140 rows).
    for action in BASE_ACTIONS:
        for nonce in NONCES:
            for is_mainnet in (False, True):
                label_seq += 1
                packed = msgpack.packb(action)
                digest = action_hash(action, None, nonce, None)
                pa = construct_phantom_agent(digest, is_mainnet)
                typed = l1_payload(pa)
                domain_hash, message_hash, signing_hash = signing_hash_from_typed(typed)
                # Re-serialize typed for JSON — connectionId is bytes.
                typed_json = json.loads(
                    json.dumps(typed, default=lambda b: "0x" + b.hex() if isinstance(b, (bytes, bytearray)) else b)
                )
                rows.append(
                    {
                        "label": f"row-{label_seq:03d}",
                        "is_mainnet": is_mainnet,
                        # Nonce is a decimal string to survive JSON load in JS
                        # (Number.MAX_SAFE_INTEGER < u64 max). Both Python and
                        # TS callers wrap this with int()/BigInt() respectively.
                        "nonce": str(nonce),
                        "action": action,
                        "msgpack_hex": "0x" + packed.hex(),
                        "action_hash": "0x" + digest.hex(),
                        "domain_hash": "0x" + domain_hash.hex(),
                        "message_hash": "0x" + message_hash.hex(),
                        "signing_hash": "0x" + signing_hash.hex(),
                        "typed_data": typed_json,
                    }
                )
    return rows


# --- G-2 multi-sig fixtures (scheme A cosign + scheme B SendMultiSig/Convert) ---

_MSU = "0x0000000000000000000000000000000000000005"
_OUTER = "0x176c00000000000000000000000000000000dcab"
_MS_INNER = [
    {"type": "validatorL1Vote", "D": "BTC"},
    {"type": "validatorL1Vote", "O": {"settleOutcome": {"outcome": 110, "settleFraction": "1", "details": "PSG"}}},
]
_MS_NONCES = [1, 1_780_000_000_000]
_SAMPLE_SIGS = [{"r": "0x" + "11" * 32, "s": "0x" + "22" * 32, "v": 27}]
_AUTHORIZED = [
    "0x000000000000000000000000000000000000000a",
    "0x0000000000000000000000000000000000000003",
]


def _user_signed_hashes(primary_type, sign_types, message, is_mainnet):
    msg = dict(message)
    msg["signatureChainId"] = "0x66eee"
    msg["hyperliquidChain"] = "Mainnet" if is_mainnet else "Testnet"
    typed = user_signed_payload(primary_type, sign_types, msg)
    return signing_hash_from_typed(typed)


def gen_multisig() -> list[dict]:
    rows: list[dict] = []
    seq = 0
    for is_mainnet in (False, True):
        for nonce in _MS_NONCES:
            # cosign — scheme A (Agent / chainId 1337) over the [msu, outer, action] envelope
            for inner in _MS_INNER:
                seq += 1
                envelope = [_MSU.lower(), _OUTER.lower(), inner]
                digest = action_hash(envelope, None, nonce, None)
                dh, mh, sh = signing_hash_from_typed(l1_payload(construct_phantom_agent(digest, is_mainnet)))
                rows.append({
                    "label": f"ms-cosign-{seq:03d}", "kind": "cosign", "is_mainnet": is_mainnet,
                    "nonce": str(nonce), "multiSigUser": _MSU, "outerSigner": _OUTER, "action": inner,
                    "envelope_msgpack_hex": "0x" + msgpack.packb(envelope).hex(),
                    "action_hash": "0x" + digest.hex(),
                    "domain_hash": "0x" + dh.hex(), "message_hash": "0x" + mh.hex(), "signing_hash": "0x" + sh.hex(),
                })
            # SendMultiSig — scheme B (user-signed) over the multiSig action
            seq += 1
            msa = {
                "type": "multiSig", "signatureChainId": "0x66eee", "signatures": _SAMPLE_SIGS,
                "payload": {"multiSigUser": _MSU.lower(), "outerSigner": _OUTER.lower(), "action": _MS_INNER[0]},
            }
            without_tag = {k: v for k, v in msa.items() if k != "type"}
            msah = action_hash(without_tag, None, nonce, None)
            dh, mh, sh = _user_signed_hashes(
                "HyperliquidTransaction:SendMultiSig", MULTI_SIG_ENVELOPE_SIGN_TYPES,
                {"multiSigActionHash": msah, "nonce": nonce}, is_mainnet,
            )
            rows.append({
                "label": f"ms-send-{seq:03d}", "kind": "sendMultiSig", "is_mainnet": is_mainnet,
                "nonce": str(nonce), "multiSigUser": _MSU, "outerSigner": _OUTER, "action": _MS_INNER[0],
                "signatures": _SAMPLE_SIGS, "multi_sig_action_hash": "0x" + msah.hex(),
                "domain_hash": "0x" + dh.hex(), "message_hash": "0x" + mh.hex(), "signing_hash": "0x" + sh.hex(),
            })
            # ConvertToMultiSigUser — scheme B
            seq += 1
            signers_json = json.dumps({"authorizedUsers": sorted(_AUTHORIZED), "threshold": 2})
            dh, mh, sh = _user_signed_hashes(
                "HyperliquidTransaction:ConvertToMultiSigUser", CONVERT_TO_MULTI_SIG_USER_SIGN_TYPES,
                {"signers": signers_json, "nonce": nonce}, is_mainnet,
            )
            rows.append({
                "label": f"ms-convert-{seq:03d}", "kind": "convert", "is_mainnet": is_mainnet,
                "nonce": str(nonce), "authorizedUsers": _AUTHORIZED, "threshold": 2, "signers": signers_json,
                "domain_hash": "0x" + dh.hex(), "message_hash": "0x" + mh.hex(), "signing_hash": "0x" + sh.hex(),
            })
    return rows


def main() -> int:
    out_path = THIS_DIR.parent / "tests" / "golden" / "fixtures.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows = gen()
    with out_path.open("w") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"wrote {len(rows)} fixtures to {out_path}")
    digest = hashlib.sha256(json.dumps(rows, sort_keys=False).encode("utf-8")).hexdigest()
    print(f"sha256(payload): {digest}")

    ms_path = THIS_DIR.parent / "tests" / "golden" / "multisig-fixtures.json"
    ms_rows = gen_multisig()
    with ms_path.open("w") as f:
        json.dump(ms_rows, f, indent=2, ensure_ascii=False)
    print(f"wrote {len(ms_rows)} multisig fixtures to {ms_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
