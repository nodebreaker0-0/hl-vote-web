---
description: "hl-vote-web implementation tasks (Tier 0+1+2)"
---

# Tasks: hl-vote-web

**Input**: `specs/001-hl-vote-web/{spec.md, plan.md, contracts/{signing.md, ui.md}, quickstart.md}` + `CHARTER.md`, `delegation_matrix.md`, `.specify/memory/constitution.md`

**Prerequisites**: 모두 작성 완료 (Phase A — 2026-05-24)

**Tests**: 포함. signing 함수 + msgpack + 핵심 UI 가드는 단위 / golden test 필수.

**Organization**: phase 별 + Tier (US1/2/3/4) 라벨. Tier 0 만으로도 MVP.

## Format

`[T###] [P?] [Tier-N] [USx] Description (path)`

- `[P]` — 다른 파일·의존성 없어 병렬 가능
- `[Tier-N]` — 0=MVP / 1=Ledger / 2=Mainnet
- `[USx]` — spec.md user story 매핑
- 모든 경로는 `hl-vote-web/` 기준 상대

---

## Phase 1 — Setup (Shared Infrastructure)

**Purpose**: Next.js + TS + Tailwind 스켈레톤, 빌드, CI, Makefile.

- [ ] **T001** [Tier-0] Next.js 14 App Router 프로젝트 초기화. `next.config.mjs` 에 `output: 'export'`, `trailingSlash: true`. `package.json` 의존성 추가 (CHARTER §4 표 따름). `tsconfig.json` strict, paths `@/*`. Tailwind + PostCSS 설정. `app/layout.tsx`, `app/page.tsx`, `app/globals.css` 스켈레톤.
- [ ] **T002** [P] [Tier-0] `.gitignore` — `node_modules/`, `.next/`, `out/`, `out-mainnet/`, `coverage/`, `*.log`, `.DS_Store`, `tests/golden/fixtures.json` (생성물).
- [ ] **T003** [P] [Tier-0] `Makefile` — target: `install`, `lint`, `typecheck`, `test`, `golden-gen`, `verify-golden`, `build`, `bundle-size`, `constitution-gate`, `verify`, `clean`.
- [ ] **T004** [P] [Tier-0] ESLint + Prettier 설정 (`@typescript-eslint/strict`, react/recommended). `no-console: warn`. `no-eval: error`.
- [ ] **T005** [P] [Tier-0] vitest 설정 (`vitest.config.ts`). node 환경 + jsdom 분리. coverage 옵션.
- [ ] **T006** [P] [Tier-0] `.github/workflows/ci.yml` — `npm ci --ignore-scripts` → `make verify` → 산출물 SHA-256 게시. node 20.
- [ ] **T007** [P] [Tier-0] `README.md` 스켈레톤 — 운영자용 (Phase E 에서 채움).

**Checkpoint 1**: `make install && make build` 가 빈 페이지로 동작. CI green.

---

## Phase 2 — lib/signing (TS 포팅) — Tier 0 의 core

**Purpose**: Python SDK 의 signing 로직을 TS 로 byte-exact 포팅. UI 의존성 0. 단위 + golden 테스트.

**⚠️ Constitution VI 게이트**: golden fixture 매칭이 통과되기 전엔 어떤 UI 코드도 본 함수에 접근 X.

