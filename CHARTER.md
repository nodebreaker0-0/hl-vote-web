# hl-vote-web — Project Charter

> **Status**: Draft v0.2 — confirmed scope (2026-05-24, builnad)
> **One-line**: Hyperliquid `validatorL1Vote` (outcome / delisting / 향후 변형 전체) 를 MetaMask / Ledger 로 서명·제출하는 정적 SPA.
> 백엔드 0개, 호스팅은 GitHub Pages / IPFS / file:// 어디서나 가능. 키는 디바이스 밖으로 나가지 않는다.

---

## 1. Why this exists

### 1.1 현재 동선 (Mac local — Ledger Nano 케이스)

builnad 의 현재 outcome / delisting vote 동선 (2026-05-24 시점):

1. Slack 의 `outcome_actions_channel` (혹은 governance/delisting 게시판) 에서 publisher 가 surface 한 `validatorL1Vote` action JSON 확인.
2. **로컬 맥에서** 터미널 열기 → `hyperliquid-python-sdk/examples/` 로 cd → `python3 -m venv .venv && source .venv/bin/activate` (혹은 기존 venv 활성).
3. `pip install hyperliquid-python-sdk ledgereth eth-account msgpack` 가 안 깔렸으면 설치.
4. 텍스트 에디터로 `ledger_outcome_vote.py` (혹은 `ledger_validator_l1_vote.py`) 의 `action = {...}` 부분에 Slack JSON 을 **수기 paste** (또는 별도 `vote.json` 파일).
5. Ledger Nano 를 Mac USB 에 꽂고, PIN 풀고, Ethereum 앱 열고, Settings 에서 Blind signing / Debug data 활성.
6. `python ledger_outcome_vote.py` 실행 → device 에서 domain hash / message hash 확인 → 양쪽 버튼 confirm.
7. 결과 JSON 출력.

### 1.2 동선의 마찰

| 마찰점 | 비용 |
|---|---|
| Python venv 가 자주 깨짐 / 버전 충돌 (`ledgereth` ↔ `eth-account` 등) | vote 마다 20분 디버깅 |
| `.py` 파일에 JSON 을 손으로 paste — quote escape / 줄바꿈 실수 가능 | msgpack 결과 달라지면 슬래시 위험 (서명 자체는 통과지만 publisher 가 surface 한 것과 다른 액션에 서명) |
| Mac 에서 Ledger udev/HIDAPI 권한이 가끔 깨짐 | "Could not find Ledger device" 재발 |
| 어떤 action 인지 사람이 텍스트 한 줄로만 확인 — 시각적 검증 약함 | 사람이 outcome 본문 등 긴 텍스트를 놓침 |
| outcome / delisting 등 action type 별로 별도 스크립트가 있을 수 있다는 인상 — 실제론 **모두 `validatorL1Vote`** | 다른 도구 만들 유혹 |

### 1.3 hl-vote-web 가 해결

브라우저 한 화면에서:

1. publisher 가 Slack 에 올린 액션 JSON 을 paste (또는 file drop).
2. action type / 주요 필드 시각적 요약 + action hash (`keccak(msgpack(action) + nonce + flags)`) 표시.
3. Ledger Nano 를 Mac USB 에 꽂은 채로 — **브라우저가 WebHID 로 device 와 직접 통신**. (Python venv / udev 셋업 불필요. Chromium 계열 브라우저면 OS-permission 만 한 번.)
4. 또는 MetaMask 로 EIP-712 typed-data 서명.
5. `https://api.hyperliquid.xyz/exchange` 또는 `...-testnet.xyz/exchange` 로 직접 POST.
6. 응답 표시 + localStorage 에 dedup 기록.

**publisher VM 에 SSH 들어갈 필요 없음**. 현재 동선 (1.1) 의 "venv + Python + 파일 수기 편집" 부분이 사라진다. Ledger 는 그대로 USB 로 Mac 에 꽂는다.

### 1.4 지원 액션 (Tier 0 시점부터 전부)

`validatorL1Vote` 의 **모든 변형을 paste-and-sign 으로 통일**:

- Outcome vote (deploy / settle)
  - 예: `{"type":"validatorL1Vote","O":{"registerTokensAndStandaloneOutcome":{...}}}`
  - 예: `{"type":"validatorL1Vote","O":{"settle":{...}}}`
- Delisting vote
  - 예: `{"type":"validatorL1Vote","D":"<token-or-market-id>"}` (예제 SDK `ledger_validator_l1_vote.py` 의 `"D":"test"` 자리)
