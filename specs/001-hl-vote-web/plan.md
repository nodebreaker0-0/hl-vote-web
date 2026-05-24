# Implementation Plan: hl-vote-web

**Branch**: `001-hl-vote-web` | **Date**: 2026-05-24 | **Spec**: ./spec.md

**Input**: ./spec.md (User stories US1~US4, FR-001..044, SC-001..007)

## Summary

`validatorL1Vote` action (outcome / delisting / 향후 변형 모두) 을 brower 한 화면에서 paste-and-sign 으로 서명·제출하는 정적 SPA. Mac local 운영자가 현재 Python venv + Ledger CLI 로 처리하던 동선을 대체. 백엔드 없음. testnet → Tier 0 (MetaMask), Tier 1 (Ledger Nano via WebHID), Tier 2 (mainnet).

## Technical Context

**Language/Version**: TypeScript 5.4+, strict.
**Framework**: Next.js 14 App Router, `output: 'export'` (static export). SSR / server actions 일체 미사용.
**Primary Dependencies**:
- UI: `react@18`, `react-dom@18`, `next@14`, `tailwindcss@3`, `clsx`, `lucide-react`
- Wallet: `wagmi@2`, `viem@2`, `@wagmi/connectors`
- Ledger: `@ledgerhq/hw-app-eth`, `@ledgerhq/hw-transport-webhid`
- Crypto: `@msgpack/msgpack`, `@noble/hashes` (keccak256 fallback; viem 가 keccak256 노출하면 그쪽 사용)

**Storage**: `localStorage` only — `hlVoteHistory` key. 평문 JSON.
**Testing**: `vitest` + `@vitest/ui`. unit + golden fixture. UI 는 testing-library minimal.
**Target Platform**: Chromium 계열 데스크탑 브라우저 (Chrome / Edge / Brave) — WebHID 필수. Firefox 는 MetaMask 만.
**Project Type**: 정적 SPA (Next.js static export → `out/`).
**Performance Goals**: paste → preview latency P95 < 1s. sign → submit roundtrip P95 < 5s (네트워크 제외).
**Constraints**: gzip 후 < 1 MB. dependencies (non-dev) ≤ 15. external runtime fetch: `api.hyperliquid.xyz` / `api.hyperliquid-testnet.xyz` 외 0건.
**Scale/Scope**: 단일 운영자 / 단일 브라우저. 동시 사용자 N/A (서버 없으므로). action 종류는 `validatorL1Vote` 만, inner shape 무제한.

## Constitution Check

> Gate: pass before Phase 0 research. Re-check after Phase 1 design.

| 원칙 | 통과 | 비고 |
|---|---|---|
| I. Static-Only, No Backend | ✅ | `next.config.mjs` 에 `output: 'export'`. `route.ts` / `getServerSideProps` 0건 |
| II. Action Pass-Through, No Mutation | ✅ | `lib/signing/serialize.ts` 가 ordered-map serializer 만 사용. `.sort()` grep 0건 (생성 시 enforced) |
| III. Mainnet Build Flag | ✅ | `NEXT_PUBLIC_MAINNET_ENABLED` env. Tier 0/1 빌드는 false |
| IV. Secrets Never Touched | ✅ | input pattern guard (FR-011), grep gate |
| V. Dependency Discipline | ✅ | 위 의존 목록 ≤ 12개. lockfile commit. postinstall script 차단 |
| VI. Golden Fixture Gate | ✅ | `tests/golden/` + `scripts/gen_golden_fixtures.py` (Python SDK reference) |
| VII. Device Hash Confirmation | ✅ | `components/DeviceHashConfirmModal.tsx` (Tier 1) |
| VIII. Network Selector No Default | ✅ | `NetworkSelector` 컴포넌트 unset state |
| IX. Dedup Cache | ✅ | `lib/history.ts` 가 `hlVoteHistory` 사용 |
| X. Tier Gating | ✅ | Tier 0 코드만 머지 후 Tier 1, 2 단계적 |

위반 항목 없음. Complexity Tracking 비움.

## Project Structure

### Documentation (this feature)

```text
specs/001-hl-vote-web/
├── spec.md              # WHAT / WHY
├── plan.md              # 이 파일 — HOW
├── contracts/
│   ├── signing.md       # EIP-712 / msgpack / Ledger payload 명세
│   └── ui.md            # 화면 / 컴포넌트 / 상태 머신
├── quickstart.md        # 검증 시나리오 QS-1~5
└── tasks.md             # T001~ 구현 작업 매트릭스
```

(spec-kit 7 파일 정의: constitution, spec, plan, contracts/signing, contracts/ui, quickstart, tasks. data-model / research 는 spec 과 contracts 에 흡수.)

### Source Code (hl-vote-web 폴더 안)

