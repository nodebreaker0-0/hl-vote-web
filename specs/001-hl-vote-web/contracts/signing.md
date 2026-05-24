# Contract: Signing — TS ↔ Python SDK Parity

> 본 문서는 `lib/signing/` 의 모든 함수가 만족해야 하는 **byte-exact contract** 다.
> Python SDK (`hyperliquid-python-sdk/hyperliquid/utils/signing.py`) 의 동작이 정답이며, TS 구현은 그것과 100% 일치해야 한다.
> Constitution VI 게이트 (`make verify-golden`) 의 입력 명세.

## 1. action 객체 규약

### 1.1 입력 형태

`{"type": "validatorL1Vote", <inner-key>: <inner-value>}` 형태의 JSON. 알려진 inner key 와 예시:

| inner key | 용도 | 예시 |
|---|---|---|
| `O` | Outcome vote (deploy / settle 등) | `{"type":"validatorL1Vote","O":{"registerTokensAndStandaloneOutcome":{...}}}` |
| `D` | Delisting vote | `{"type":"validatorL1Vote","D":"BTC"}` |
| (future) | HF 가 추가하는 모든 inner key | `{"type":"validatorL1Vote","X":{...}}` — 동일 흐름 처리, UI 만 경고 |

### 1.2 보존 규칙

- 키 정렬 X. 사용자 paste 의 insertion order 그대로.
- 숫자 / boolean / null 의 타입 변환 X (예: `0` → `0.0` 변환 금지).
- 문자열의 normalize 금지 (NFC/NFD).
- `undefined` 는 입력 단계에서 거부 (JSON 에 없음).

## 2. `serialize(action)` — ordered msgpack

`lib/signing/serialize.ts`.

### 2.1 시그니처

```ts
export function serialize(action: object): Uint8Array;
```

### 2.2 동작

- `@msgpack/msgpack` 의 `Encoder` 를 사용하되, JS object → msgpack map 변환 시 **`Object.keys(obj)` 의 순서를 그대로** 유지. (JS spec 상 정수가 아닌 string key 는 insertion order 보존.)
- 빌트인 `Encoder({sortKeys: false, ...})` 옵션 명시.
- `null` → msgpack `nil`. boolean → `bool`. number → integer 우선 (정수면 int, 아니면 float64).
- string → UTF-8.
- 중첩 object / array 도 동일 규칙 재귀.

### 2.3 Python 등가

```python
import msgpack
data = msgpack.packb(action)   # Python dict 는 insertion order — 동일 byte 출력
```

### 2.4 Golden criterion

`tests/golden/fixtures.json` 의 각 fixture 에 대해:

```ts
expect(toHex(serialize(fixture.action))).toBe(fixture.msgpack_hex);
```

## 3. `actionHash(action, nonce, vaultAddress, expiresAfter)` — keccak256

`lib/signing/actionHash.ts`.

### 3.1 시그니처

```ts
export function actionHash(
  action: object,
  nonce: bigint,            // ms timestamp
  vaultAddress: `0x${string}` | null,
  expiresAfter: bigint | null,
): `0x${string}`;  // 32 byte hex
```

### 3.2 동작

```
data = serialize(action)
     || nonce.to_bytes(8, 'big')
     || (vaultAddress === null ? 0x00 : 0x01 || addressBytes(vaultAddress))
     || (expiresAfter === null ? <nothing> : 0x00 || expiresAfter.to_bytes(8, 'big'))
return keccak256(data)
```

### 3.3 Python 등가

```python
def action_hash(action, vault_address, nonce, expires_after):
    data = msgpack.packb(action)
    data += nonce.to_bytes(8, "big")
    if vault_address is None:
        data += b"\x00"
    else:
        data += b"\x01"
        data += address_to_bytes(vault_address)
    if expires_after is not None:
        data += b"\x00"
        data += expires_after.to_bytes(8, "big")
    return keccak(data)
```

(Python `signing.py` L174~185.)

### 3.4 Edge

- `vaultAddress` 와 `expiresAfter` 모두 None — validatorL1Vote 의 정상 경로.
- `nonce` 가 `Date.now()` 결과인 number 라면 `BigInt(...)` 변환 후 8B BE.
- `keccak256` 은 Keccak-256 (NOT SHA3-256). viem 의 `keccak256(Uint8Array)` 또는 `@noble/hashes/sha3` 의 `keccak_256`.