- Governance 등 향후 HF 가 추가하는 `validatorL1Vote` 의 모든 inner shape

UI 는 inner key (`O` / `D` / 새로 추가될 키) 를 type 분류하여 표시하되, **msgpack 직렬화는 paste 된 JSON 의 insertion order 를 절대 변경하지 않는다**. action type 별 특수 처리 / 가공 / 검증 X — 사람이 본 JSON 그대로 서명. 슬래시 직결 룰.

### 1.5 Jeff/HF 에게도 의미

정적 호스팅 가능한 reference signer 는 다른 validator 에게도 본받을 만하고, "B-Harvest 가 outcome / delisting vote 운영의 UX 를 한 단계 끌어올렸다" 는 가시적 컨트리뷰션이 된다. Python SDK `examples/` 에 reference 로 PR 도 옵션.

## 2. Non-goals (절대 안 한다)

- ❌ **백엔드 / 서버 / DB 가짐**. 모든 logic 은 정적 JS.
- ❌ **Hot key 입력 받기 / 디바이스 밖 저장**. agent_key/validator key 를 직접 다루는 입력란 자체를 만들지 않는다. 오직 MetaMask / Ledger.
- ❌ **publisher 가 surface 하지 않은 액션을 가공/수정해서 전송**. 사람이 JSON 을 붙여넣고 우리는 그것을 **그대로** 사인한다. UI 가 임의로 필드 추가/순서 변경 X (msgpack 결과 달라짐 → 슬래시 위험).
- ❌ **자동 vote / 자동 retry / 자동 nonce 진행**. 모든 submit 은 사람이 클릭.
- ❌ **mainnet 활성을 testnet 검증 없이 토글**. 환경 토글은 build-flag + Constitution-IV 게이트 통과 필수.
- ❌ **분석/텔레메트리 SDK 임베드** (Google Analytics, Sentry, Datadog RUM 등). 페이로드에 키/주소가 흘러갈 위험.

## 3. Users & roles

| Role | 누구 | 무엇을 한다 |
|---|---|---|
| Operator | builnad (B-Harvest validator owner) | publisher Slack 보고 JSON 가져와 본 SPA 에서 서명·제출 |
| Co-operator | B-Harvest 다른 운영자 (Inha 등) | 동일 워크플로우, 다른 머신 |
| Auditor | HF / Jeff / 다른 validator | 코드 / 빌드 산출물을 검토. 정적 SPA 라 hash 검증 가능 |
| Hostile | 공격자 | DNS / CDN / supply chain 으로 SPA 를 갈아치우려 함 — §6 위협 모델 |

## 4. Stack (decision)

| 결정 | 채택 | 이유 |
|---|---|---|
| Framework | **Next.js 14 App Router with `output: 'export'`** | static export → CDN/IPFS/file:// 호스팅. SSR 절대 사용 X (Constitution I) |
| Language | **TypeScript strict** | signing 같은 cryptographic 코드는 타입으로 잡아야 안전 |
| Styling | **Tailwind CSS** | 외부 CSS 의존성 최소, build-time 으로 모두 inline |
| EVM wallet | **wagmi v2 + viem** | EIP-712 typed data signing 표준. viem의 `signTypedData` 사용 |
| Ledger | **@ledgerhq/hw-app-eth + @ledgerhq/hw-transport-webhid** | WebHID 는 Chromium 계열만 동작 (정상. blind sign 도 device 측 prompt) |
| msgpack | **@msgpack/msgpack** | Python `msgpack.packb` 와 wire-compat. golden fixture 로 byte-equality 검증 |
| Hash | **viem 의 `keccak256`** | Python eth-utils 의 `keccak` 와 동일 (Keccak-256, NOT SHA3) |
| Test | **vitest** | jest 대비 ESM 친화, Next.js 14 와 충돌 적음 |
| Lint | **eslint + prettier + @typescript-eslint/strict** | |
| Verify gate | **Makefile** (vpub-exporter 와 동일 패턴) | `make verify` 한 줄로 전체 게이트 |

CDN / 외부 fetch 화이트리스트 (런타임):
- `https://api.hyperliquid.xyz/exchange` (mainnet)
- `https://api.hyperliquid-testnet.xyz/exchange` (testnet)
- 그 외 — Constitution VII 위반 (gate fail)

빌드 시 외부 의존 (npm) 은 lockfile + `npm audit` + 정기 검토. 런타임 외부 import 금지 (`<script src=>` 0개).

## 5. Architecture (one screen)