```text
hl-vote-web/
├── CHARTER.md
├── delegation_matrix.md
├── CLAUDE.md
├── README.md
├── Makefile                     # verify gate
├── .specify/
│   ├── feature.json
│   └── memory/constitution.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.mjs              # output: 'export'
├── tailwind.config.ts
├── postcss.config.mjs
├── .eslintrc.cjs
├── .prettierrc.json
├── .gitignore
├── vitest.config.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # 메인 sign-and-submit 화면
│   ├── history/page.tsx         # Tier 2 history viewer
│   └── globals.css
├── components/
│   ├── NetworkSelector.tsx
│   ├── ActionPasteBox.tsx
│   ├── ActionPreview.tsx        # msgpack hex + action_hash + typed-data preview
│   ├── WalletSelector.tsx       # MetaMask / Ledger
│   ├── LedgerConnector.tsx
│   ├── DeviceHashConfirmModal.tsx
│   ├── DedupModal.tsx
│   └── ResponseViewer.tsx
├── lib/
│   ├── signing/
│   │   ├── serialize.ts         # ordered msgpack (insertion order)
│   │   ├── actionHash.ts        # keccak256(msgpack + nonce + flags)
│   │   ├── phantomAgent.ts
│   │   ├── l1Payload.ts         # EIP-712 typed-data
│   │   ├── typedDataHashes.ts   # domain hash / message hash (Ledger 용)
│   │   └── submit.ts            # HF /exchange POST
│   ├── ledger/
│   │   ├── transport.ts         # WebHID lazy import
│   │   └── sign.ts              # signEIP712HashedMessage wrapper
│   ├── wagmi/
│   │   └── config.ts
│   ├── history.ts               # localStorage dedup cache
│   ├── env.ts                   # NEXT_PUBLIC_* readers
│   └── utils.ts
├── scripts/
│   ├── gen_golden_fixtures.py   # Python SDK 호출, fixture JSON 생성
│   └── verify_bundle.mjs        # size + grep gates
├── tests/
│   ├── unit/
│   │   ├── serialize.test.ts
│   │   ├── actionHash.test.ts
│   │   └── l1Payload.test.ts
│   └── golden/
│       ├── fixtures.json        # gen_golden_fixtures.py 산출
│       └── golden.test.ts       # TS 결과와 Python 결과 byte-exact 비교
└── public/
    └── favicon.svg
```

**Structure Decision**:
- `lib/signing/` 은 **pure** — Next.js / React 의존성 0. golden test 가 node 환경에서 직접 import.
- `lib/ledger/` 는 dynamic import (`await import('@ledgerhq/...')`) 로 code-split. Tier 0 빌드에는 포함되지만 wallet 선택 시점까지 load X.
- `wagmi/viem` 도 dynamic import 검토 (메인 페이지 load 시점 size 절약).
- 환경별 분기는 `lib/env.ts` 한 곳에서. 직접 `process.env.NEXT_PUBLIC_*` 참조 grep 0건.

### Repository Integration

- GitHub `nodebreaker0-0/hl-vote-web` (private, Tier 2 시 public 검토).
- GitHub Pages 배포 (Tier 0 부터). 도메인은 추후.
- Python SDK 의 `hyperliquid-python-sdk/examples/ledger_*` 와 별도 repo. golden fixture 생성에만 의존.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |

위반 없음.

## Phases

### Phase A — Charter + Spec-Kit (이미 완료)

- ✅ CHARTER.md (이번 세션 작성)
- ✅ delegation_matrix.md
- ✅ Constitution
- ✅ spec.md
- ✅ plan.md (이 파일)
- ✅ contracts/signing.md, contracts/ui.md
- ✅ quickstart.md
- ✅ tasks.md

### Phase B — Tier 0 MVP (MetaMask + testnet)

T001~T020 (tasks.md 참조). Next.js 스켈레톤 → signing TS 포팅 → golden fixture → UI → MetaMask 흐름 → testnet 실 vote 1건.

### Phase C — Tier 1 (Ledger)

T030~T040. WebHID transport, signEIP712HashedMessage 흐름, device-hash confirm modal, 3건 실 vote.

### Phase D — Tier 2 (Mainnet)

T050~. CHARTER §7 게이트 점검 후 mainnet 빌드 활성. history viewer.

### Phase E — Polish / Release

GitHub Release with bundle SHA-256, README 운영자 가이드, IPFS pin 검토.

## Key Rules

- 메트릭/알람 같은 reference 가 없는 도구라, 본 plan + spec + contracts/ + constitution 4 종을 single source of truth 로 한다.
- 새 action variant 추가 시 spec 의 §1.4 (지원 액션) 갱신 + golden fixture 추가.
- `lib/signing/` 은 외부 라이브러리 (viem keccak / @msgpack/msgpack) 외 어떤 React/UI 의존도 갖지 않는다.
- 어떤 commit 도 `make verify` 통과 없이는 push 안 한다. delegation_matrix §5.
