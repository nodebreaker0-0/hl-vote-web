# hl-vote-web — Hyperliquid 엔드포인트 레퍼런스

> hl-vote-web은 **백엔드가 없다**. 모든 데이터는 Hyperliquid 공식 노드 API를 브라우저에서 직접 호출해 얻고, 서명한 액션도 같은 API로 직접 POST한다. 따라서 이 문서가 곧 "데이터 소스 전체 목록"이다.
> CSP `connect-src` allow-list = 아래 두 host 뿐 (Constitution III/IV). 다른 origin fetch는 게이트 fail.

## Base URLs

| 환경 | Base |
|---|---|
| Mainnet | `https://api.hyperliquid.xyz` |
| Testnet | `https://api.hyperliquid-testnet.xyz` |

- 읽기(상태 조회): `POST {base}/info`
- 쓰기(액션 제출): `POST {base}/exchange`
- 둘 다 `Content-Type: application/json`. Mainnet `/exchange`는 빌드 플래그 `NEXT_PUBLIC_MAINNET_ENABLED=true`일 때만 활성(이중 가드).

---

## 1. `/info` — read-only 상태 조회

### 1.1 `validatorL1Votes` — 진행 중 거버넌스 vote 목록
- **요청**: `{"type":"validatorL1Votes"}`
- **응답**: `[{ expireTime, action, votes: ["0x.."], quorumReached }]`
  - `action` = `validatorL1Vote`의 **inner shape만** (`{O:{...}}` 또는 `{D:"..."}`). wrapper 없음.
  - `votes` = 이미 투표한 **signer 주소** 목록.
  - `quorumReached` = HF가 직접 판정한 통과 여부(권위값).
- **용도**: Pending votes 패널(`components/VoteStatus.tsx`) — 무엇이 투표 대기 중인지, 누가 투표했는지, "Vote on this"로 signer에 로드.
- **코드**: `lib/api.ts` `fetchValidatorL1Votes()`.
- **curl(검증용)**: `curl -X POST -H "Content-Type: application/json" --data '{"type":"validatorL1Votes"}' https://api.hyperliquid.xyz/info | jq .`

### 1.2 `validatorSummaries` — validator 메타데이터 + stake
- **요청**: `{"type":"validatorSummaries"}`
- **응답**: `[{ validator, signer, name, description, nRecentBlocks, stake, isJailed, unjailableAfter, isActive, commission, stats }]`
  - `validator` = governance 주소(votes[]에 등장). `signer` = L1 서명 주소(운영자 지갑).
  - `stake` = 정족수(quorum) 계산의 **stake 분모/분자** 소스.
- **용도**: validator 이름 매핑, signer↔governance 변환(`governanceForSignerAccount`), **quorum stake 비율 계산**, 내 지갑이 active validator인지 판정.
- **코드**: `lib/api.ts` `fetchValidatorSummaries()` → `lib/validators.ts` `buildValidatorIndex()` / `splitVoters()`.
- **curl**: `curl -X POST -H "Content-Type: application/json" --data '{"type":"validatorSummaries"}' https://api.hyperliquid.xyz/info | jq .`

### 1.3 `outcomeMeta` — outcome id ↔ 이름/사이드 (⏳ G-1 예정)
- **요청**: `{"type":"outcomeMeta"}`
- **용도**: settle/deploy 액션의 `outcome` id와 `sideSpecs` index를 마켓명·side명으로 **결정론 decode**(LLM 아님) — validator가 가장 흔히 실수하는 지점이라 서명 전 확인용. G-1에서 구현(ActionSummary + localStorage 캐시).

### 1.4 `userToMultiSigSigners` — 멀티시그 서명자/threshold (⏳ G-2 예정)
- **요청**: `{"type":"userToMultiSigSigners","user":"0x.."}`
- **용도**: validator 주소가 multisig일 때 authorizedUsers + threshold 조회. 멀티시그 vote 서명 기능. 아직 미구현.

---

## 2. `/exchange` — 서명한 액션 제출 (write)

- **요청 body**: `{ action, nonce, signature: {r,s,v}, vaultAddress: null, expiresAfter: null }`
  - `action` = 사용자가 붙여넣은 `validatorL1Vote` **원문 그대로**(msgpack insertion order 보존, 절대 mutate 금지 — 슬래싱 가드).
- **용도**: MetaMask/Ledger로 서명한 vote 제출. (멀티시그는 `{type:"multiSig", payload:{multiSigUser, outerSigner, action}, signatures}` 래퍼 — G-2.)
- **코드**: `lib/signing/submit.ts` `submitExchange()` (코드 내 유일하게 fetch 허용된 파일).
- **가드**: mainnet은 `NEXT_PUBLIC_MAINNET_ENABLED=true` 빌드에서만.

---

## 3. Quorum 규칙 (variant별로 다름 — UI 정합성의 핵심)

> 출처: Jeff TG 직답. 둘 다 **tentative**(값 변동 가능).

| Variant | inner key | 통과 기준 |
|---|---|---|
| **Outcome** | `O` | **stake ≥ 20% OR count ≥ 50%** of active set (either suffices) |
| **Delisting / 일반 거버넌스** | `D` / 기타 | **2/3 by stake** (count 조건 없음) |

- **STAKE 분모 = `isActive`(jailed 멤버 포함).** **COUNT 분모 = non-jailed active + "투표한" jailed**(투표했으면 active set에 포함 — 분자·분모 양쪽에 더함; 전체 jailed는 안 더해서 testnet의 부풀린 `isActive`≈102 회피). 검증(2026-06-01): outcome **OR** = HF `quorumReached` **메인넷 DIFF 0/8, 테넷 DIFF 1/12**.
- 자체 판정: outcome = stake≥20%(isActive 분모) **OR** count≥50%(non-jailed 분모); delisting/gov = 2/3 stake(isActive 분모). 이걸로 quorum 배지 구동.
- **투표한 jailed validator(예: bob)는 stake·count 양쪽 카운트** (투표 시점엔 active였으니까) → "voted but currently jailed (counted)" 표기. 진짜 inactive(`isActive===false`, 미투표 jailed 포함)는 count에서 제외 → "voted but inactive (excluded)".
- 분모는 모두 **라이브 수**(HF는 vote 생성시점 고정이나 응답에 생성시각 없음 → backend 없이 재구성 불가; 현재 pending은 전부 최근 생성이라 정확).

---

## 4. 메모

- 모든 숫자 필드(특히 `stake`)는 문자열로 올 수 있으니 합산 시 `Number()`로 강제.
- 주소는 비교/서명 전 항상 lowercase(HF signing.md common error #4).
- 이 문서는 새 엔드포인트를 쓰기 시작할 때마다 갱신한다(§1에 한 줄 추가 + 용도 + 코드 위치).