```
[ Operator browser ]
        │
        ├─ static asset load  (HTML + JS bundle, no SSR)
        │
        ├─ [UI form]
        │    ├─ network selector (Testnet / Mainnet — required, no default)
        │    ├─ action JSON paste box
        │    ├─ wallet selector (MetaMask / Ledger)
        │    └─ derivation path (Ledger only, default 44'/60'/0'/0/0)
        │
        ├─ [Hash preview]      ← action_hash(msgpack(action)+nonce+flags) → keccak256
        ├─ [Typed data preview] ← l1_payload(phantom_agent(hash, isMainnet))
        │
        ├─ [Sign click]
        │    └─ MetaMask: viem.signTypedData(typed)
        │    └─ Ledger:   eth.signEIP712HashedMessage(domain_sep, message_hash)
        │
        ├─ [Submit click]
        │    └─ POST https://api.hyperliquid(-testnet)?.xyz/exchange
        │
        └─ [localStorage]  dedup cache (sha256(action)+nonce → response)
```

CORS 검증 완료 (2026-05-24, 사용자): `access-control-allow-origin: *` → 정적 SPA 에서 직접 POST OK.

## 6. Threat model (slashing-grade — 절대 룰)

| 위협 | Mitigation |
|---|---|
| 호스트 (CDN/DNS) 가 탈취되어 다른 액션을 사인하게 유도 | (a) device 가 blind-sign 시 보여주는 message_hash 와 SPA 표시 hash 가 일치하는지 확인 강제 (UI 에 "device hash 와 동일한지 확인" 모달 강제). (b) 빌드 산출물 hash 를 README 와 GitHub Release 에 게시 → operator 가 SHA-256 검증 |
| Build 단계 supply-chain 공격 (npm 의존) | `package-lock.json` commit + `npm ci --ignore-scripts` + lockfile dep audit. 직접 의존 < 15개 목표. Constitution V 게이트 |
| Operator 가 잘못된 네트워크로 서명 | `--network` 토글은 default 없음. 토글 시 즉시 typed-data preview 갱신 + 색상 변경 (testnet=노랑, mainnet=빨강). build flag `NEXT_PUBLIC_MAINNET_ENABLED` 가 false 면 mainnet 옵션 자체 disabled |
| 같은 outcome 에 두 번 서명/제출 (슬래시 가능) | localStorage 의 `sha256(action_msgpack)` 키로 dedup. `--force` 와 동등 액션은 별도 confirm modal + typed-confirm text |
| JSON 입력 시 사람이 모르게 필드 reorder | msgpack 의 map ordering 은 Python `msgpack.packb` 의 dict-iter 순서를 따르므로, TS 측은 입력 JSON 의 **insertion order 그대로** 직렬화. 입력 JSON 의 key 를 우리가 정렬하지 않는다. golden fixture 가 이 규약을 강제 |
| XSS / inline eval | CSP 메타태그 `script-src 'self'; object-src 'none'; base-uri 'none'`. Constitution III 게이트가 `eval` `new Function` grep |
| Private key 가 폼에 입력될 가능성 | hex `0x[0-9a-f]{64}` 패턴 입력 시 즉시 UI red 경고 + 입력 차단. Constitution IV 게이트 |
| 시계 어긋남 → nonce stale | `nonce = Date.now()` 사용 + submit 직전 갱신. ±60s 어긋나면 HF 가 reject — 명확한 에러 표시 |

## 7. Mainnet activation gate (Constitution-grade)

**mainnet 모드는 다음 모두를 통과 해야 enable**:

1. ✅ testnet 에서 5건 이상 실제 vote 성공 (HF 응답 `"status": "ok"`).
2. ✅ Python SDK 와 TS golden fixture 가 100건 random action 에 대해 **byte-exact** 일치 (action_hash + EIP-712 message_hash + signature 모두).
3. ✅ Ledger device 가 device 화면에 보여주는 domain hash / message hash 가 SPA UI 가 보여주는 값과 일치 (3건 수동 검증, 스크린샷 보존).
4. ✅ `make verify` 의 7개 gate 전부 green.
5. ✅ builnad 의 명시적 confirm.

mainnet 활성 토글은 **빌드 시 environment variable** 로만 가능: `NEXT_PUBLIC_MAINNET_ENABLED=true`. 런타임 토글 X. testnet 빌드와 mainnet 빌드가 분리된 산출물.

## 8. Versioning & release

- **branch**: `main` 만. 기능 작업은 `feat/NNN-xxx` short-lived branch.
- **tag**: `v0.1.0` (Tier 0 testnet ready) → `v0.2.0` (Ledger + golden fixture) → `v1.0.0` (mainnet enabled).
- **artifact**: `out/` 폴더 정적 빌드 결과를 release 첨부 (zip). SHA-256 hash 를 release notes 에 명시.
- **deployment**: GitHub Pages (default) + IPFS pin (mainnet 활성 후). file:// 로컬 실행도 지원.