- [ ] **T010** [Tier-0] `lib/signing/serialize.ts` — `@msgpack/msgpack` 의 `Encoder({sortKeys: false})` 로 ordered serialize. unit test (5+ 케이스, 중첩 / unicode / 빈 array / 큰 정수 / boolean).
- [ ] **T011** [P] [Tier-0] `lib/signing/actionHash.ts` — keccak256 (viem 또는 @noble/hashes). 8B BE nonce, vault flag, expires flag. unit test.
- [ ] **T012** [P] [Tier-0] `lib/signing/phantomAgent.ts` + test.
- [ ] **T013** [P] [Tier-0] `lib/signing/l1Payload.ts` — 상수 4개 (chainId/name/verifyingContract/version) literal 타입. unit test.
- [ ] **T014** [Tier-0] `lib/signing/typedDataHashes.ts` — viem `hashDomain` / `hashStruct` / `hashTypedData` 사용. domain/message/signing hash 3종 반환.
- [ ] **T015** [Tier-0] `lib/signing/submit.ts` — `fetch` POST `/exchange`. network 분기. JSON body shape (`vaultAddress: null`, `expiresAfter: null`). 실패 시 throw 분류 (network err / 4xx / 5xx).
- [ ] **T016** [Tier-0] `lib/signing/index.ts` — barrel.

**T020 (golden fixture — T010~T014 직후)**:

- [ ] **T020** [Tier-0] `scripts/gen_golden_fixtures.py` — Python SDK 호출하여 100 row fixture JSON 생성. action pool 다양화. testnet/mainnet 양쪽.
- [ ] **T021** [Tier-0] `tests/golden/golden.test.ts` — 100 row 모두에 대해:
  - `serialize(action)` hex = `fixture.msgpack_hex`
  - `actionHash(action, nonce, null, null)` = `fixture.action_hash`
  - `typedDataHashes(...)` 3종 = fixture 의 대응 값
- [ ] **T022** [Tier-0] `make verify-golden` target 동작 확인. CI 에 포함.

**Checkpoint 2**: golden test 100/100 통과. `lib/signing/` 코드 stable.

---

## Phase 3 — Tier 0 UI (MetaMask + testnet)

**Purpose**: spec.md US1 + US2 통과. paste-and-sign-and-submit + dedup.

### Wallet / Network

- [ ] **T030** [Tier-0] [US1] `lib/wagmi/config.ts` — wagmi v2 config. MetaMask connector. (chainId 는 phantom 1337 이라 chain 등록 불요 — typed data 만 사인.)
- [ ] **T031** [Tier-0] [US1] `components/NetworkSelector.tsx` — Constitution VIII 준수. unset default. mainnet 옵션 빌드 flag 로 disabled.
- [ ] **T032** [Tier-0] [US1] `components/WalletSelector.tsx` — MetaMask only (Tier 0). 연결된 주소 표시.

### Paste / Preview

- [ ] **T033** [Tier-0] [US1, US2] `components/ActionPasteBox.tsx` — textarea + parse + 가드 (private key pattern / type 검증 / unknown variant 경고).
- [ ] **T034** [Tier-0] [US1, US2] `components/ActionPreview.tsx` — msgpack hex / action_hash / typed_data (collapsible) / 3 hashes 표시. `lib/signing/` 호출.

### Sign / Submit

- [ ] **T035** [Tier-0] [US1] `app/page.tsx` — 위 컴포넌트 조립. state machine (idle/previewed/ready/signing/submitting/success/err). nonce 는 sign 직전 `BigInt(Date.now())`.
- [ ] **T036** [Tier-0] [US1] MetaMask sign path — `viem.signTypedData`. sig 분리 → `lib/signing/submit.ts` 호출.
- [ ] **T037** [Tier-0] [US1] `components/ResponseViewer.tsx` — HF 응답 표시. 성공/실패 색상.

### Dedup

- [ ] **T038** [Tier-0] [US1] `lib/history.ts` — localStorage `hlVoteHistory` CRUD. `sha256(msgpack_hex)` 키.
- [ ] **T039** [Tier-0] [US1] `components/DedupModal.tsx` — Constitution IX. typed "RESEND".

### CSP / 보안

- [ ] **T040** [Tier-0] `app/layout.tsx` — CSP meta. analytics 0.

**Checkpoint 3**: testnet 에서 MetaMask 로 outcome 1건 + delisting 1건 vote 성공 (QS-1.5). dedup 정상 (QS-1.6).

---

## Phase 4 — Tier 1 UI (Ledger Nano via WebHID)

