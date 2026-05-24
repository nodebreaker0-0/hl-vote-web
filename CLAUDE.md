# hl-vote-web — Agent Context

> 이 폴더는 **Hyperliquid `validatorL1Vote` (outcome / delisting / 향후 변형 전체) 정적 SPA** 코드를 작성하는 곳이다.
> Claude / hl-agent harness 가 본 폴더에서 작업할 때 본 문서를 진입점으로 읽고, 아래 파일들로 분기한다.
> 본 프로젝트는 **Spec-Kit (Specification-Driven Development) + Constitution gate** 워크플로우를 따른다 (vpub-exporter 패턴).

## Spec-Kit Layout

```
hl-vote-web/
├── CLAUDE.md                                # 본 파일 — agent 진입점
├── CHARTER.md                               # 프로젝트 헌장 (why / non-goals / threat / tier / mainnet gate)
├── delegation_matrix.md                     # builnad ↔ agent 권한 분배
├── README.md                                # 운영자용 (Mac local 가이드, troubleshooting)
├── Makefile                                 # verify gate
├── .specify/
│   ├── feature.json
│   └── memory/constitution.md               # 10 원칙
└── specs/001-hl-vote-web/
    ├── spec.md                              # WHAT/WHY (US1~4, FR-001~044, SC-001~007)
    ├── plan.md                              # HOW (tech context, structure, Constitution Check)
    ├── contracts/
    │   ├── signing.md                       # TS ↔ Python byte-exact contract
    │   └── ui.md                            # 화면 / 상태 머신 / 가드
    ├── quickstart.md                        # QS-0~5 검증
    └── tasks.md                             # T001~T083
```

<!-- SPECKIT START -->
**Active plan**: `specs/001-hl-vote-web/plan.md`
<!-- SPECKIT END -->

## 어디서부터 읽는가 (사용 시나리오별)

| 작업 | 먼저 읽기 |
|---|---|
| 처음 들어옴 / 전체 파악 | `CHARTER.md` → `spec.md` (15분) |
| 새 컴포넌트 추가 / 변경 | `contracts/ui.md` → `spec.md` FR 매칭 |
| signing 로직 변경 | `contracts/signing.md` → `specs/001-*/spec.md` FR-001~007 + Constitution VI |
| 권한 / 자율 진행 가능 여부 | `delegation_matrix.md` |
| 검증 시나리오 실행 | `quickstart.md` |
| 원칙 / 코딩 룰 / verify gate | `.specify/memory/constitution.md` |
| Tasks 진행 | `tasks.md` (T001~) |

## 사용자 결정 (2026-05-24)

1. ✅ 범위 = **`validatorL1Vote` 전체** (outcome + delisting + 향후 variant). 별도 도구 X.
2. ✅ Stack = Next.js 14 static export + TS strict + Tailwind + wagmi/viem + @ledgerhq/hw-app-eth + WebHID + @msgpack/msgpack + vitest.
3. ✅ 동선 대체 대상 = **Mac local — Python venv + ledgereth + 파일 paste** 동선. Ledger 는 그대로 USB → WebHID.
4. ✅ Tier 0 = MetaMask + testnet. Tier 1 = Ledger 추가. Tier 2 = Mainnet.
5. ✅ Mainnet 활성은 빌드 flag (`NEXT_PUBLIC_MAINNET_ENABLED=true`) + CHARTER §7 5 게이트 통과 + builnad 명시 confirm 후.
6. ✅ Repo path = `validator/hl-vote-web/`. GitHub `nodebreaker0-0/hl-vote-web` (private 시작).

## 절대 금지 (Constitution II / III / IV 직결)

- ❌ paste 한 action JSON 의 key 정렬 / 필드 추가 / mutation
- ❌ 백엔드 / SSR / server action / route.ts dynamic export
- ❌ mainnet endpoint 호출 — 빌드 flag 미세팅 시
- ❌ private key / mnemonic / agent key 입력 폼 추가
- ❌ 외부 telemetry / analytics SDK 임베드
- ❌ Constitution / CHARTER 의 결정 사항을 코드로 우회 (예: dedup 우회, 색상 무시)
- ❌ EIP-712 도메인 상수 (chainId=1337, name=Exchange, verifyingContract=0x0...0) 변경

## 외부 참조

- HL 공식 docs: `https://hyperliquid.gitbook.io/hyperliquid-docs`
- Python SDK (golden 기준): `../hyperliquid-python-sdk/`
  - `hyperliquid/utils/signing.py` — `action_hash` / `construct_phantom_agent` / `l1_payload`
  - `examples/ledger_outcome_vote.py` — outcome 흐름 reference
  - `examples/ledger_validator_l1_vote.py` — delisting (`D`) 흐름 reference
- 이전 시도 (CLI): `../outcome-vote/README.md`
- 유사 spec-kit 패턴: `../vpub-exporter/` (`.specify/` + `specs/001-vpub-exporter/` + `Makefile verify`)
- hl-agent skill 진입점: `/var/folders/.../skills/hl-agent/SKILL.md`

## Workflow 명령 (참고)

이 프로젝트는 spec-kit CLI 가 아니라 **수동 워크플로우**:

1. ✅ `constitution` — `.specify/memory/constitution.md`
2. ✅ `specify` — `specs/001-hl-vote-web/spec.md`
3. ✅ `plan` — `specs/001-hl-vote-web/plan.md` + `contracts/` + `quickstart.md`
4. ✅ `tasks` — `specs/001-hl-vote-web/tasks.md`
5. ⏳ `implement` — T001~ 진행. Phase 1 → 2 → 3 순서 엄격.

## 진행 메모 (agent 가 갱신)

| 일자 | 작업 | 상태 |
|---|---|---|
| 2026-05-24 | CHARTER + delegation_matrix + spec-kit 7파일 작성 | ✅ |
| 2026-05-24 | T001 Next.js 스켈레톤 (package.json / next.config.mjs / tsconfig / tailwind / eslint / vitest) | ✅ |
| 2026-05-24 | T010~T016 lib/signing 포팅 (serialize / actionHash / phantomAgent / l1Payload / typedDataHashes / submit) | ✅ |
| 2026-05-24 | T020~T021 Python SDK golden fixture **100/100 byte-exact** | ✅ |
| 2026-05-24 | constitution-gate ✅ green (10 원칙 grep) | ✅ |
| 2026-05-24 | T030~T040 Tier 0 UI + hotfix 4종 (hydration / paste 친절 / CSP unsafe-inline / chainId 1337 phantom) | ✅ |
| 2026-05-24 | testnet outcome 1건 실 vote 성공 | ✅ |
| 2026-05-24 | Constitution v1.1.0 — VII 제거, V cap ≤10, single wallet path (MetaMask + Ledger import) | ✅ |
| 2026-05-25+ | testnet delisting 1건 → Tier 0 exit → mainnet 빌드 첫 실 vote | ⏳ |
