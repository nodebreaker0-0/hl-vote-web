# hl-vote-web Constitution

## Core Principles

### I. Static-Only, No Backend (NON-NEGOTIABLE)

hl-vote-web 은 **정적 SPA**다. 어떤 종류의 백엔드/proxy/lambda/SSR/server action 도 가지지 않는다. Next.js 는 `output: 'export'` 모드로만 사용한다. 모든 logic 은 브라우저에서 실행되고, 모든 외부 호출은 **사용자 브라우저 → HF endpoint** 직통이다.

근거: 백엔드 = 새로운 신뢰점 = 새로운 슬래시 위험. 백엔드가 없으면 누구나 산출물 zip 의 SHA-256 만 확인하면 코드를 검증할 수 있다.

### II. Action Pass-Through, No Mutation (NON-NEGOTIABLE)

사용자가 paste 한 action JSON 은 **insertion order 그대로** msgpack 직렬화한다. UI 는:

- ❌ key 정렬을 절대 하지 않는다 (`JSON.stringify(obj, null, ...)` 의 기본 ordering 의존 X — 별도 ordered map 으로 직렬화).
- ❌ 누락된 필드를 채워넣지 않는다.
- ❌ 사용자 가독성을 위해 inner key 를 rename / nest-변형하지 않는다.
- ❌ msgpack 직렬화 전 action 객체를 mutate 하지 않는다.

UI 가 사람에게 보여주는 요약은 별도 view-only 변환 — **서명되는 객체는 paste 원본 그대로**. action type (`O` / `D` / 신규) 와 무관하게 동일 규칙. msgpack diff 가 1바이트라도 나면 슬래시 가능.

### III. Mainnet Gated by Build Flag

mainnet endpoint 호출 (`https://api.hyperliquid.xyz/exchange`) 은 빌드 시 `NEXT_PUBLIC_MAINNET_ENABLED=true` 가 세팅된 산출물에서만 활성. 런타임 토글로 mainnet 을 enable 할 수 없다. testnet 빌드와 mainnet 빌드는 분리된 산출물.

### IV. Secrets / Hot Keys Never Touched

본 SPA 의 어떤 입력 폼도 private key / mnemonic / agent key 를 받지 않는다. 입력 차단 + 패턴 (`/^0x[0-9a-fA-F]{64}$/` 또는 BIP39 12/24 단어) 감지 시 즉시 red banner. 코드 / 주석 / 테스트 fixture / 환경변수에 hex 32B 시크릿 값 commit 금지 — verify gate 가 grep.

### V. Dependency Discipline

`package.json` 의 **직접 (non-dev) 의존성 ≤ 10개**. 모든 직접 의존은 CHARTER §6 supply-chain 표에 대응. 새 의존 추가는 사유 + `npm audit` clean + 코드 검토 후. `<script src=>` / runtime CDN import 0개. node_modules 의 postinstall script 는 `npm ci --ignore-scripts` 로 차단.

현재 직접 의존 (6): `@msgpack/msgpack`, `@noble/hashes`, `clsx`, `next`, `react`, `react-dom`.

### VI. Deterministic Signing — Golden Fixture Gate

TS 서명 결과는 Python SDK (`hyperliquid.utils.signing`) 와 다음 3 단계 모두에서 **byte-exact** 일치해야 한다:

1. `msgpack(action) + nonce(8B BE) + vault/expires flags` 의 raw bytes.
2. `action_hash = keccak256(...)` 의 32 byte digest.
3. EIP-712 `domain_separator`, `struct_hash`, `signing_hash` (eth_signTypedData_v4 결과 32 byte).

서명 자체 (`r/s/v`) 는 nonce 가 달라 비교 불가 — 위 3 단계 hash 비교로 충분. `tests/golden/` 의 100건 random action 에 대해 `make verify-golden` 이 통과 필수. 어긋나는 즉시 작업 중단.

### VII. Single Wallet Path — MetaMask (with optional Ledger import)

Wallet 경로는 **MetaMask 하나**. Ledger 사용자는 MetaMask 의 "Connect hardware wallet → Ledger" 로 Ledger account 를 import 한 뒤 그것을 active account 로 선택한다. 그러면 `eth_signTypedData_v4` 가 device 로 transparent 라우팅되고, device 화면이 SPA Preview 패널이 보여주는 것과 동일한 domain/message hash 를 표시한다.

별도 WebHID 직접 경로는 두지 않는다 — 두 경로를 유지하면 분기 코드 + 의존성 부담만 늘고, 보안 효익은 modal friction 외에 없다 (host 탈취 시 SPA 가 보여주는 hash 자체가 거짓일 수 있으므로 device hash 와 일치 여부만으로는 보증 안 됨).

운영자 책임 (UI 강제 안 함, 절차로 강제): mainnet 첫 N 건은 별도 머신의 독립 도구 (Python SDK, hl-node CLI) 로 같은 action + nonce 의 hash 를 재계산해 device 의 hash 와 cross-verify. 일치 확인 후에만 device approve.

