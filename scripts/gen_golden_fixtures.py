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
)


def signing_hash_from_typed(typed: dict) -> bytes:
    domain_hash = encode_typed_data.hash_domain(typed["domain"])
    message_types = {k: v for k, v in typed["types"].items() if k != "EIP712Domain"}
    message_hash = encode_typed_data.hash_eip712_message(message_types, typed["message"])
    signing_hash = keccak(b"\x19\x01" + domain_hash + message_hash)
    return domain_hash, message_hash, signing_hash


# Diverse `validatorL1Vote` actions — outcome (`O`), delisting (`D`), and a
# couple of "unknown variant" cases to verify pass-through. NO real publisher
# payloads here (privacy + freshness); only synthetic shapes that stress key
# order, nesting, unicode, and large integers.
BASE_ACTIONS = [
    {"type": "validatorL1Vote", "D": "test"},
    {"type": "validatorL1Vote", "D": "BTC"},
    {"type": "validatorL1Vote", "D": ""},
    {"type": "validatorL1Vote", "D": "한글-id-😀"},
    # Outcome — register-token style nest
    {
        "type": "validatorL1Vote",
        "O": {
            "registerTokensAndStandaloneOutcome": {
                "quoteToken": 0,
                "nameAndDescription": ["title", "description"],
                "sideNames": ["yes", "no"],
            }
        },
    },
    # Outcome — settle style
    {"type": "validatorL1Vote", "O": {"settle": {"outcomeId": 7, "side": 1}}},
    # Outcome — deep nesting
    {"type": "validatorL1Vote", "O": {"a": {"b": {"c": {"d": [1, 2, 3]}}}}},
    # Mixed types
    {"type": "validatorL1Vote", "O": {"flag": True, "n": 0, "x": None, "list": []}},
    # Numbers — integers must remain int in msgpack
    {"type": "validatorL1Vote", "O": {"big": 4503599627370495}},
    # Unknown variant — future-proofing
    {"type": "validatorL1Vote", "X": {"foo": "bar"}},
    {"type": "validatorL1Vote", "Y": [1, 2, 3]},
    # Insertion-order sensitive — type first, then D
    {"type": "validatorL1Vote", "D": "order-test-a"},
    # Empty inner object
    {"type": "validatorL1Vote", "O": {}},
]

NONCES = [1, 1_000_000, 1_716_530_000_000, 1_999_999_999_999, 0xFFFFFFFFFFFFFFFF]


def gen() -> list[dict]:
    rows: list[dict] = []
    label_seq = 0
    # Cartesian: action × nonce × is_mainnet, capped at 100.
    for action in BASE_ACTIONS:
        for nonce in NONCES:
            for is_mainnet in (False, True):
                if len(rows) >= 100:
                    break
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
            if len(rows) >= 100:
                break
        if len(rows) >= 100:
            break
    return rows


def main() -> int:
    out_path = THIS_DIR.parent / "tests" / "golden" / "fixtures.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows = gen()
    with out_path.open("w") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"wrote {len(rows)} fixtures to {out_path}")
    # checksum for traceability
    digest = hashlib.sha256(json.dumps(rows, sort_keys=False).encode("utf-8")).hexdigest()
    print(f"sha256(payload): {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