### 3.5 Golden criterion

```ts
expect(actionHash(fixture.action, fixture.nonce, null, null)).toBe(fixture.action_hash);
```

## 4. `phantomAgent(actionHash, isMainnet)` — domain spoof

`lib/signing/phantomAgent.ts`.

### 4.1 시그니처

```ts
export function phantomAgent(actionHash: `0x${string}`, isMainnet: boolean): {
  source: 'a' | 'b';
  connectionId: `0x${string}`;
};
```

### 4.2 동작

```
return { source: isMainnet ? 'a' : 'b', connectionId: actionHash };
```

(Python `signing.py` L188~189.)

## 5. `l1Payload(phantomAgent)` — EIP-712 typed data

`lib/signing/l1Payload.ts`.

### 5.1 시그니처

```ts
export interface L1TypedData {
  domain: {
    chainId: 1337;
    name: 'Exchange';
    verifyingContract: '0x0000000000000000000000000000000000000000';
    version: '1';
  };
  types: {
    Agent: [
      { name: 'source'; type: 'string' },
      { name: 'connectionId'; type: 'bytes32' },
    ];
    EIP712Domain: [
      { name: 'name'; type: 'string' },
      { name: 'version'; type: 'string' },
      { name: 'chainId'; type: 'uint256' },
      { name: 'verifyingContract'; type: 'address' },
    ];
  };
  primaryType: 'Agent';
  message: { source: 'a' | 'b'; connectionId: `0x${string}` };
}

export function l1Payload(pa: ReturnType<typeof phantomAgent>): L1TypedData;
```

### 5.2 상수 (절대 변경 X — Constitution III/IV)

- `chainId`: 1337 (number, literal)
- `name`: `"Exchange"`
- `verifyingContract`: `"0x0000000000000000000000000000000000000000"`
- `version`: `"1"`

(Python `signing.py` L192~214.)

## 6. `typedDataHashes(typed)` — Ledger 용 hash 분리

`lib/signing/typedDataHashes.ts`.

### 6.1 시그니처

```ts
export function typedDataHashes(typed: L1TypedData): {
  domainHash: `0x${string}`;       // 32B = hashStruct(EIP712Domain, domain)
  messageHash: `0x${string}`;      // 32B = hashStruct(Agent, message)
  signingHash: `0x${string}`;      // 32B = keccak256(0x1901 || domainHash || messageHash)
};
```

### 6.2 동작

EIP-712 표준 그대로:

- `domainHash = keccak256(typeHash(EIP712Domain) || encodeData(domain))`
- `messageHash = keccak256(typeHash(Agent) || encodeData(message))`
- `signingHash = keccak256(0x1901 || domainHash || messageHash)` — MetaMask 가 사인하는 digest.

`viem` 의 `hashTypedData` / `hashDomain` / `hashStruct` 를 사용.

### 6.3 Python 등가

```python
from eth_account._utils import encode_typed_data
domain_hash = encode_typed_data.hash_domain(typed["domain"])
message_types = {k: v for k, v in typed["types"].items() if k != "EIP712Domain"}
message_hash = encode_typed_data.hash_eip712_message(message_types, typed["message"])
```

(Python `ledger_outcome_vote.py` L29~33.)

### 6.4 Golden criterion

```ts
const h = typedDataHashes(fixture.typed_data);
expect(h.domainHash).toBe(fixture.domain_hash);
expect(h.messageHash).toBe(fixture.message_hash);
expect(h.signingHash).toBe(fixture.signing_hash);
```

## 7. Sign — MetaMask vs Ledger

### 7.1 MetaMask path

- `viem.signTypedData({ ...typed })` 호출.
- 결과는 `0x${130 hex}` 형태. 분리: `r = bytes[0..32]`, `s = bytes[32..64]`, `v = bytes[64]`.
- HF 가 받는 형태: `{ r: hex, s: hex, v: number }`.

### 7.2 Ledger path

