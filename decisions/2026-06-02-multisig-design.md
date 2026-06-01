# Multi-sig signing (G-2) — design decisions

**Date**: 2026-06-02
**Context**: G-2 — add multisig validatorL1Vote signing to hl-vote-web (backend-less,
slashing-grade). Spec: `specs/001-hl-vote-web/contracts/multisig-signing.md`.

## D1 — cosigner signature sharing (backend-less)
**Options**: (a) copy-paste signature strings; (b) QR codes; (c) shareable URL/link.
**Decision**: (a) copy-paste.
**Why**: no backend (Constitution), no extra deps, works cross-machine. Each cosigner
signs locally (MetaMask/Ledger), copies their `{r,s,v}`; the transaction lead pastes
each into a list until threshold, then submits. QR/link = optional later polish.
**Backport**: tasks.md MS-030.

## D2 — v1 scope
**Options**: (i) sign + submit for an already-multisig validator; (ii) also include
`convertToMultiSigUser` setup/teardown.
**Decision**: (i) for v1; convert flow = MS-040 follow-up.
**Why**: the immediate operator need is voting from a validator that is *already* a
multisig user. Conversion is a rarer setup action. Smaller v1 = faster, lower risk.
**Backport**: tasks.md MS-040 (deferred).

## D3 — reuse vs new signing code
**Decision**: cosigner inner-action signing REUSES existing `lib/signing`
(actionHash/phantomAgent/l1Payload, scheme A). Only the user-signed scheme B
(`HyperliquidSignTransaction`, chainId 0x66eee) for `SendMultiSig` /
`ConvertToMultiSigUser` is new code → new golden fixtures mandatory before use.
**Why**: minimize new slashing-grade crypto surface; gate the new scheme with golden parity.
**Backport**: tasks.md MS-002 (new), MS-001/MS-020 (golden gate).

## Gate
GOLDEN FIRST — MS-020 (TS == Python SDK byte-exact for envelope / SendMultiSig /
ConvertToMultiSigUser hashes) MUST pass on Mac (`make verify-golden`) before MS-030 UI
or any real submit. Onchain submit stays Block-tier (operator clicks; mainnet build-flag gated).
