# hl-vote-web

Hyperliquid `validatorL1Vote` (outcome / delisting / future variants) signer — a static SPA.

- **No backend.** Everything runs in the browser. Hostable on GitHub Pages, IPFS, or `file://`.
- **MetaMask or Ledger Nano (WebHID).** Keys never leave your wallet / device.
- **Paste-and-sign.** Take the JSON `validator-publisher` posts to Slack, paste it here, sign, submit. No field is reordered, mutated, or added — slashing-safe by construction.

> Status: Tier 0 skeleton (2026-05-24). Tier 1 (Ledger) and Tier 2 (mainnet) gated by `CHARTER.md §7`.

---

## Quickstart (operator)

Prereqs: Chromium-based browser (Chrome / Edge / Brave), MetaMask extension, optionally a Ledger Nano with the Ethereum app + Blind signing enabled.

```bash
make install       # npm ci --ignore-scripts
make verify        # 7 gates (lint / typecheck / test / golden / build / constitution / bundle-size)
make build         # static export → out/
npx serve out/     # local serve
```

Then in the browser:

1. Pick **Network** — Testnet (yellow) or Mainnet (red; only if built with `NEXT_PUBLIC_MAINNET_ENABLED=true`).
2. Paste the action JSON from `validator-publisher` Slack (e.g. `outcome_actions_channel`). Both `O`-shape (outcome) and `D`-shape (delisting) and any future `validatorL1Vote` variant work — identical flow.
3. Review the summary, `action_hash`, EIP-712 typed-data, and domain/message/signing hashes.
4. Choose **MetaMask** or **Ledger**. For Ledger: confirm derivation path, then on the next sign click match the device-screen domain & message hash with the modal.
5. **Sign + Submit.** The response from `https://api.hyperliquid(-testnet)?.xyz/exchange` is shown verbatim.

The result is written to `localStorage.hlVoteHistory` keyed by `sha256(msgpack(action))`. Re-submitting the same action triggers a typed-confirm dedup modal — voting twice on the same outcome can be slashable.

## Files

- `CHARTER.md` — why this exists, threat model, Tier gating, mainnet gate.
- `delegation_matrix.md` — agent vs builnad authority split.
- `.specify/memory/constitution.md` — 10 principles enforced by `make verify`.
- `specs/001-hl-vote-web/` — spec, plan, contracts, quickstart, tasks.

## Replaces what?

The current Mac-local Ledger flow is:

```
Mac terminal → cd hyperliquid-python-sdk/examples
             → python3 -m venv .venv && source .venv/bin/activate
             → pip install hyperliquid-python-sdk ledgereth eth-account msgpack
             → edit ledger_outcome_vote.py to paste the action JSON
             → python ledger_outcome_vote.py
             → device confirm
```

`hl-vote-web` replaces every step before the device confirm with a single browser window. Ledger is still plugged into the same Mac via USB; WebHID talks to it directly from the browser.