- `@ledgerhq/hw-app-eth` 의 `Eth.signEIP712HashedMessage(path, domain_hash, message_hash)`.
- 결과 `{ r: hex, s: hex, v: number }` — 그대로 사용. EIP-155 chainId 가공 X (chainId=1337 phantom, HF 가 v 가공 안 함).

### 7.3 Python 등가

`ledgereth.messages.sign_typed_data_draft(domain_hash, message_hash, sender_path=path)` 가 동일 동작 — Python `ledger_outcome_vote.py` L33.

## 8. Submit — `/exchange` POST

`lib/signing/submit.ts`.

### 8.1 시그니처

```ts
export async function submitExchange(args: {
  network: 'testnet' | 'mainnet';
  action: object;
  nonce: bigint;
  signature: { r: `0x${string}`; s: `0x${string}`; v: number };
}): Promise<unknown>;
```

### 8.2 동작

```
URL = network === 'mainnet'
  ? 'https://api.hyperliquid.xyz/exchange'
  : 'https://api.hyperliquid-testnet.xyz/exchange';

POST URL with body:
{
  action,                                   // 그대로 (msgpack 가 아니라 JSON. HF 측이 직접 msgpack 재계산하여 hash 검증)
  nonce: Number(nonce),                     // wire 는 number
  signature,
  vaultAddress: null,
  expiresAfter: null,
}

Content-Type: application/json
```

### 8.3 응답

JSON. 성공 시 `{ status: "ok", response: {...} }` 또는 비슷. 실패 시 `{ status: "err", ... }` 또는 HTTP 4xx/5xx.

### 8.4 CORS

HF 가 `access-control-allow-origin: *` 응답. 사용자 확인 (2026-05-24). preflight 없는 단순 POST + JSON Content-Type.

## 9. Golden fixture 생성

`scripts/gen_golden_fixtures.py` — Python SDK 호출:

```python
import json, msgpack
from hyperliquid.utils.signing import action_hash, construct_phantom_agent, l1_payload
from eth_account._utils import encode_typed_data

# 100 개의 random/handpicked action 에 대해
for action in actions:
    for nonce in nonces:
        for is_mainnet in [True, False]:
            data = msgpack.packb(action)
            digest = action_hash(action, None, nonce, None)
            pa = construct_phantom_agent(digest, is_mainnet)
            typed = l1_payload(pa)
            domain_hash = encode_typed_data.hash_domain(typed["domain"])
            mt = {k: v for k, v in typed["types"].items() if k != "EIP712Domain"}
            message_hash = encode_typed_data.hash_eip712_message(mt, typed["message"])
            signing_hash = ... # 0x1901 || domain || message → keccak
            fixtures.append({
                "action": action,
                "nonce": nonce,
                "is_mainnet": is_mainnet,
                "msgpack_hex": data.hex(),
                "action_hash": "0x" + digest.hex(),
                "domain_hash": "0x" + domain_hash.hex(),
                "message_hash": "0x" + message_hash.hex(),
                "signing_hash": "0x" + signing_hash.hex(),
                "typed_data": typed,  # JSON serializable
            })
json.dump(fixtures, open("tests/golden/fixtures.json", "w"), indent=2)
```

action 풀:
- `{"type":"validatorL1Vote","D":"test"}` 외 다양한 D 값
- 실제 publisher 가 surface 했던 outcome JSON 30종 (필요 시 anonymize)
- 다양한 nesting 깊이 / key 순서 / 빈 array / unicode 문자 / 큰 정수
- inner key 가 알려지지 않은 임의의 키 (`X`, `Y`) — pass-through 검증

총 100 row. testnet / mainnet 양쪽 모두 포함.

## 10. 변경 정책

본 contract 의 어떤 라인이라도 변경하려면:

1. HF docs (gitbook) 의 해당 페이지 fetch 결과로 근거 첨부.
2. Python SDK 의 `signing.py` 가 동일하게 변경되었음을 확인.
3. golden fixture 100건 모두 재생성 후 TS 코드 매칭.
4. CHARTER §6 의 threat-model 영향 평가.
5. builnad 명시 confirm.

위 5단계 모두 충족 전엔 변경 금지. PR 시 본 문서의 해당 절을 함께 수정.
