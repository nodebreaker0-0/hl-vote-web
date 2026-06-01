# Contract — Multi-sig validatorL1Vote signing (G-2)

> **Slashing-grade.** 1 byte drift = a different signed action. Every primitive
> below MUST match the Python SDK byte-for-byte (golden fixture gate) BEFORE any
> UI or real submit is wired. Source of truth: `../../../hyperliquid-python-sdk/`
> (`hyperliquid/utils/signing.py`, `hyperliquid/exchange.py`).

## 0. Why

Some validators run a multisig on their validator address and want to vote with
it (operator feedback, 2026-05). Multisig is an existing HL protocol feature, so
hl-vote-web can support it without waiting on signer-key support. Threshold
co-signers each sign the inner `validatorL1Vote`; one "transaction lead"
(outerSigner) bundles the signatures and submits.

## 1. Two signing schemes (CRITICAL distinction)

hl-vote-web today only does **scheme A**. Multisig needs **both**:

| | Scheme A — L1 action (existing) | Scheme B — user-signed (NEW) |
|---|---|---|
| domain.name | `Exchange` | `HyperliquidSignTransaction` |
| domain.chainId | `1337` (phantom) | `int("0x66eee")` = 421614 |
| domain.verifyingContract | `0x0…0` | `0x0…0` |
| primaryType | `Agent` | `HyperliquidTransaction:<X>` |
| hash basis | `action_hash(action,vault,nonce,expires)` → phantomAgent | fields signed directly |
| used by | cosigner inner-action sig | outer `SendMultiSig`, `ConvertToMultiSigUser` |

`action_hash(x, vault, nonce, expires)` = `keccak( msgpack(x) ++ nonce(8B BE) ++ (0x00 | 0x01++vault) ++ (expires? 0x00++expires(8B BE) : "") )`. Reuse existing `lib/signing`.

## 2. Primitives (byte-exact, from SDK)

### 2.1 Cosigner signs the inner action (scheme A)
`sign_multi_sig_l1_action_payload(wallet, action, isMainnet, vault, nonce, expires, multiSigUser, outerSigner)`:
```
envelope = [ multiSigUser.toLowerCase(), outerSigner.toLowerCase(), action ]   # 3-elem ARRAY
sign_l1_action(envelope, vault, nonce, expires, isMainnet)
  = actionHash(envelope, vault, nonce, expires) → phantomAgent(hash, isMainnet) → l1Payload(Agent) → sign
```
- `nonce` = shared `timestamp` (ms). SAME across all cosigners + the outer submit.
- Each authorized user (or their agent) runs this → one signature.

### 2.2 Submit envelope
```
multiSigAction = {
  "type": "multiSig",
  "signatureChainId": "0x66eee",
  "signatures": [ ...cosigner sigs (r,s,v)... ],
  "payload": { "multiSigUser": <lower>, "outerSigner": <lower>, "action": <innerAction> }
}
```
Insertion order EXACTLY as above (msgpack-sensitive).

### 2.3 Outer signer signs the envelope (scheme B — `SendMultiSig`)
`sign_multi_sig_action(wallet, multiSigAction, isMainnet, vault, nonce, expires)`:
```
actionWithoutTag = { ...multiSigAction } minus "type"   # {signatureChainId, signatures, payload}
multiSigActionHash = actionHash(actionWithoutTag, vault, nonce, expires)
envelope = { "multiSigActionHash": <bytes32>, "nonce": nonce }
sign_user_signed_action(envelope, MULTI_SIG_ENVELOPE_SIGN_TYPES,
                        "HyperliquidTransaction:SendMultiSig", isMainnet)
```
- `sign_user_signed_action` sets `signatureChainId="0x66eee"` + `hyperliquidChain="Mainnet"|"Testnet"` on the message, then EIP-712 over domain `HyperliquidSignTransaction`.
- `MULTI_SIG_ENVELOPE_SIGN_TYPES = [hyperliquidChain(string), multiSigActionHash(bytes32), nonce(uint64)]`.

### 2.4 Convert to / from multisig user (scheme B — `ConvertToMultiSigUser`)
```
authorizedUsers = sorted(authorizedUsers)          # SDK sorts
signers = { "authorizedUsers": authorizedUsers, "threshold": <int> }
action = { "type":"convertToMultiSigUser", "signers": JSON.stringify(signers), "nonce": <ts> }
sign_user_signed_action(action, CONVERT_TO_MULTI_SIG_USER_SIGN_TYPES,
                        "HyperliquidTransaction:ConvertToMultiSigUser", isMainnet)
```
- `CONVERT_TO_MULTI_SIG_USER_SIGN_TYPES = [hyperliquidChain(string), signers(string), nonce(uint64)]`.
- Convert back to normal: `signers` empty / `null` (per SDK `multi_sig_convert_to_normal_user.py`).

### 2.5 Query
`POST /info {"type":"userToMultiSigSigners","user":<addr>}` → `{authorizedUsers, threshold}` (or null if not a multisig user).

## 3. TS surface to add

- `lib/signing/userSigned.ts` (NEW) — `userSignedPayload(primaryType, types, message, isMainnet)` building the `HyperliquidSignTransaction` EIP-712 (chainId 0x66eee). + `typedDataHashes` reuse.
- `lib/signing/multisig.ts` (NEW) —
  - `multiSigEnvelope(multiSigUser, outerSigner, action)` → `[lower,lower,action]`
  - `cosignTypedData(envelope, nonce, isMainnet)` → Agent typed-data for MetaMask
  - `buildMultiSigAction(multiSigUser, outerSigner, action, signatures)`
  - `sendMultiSigTypedData(multiSigAction, nonce, isMainnet)` → SendMultiSig typed-data
  - `convertToMultiSigUserAction(authorizedUsers, threshold, nonce)` + `convertTypedData`
- `lib/api.ts` — `fetchUserToMultiSigSigners(network, user)`.
- consts: `HL_USER_SIGNED_DOMAIN`, the two SIGN_TYPES, `SIGNATURE_CHAIN_ID = '0x66eee'`.

## 4. Golden fixture gate (BEFORE UI)

Extend `scripts/gen_golden_fixtures.py` + `tests/golden`:
- multisig L1 envelope → `actionHash` + Agent domain/message/signing hashes.
- `multiSigAction` → `multiSigActionHash` + SendMultiSig domain/message/signing hashes.
- `convertToMultiSigUser` → ConvertToMultiSigUser domain/message/signing hashes.
- All HASH-level (no private key needed; signature = secp256k1 over signing_hash, already covered).
- TS golden test asserts byte-exact vs SDK. `make verify-golden` must pass (Mac).

## 5. Design decisions (defaults — veto to change)

- **D1 cosigner sig sharing (backend-less)**: copy-paste signature strings. Lead pastes each cosigner's `{r,s,v}` into a list until `threshold` reached, then submits. (No QR/link in v1 — simplest, no deps, cross-machine.)
- **D2 v1 scope**: SIGN + SUBMIT for an *already-multisig* validator (the immediate need). `convertToMultiSigUser` setup flow = follow-up phase.
- **D3 reuse**: cosigner inner-action signing reuses existing `lib/signing` (actionHash/phantomAgent/l1Payload). Only scheme B (user-signed) is new code.

## 6. Guards

- All addresses lowercased before signing (SDK common error #4).
- msgpack insertion order preserved for envelope array + inner action + multiSig payload.
- nonce identical across cosigners + outer submit.
- onchain submit (multiSig) = Block-tier (operator clicks; mainnet gated by build flag).
- No private key / mnemonic input (Constitution IV) — sigs come from MetaMask/Ledger only.