### VIII. Network Selector Has No Default

UI 진입 시 network 는 unset. testnet / mainnet 둘 다 명시적 click 필요. testnet 색상 노랑, mainnet 색상 빨강. mainnet 빌드 아니면 mainnet 옵션 자체 disabled + 회색.

### IX. Dedup Cache (No Double Vote)

성공 응답을 받은 action 은 `sha256(msgpack(action))` 키로 `localStorage.hlVoteHistory[key] = { nonce, response, ts }` 에 기록. 동일 key 로 submit 시도 시 dedup modal — `--force-resend` 와 동등한 UX 는 typed-confirm 으로만 통과. 이중 vote 는 슬래시 위험.

### X. Tier Gating

Tier 0 (MetaMask + testnet) → Tier 1 (Ledger 추가) → Tier 2 (mainnet 활성). 이전 Tier 의 exit criteria 가 충족되기 전엔 다음 Tier 의 코드는 dead-code path 로 두되, 빌드 산출물에 포함되지 않거나 disabled.

## Operational Constraints

- **Bundle size**: gzip 후 < 1 MB. wagmi/viem/@ledgerhq/* 가 큰 편 — code-split 으로 Ledger 모듈은 dynamic import.
- **Browser support**: Chromium 계열 (Chrome / Edge / Brave) — WebHID 필수. Firefox 는 MetaMask 만 동작 (Ledger 비활성 명시).
- **Hosting target**: GitHub Pages (default), IPFS pin (Tier 2 이후), local file:// (전 Tier 지원).
- **CSP**: `default-src 'self'; connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
- **Analytics**: 0건. Sentry / GA / RUM / 어떤 외부 telemetry 도 임베드 X.

## Verify Gate (`make verify`)

`make verify` 는 다음을 모두 통과해야 한다. 하나라도 fail 시 commit / push X.

1. `npm run lint` — eslint + prettier check.
2. `npm run typecheck` — `tsc --noEmit` strict.
3. `npm run test` — vitest unit tests (signing + msgpack + UI 핵심).
4. `make verify-golden` — Python SDK ↔ TS golden fixture byte-exact.
5. `npm run build` — Next.js static export 성공, `out/` 생성, SSR-only API 사용 0건 grep.
6. `make constitution-gate` — 본 헌법 9 원칙 grep 가드 (아래 §게이트 참고).
7. `make bundle-size` — gzip 후 < 1 MB 확인.

### `make constitution-gate` 검사

- I. `output: 'export'` 가 `next.config.mjs` 에 명시되어 있는지.
- I. `getServerSideProps` / `route.ts` 의 dynamic export 가 grep 으로 0건.
- II. `lib/signing/` 내부에서 `.sort()` / `JSON.stringify(obj)` 직접 사용 0건 (ordered serializer 만 사용).
- III. `NEXT_PUBLIC_MAINNET_ENABLED` 미세팅 빌드에 mainnet URL 문자열 0건.
- IV. `0x[a-fA-F0-9]{64}` literal grep 0건 (테스트 fixture 도 0x 접두 32B private key 모양은 금지).
- V. `package.json` 의 `dependencies` 항목 수 ≤ 10.
- VI. `tests/golden/` 디렉토리 존재 + 최소 fixture 파일 1개.
- VII. (removed — wallet path 단일화. 별도 게이트 없음)
- VIII. network selector 컴포넌트에 `defaultValue` / `defaultChecked` 가 mainnet 으로 세팅된 라인 0건.
- IX. `localStorage` 키 `hlVoteHistory` 사용 grep.

## Development Workflow

1. **Spec-driven**: `specs/001-hl-vote-web/spec.md` 가 single source of truth.
2. **Constitution check**: `plan.md` 에 본 헌법 10 원칙 통과 표 명시.
3. **Branching**: `main` 만. 기능 작업은 `feat/NNN-*` short-lived.
4. **Verify gate**: 모든 commit 은 `make verify` 통과. `git push` 는 verify gate 통과 시에만 agent autonomy (delegation_matrix.md §5).
5. **Golden fixture 우선**: 새 action shape 추가 시 fixture 먼저 → TS 코드 후.

## Governance

본 헌법은 hl-vote-web 의 모든 design / code / PR 결정에 우선한다. 위반 시 `plan.md` 의 Complexity Tracking 표에 사유 + builnad 명시 승인. **슬래시 위험과 직결되는 원칙 (II, III, IV, VI, IX)** 은 예외 없음.

**Version**: 1.1.0 | **Ratified**: 2026-05-24 | **Last Amended**: 2026-05-24

### Change log

- 1.1.0 (2026-05-24): VII renumbered/repurposed. Original "Device Hash Confirmation modal (Ledger WebHID)" removed because direct WebHID path was dropped — MetaMask + imported Ledger account collapses both flows into one. V dependency cap tightened from ≤15 to ≤10. operator-side cross-verify procedure noted under new VII.
- 1.0.0 (2026-05-24): initial ratification.