## 9. Tier gating (vpub-exporter 와 동일 패턴)

| Tier | 범위 | exit criteria |
|---|---|---|
| **Tier 0 (MVP)** | MetaMask 만, testnet 만, paste-and-sign + submit + dedup cache. **action type 무관** — outcome / delisting / governance / 향후 `validatorL1Vote` 변형 전체를 동일 흐름으로 처리 | testnet 에서 outcome 1건 + delisting 1건 (=2종 type) vote 성공 + golden fixture 통과 |
| **Tier 1** | Ledger WebHID (Nano 시리즈) 추가, derivation path 선택, device hash 확인 모달. Mac local 동선 (현재 Python venv 동선) 완전 대체 | Ledger 로 testnet 3건 (서로 다른 action inner shape) vote 성공 |
| **Tier 2** | mainnet 활성, action inner-shape 별 friendly 요약 (UI 만; msgpack 직렬화는 paste 그대로 유지), history viewer | mainnet 5건 성공 + §7 gate 통과 |

## 10. Repository layout (proposed)

```
hl-vote-web/
├── CHARTER.md                # 본 파일
├── delegation_matrix.md      # 권한 위임 표
├── CLAUDE.md                 # agent 진입점 (vpub-exporter 패턴)
├── README.md                 # 운영자용
├── Makefile                  # verify gate
├── .specify/
│   ├── feature.json
│   └── memory/constitution.md
├── specs/001-hl-vote-web/
│   ├── spec.md               # WHAT/WHY
│   ├── plan.md               # HOW
│   ├── research.md           # Phase 0
│   ├── data-model.md
│   ├── contracts/
│   │   ├── signing.md        # EIP-712 typed data shape + msgpack rule
│   │   └── ui.md             # 화면별 입출력
│   ├── quickstart.md
│   └── tasks.md
├── app/                      # Next.js App Router
├── components/
├── lib/
│   ├── signing/              # TS 포팅 — action_hash / phantom_agent / l1_payload
│   ├── msgpack/              # @msgpack/msgpack wrapper
│   └── ledger/
├── public/
├── tests/
│   ├── unit/
│   └── golden/               # Python SDK fixture 매칭
├── scripts/
│   └── gen_golden_fixtures.py   # Python SDK 로 fixture 생성
├── package.json
├── tsconfig.json
├── next.config.mjs           # output: 'export'
└── tailwind.config.ts
```

## 11. Spec-Kit workflow

vpub-exporter 와 동일하게 **수동 워크플로우**. CLI 자동화 없음. 단계:

1. ✅ **constitution** — `.specify/memory/constitution.md` 작성 (이번 세션)
2. ✅ **specify** — `specs/001-hl-vote-web/spec.md` 작성
3. ⏳ **clarify** — 필요 시 (현재 NEEDS CLARIFICATION 0건 목표)
4. ✅ **plan** — `plan.md` + `data-model.md` + `contracts/` + `quickstart.md`
5. ✅ **tasks** — `tasks.md` Phase 1~N
6. ⏳ **implement** — T001~ 진행

본 세션 종료 시점 목표: 1, 2, 4, 5 작성 완료 + T001~T003 코드.

---

## ✋ Confirmation request (builnad)

위 charter 의 **결정 사항** 중 한 번만 확인 필요:

1. **Stack** (§4): Next.js 14 static export + TS strict + Tailwind + wagmi/viem + @ledgerhq/hw-app-eth + WebHID + @msgpack/msgpack + vitest. → OK?
2. **Repo path & module name** (§10): `validator/hl-vote-web/`, package `hl-vote-web`, GitHub repo `nodebreaker0-0/hl-vote-web` (private 시작). → OK?
3. **Tier 0 scope** (§9): MetaMask + testnet 만. Ledger 는 Tier 1. → OK?
4. **Mainnet gate** (§7): 5건 testnet 성공 + golden fixture 100건 + Ledger 3건 + verify gate green 모두 통과 시 활성. → 더 엄격? 더 느슨?
5. **Threat model** (§6): 추가로 잡아야 할 위협 있는가?
6. **Hosting target**: GitHub Pages 기본 + 후속 IPFS. → 다른 우선순위?

이 6개에 모두 OK 또는 수정안 주시면 즉시 §10 의 spec-kit 7 파일 작성 + T001~T003 진행합니다.