- [ ] **T050** [Tier-1] [US3] `lib/ledger/transport.ts` — `@ledgerhq/hw-transport-webhid` dynamic import. 브라우저 지원 감지.
- [ ] **T051** [Tier-1] [US3] `lib/ledger/sign.ts` — `Eth.signEIP712HashedMessage(path, domain_hash, message_hash)` wrapper.
- [ ] **T052** [Tier-1] [US3] `components/LedgerConnector.tsx` — WebHID prompt, derivation path 입력, 주소 표시.
- [ ] **T053** [Tier-1] [US3] `components/DeviceHashConfirmModal.tsx` — Constitution VII. checkbox + typed "CONFIRM".
- [ ] **T054** [Tier-1] [US3] `WalletSelector` 에 Ledger 추가. Firefox/Safari 시 disabled + 안내.
- [ ] **T055** [Tier-1] [US3] `app/page.tsx` 의 state machine 에 `ledger_confirm` / `signing_ledger` 분기.

**Checkpoint 4**: Ledger 로 testnet 3건 vote 성공 (QS-2). device hash 수동 검증 통과.

---

## Phase 5 — Tier 2 (Mainnet + History)

- [ ] **T060** [Tier-2] [US4] `lib/env.ts` — `NEXT_PUBLIC_MAINNET_ENABLED` reader.
- [ ] **T061** [Tier-2] [US4] `components/NetworkSelector` 의 mainnet 옵션을 빌드 flag 로 enable + 빨강 banner + typed-confirm modal.
- [ ] **T062** [Tier-2] [US4] `app/history/page.tsx` — localStorage 리스트 viewer. action_hash / network / response 요약.
- [ ] **T063** [Tier-2] [US4] CHARTER §7 게이트 점검 자동화 (스크립트 `scripts/mainnet_gate_check.mjs`).

**Checkpoint 5**: CHARTER §7 5개 게이트 ✅. mainnet 빌드 산출물 별도. mainnet 1건 vote 성공.

---

## Phase 6 — Verify Gate 강화 + 릴리스

- [ ] **T070** [Tier-0] `make constitution-gate` 구현 (constitution.md 의 §게이트 검사 항목 9개 grep).
- [ ] **T071** [Tier-0] `make bundle-size` — `du -sb out/_next/static/chunks` + gzip 시뮬레이션.
- [ ] **T072** [Tier-0] `scripts/verify_bundle.mjs` — postbuild verifier. `connect-src` 외 외부 origin 0건 확인.
- [ ] **T073** [Tier-0] CI: PR 시 verify gate 통과 + 산출물 SHA-256 PR comment.
- [ ] **T074** [Tier-2] GitHub Release workflow — tag 시 zip 첨부 + SHA-256 게시.

**Checkpoint 6**: `make verify` 7 gate 100% green. release pipeline 완성.

---

## Phase 7 — Polish

- [ ] **T080** [Tier-0] `README.md` — Mac local 운영자용 quickstart, troubleshooting, "왜 hl-vote-web 인가" 섹션.
- [ ] **T081** [Tier-1] Ledger udev 안내 / WebHID 권한 reset 가이드.
- [ ] **T082** [Tier-2] IPFS pin 가이드, GitHub Pages 도메인 안내.
- [ ] **T083** [Tier-2] Python SDK 의 `examples/README.md` 에 hl-vote-web 링크 추가 PR (옵션).

---

## Parallel Execution Hint

같은 Phase 내 `[P]` 라벨 task 는 병렬. Phase 간엔 sequential.

Phase 1 / Phase 2 의 T010~T014 / T020 / Phase 3 의 T030~T034 등이 자연 단위.

## Test Coverage Targets

- `lib/signing/*` — 100% line + golden 100/100.
- `lib/history.ts` — 95%+.
- 컴포넌트 — Tier 0 의 guard 컴포넌트 (NetworkSelector / ActionPasteBox / DedupModal) 의 핵심 케이스 unit.
