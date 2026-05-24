# hl-vote-web — Delegation Matrix

> **Purpose**: builnad ↔ agent (Claude / hl-agent harness) 간 권한·책임 분배.
> 슬래시 위험이 있는 도구이므로 명시적으로 합의된 영역만 agent가 자율 진행한다.
> CHARTER.md §6 (Threat model), §7 (Mainnet gate) 의 안전망에 의해 강제된다.

## Legend

| 표기 | 의미 |
|---|---|
| 🟢 auto | agent 자율 진행. 사후 보고만 |
| 🟡 propose | agent 가 변경 제안 + diff/계획 출력. builnad 가 ack 하면 진행 |
| 🔴 confirm | agent 가 명시적 confirm 받기 전엔 절대 진행 X |
| 📛 forbidden | 어떤 상황에서도 진행 X |

---

## 1. Code / Spec

| 영역 | 권한 | 비고 |
|---|---|---|
| spec-kit 파일 작성/수정 (`.specify/`, `specs/001-*/`) | 🟢 auto | spec drift 발견 시 즉시 갱신. CHARTER 와 모순 발견 시 🔴 |
| TypeScript / TSX 코드 작성 | 🟢 auto | strict mode 위반 X |
| unit / golden test 작성 | 🟢 auto | |
| `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts` 변경 | 🟢 auto | `output: 'export'` 옵션 변경 시 🔴 (정적 빌드 깨질 위험) |
| `package.json` 의 dependency 추가 | 🟡 propose | 새 직접 의존성은 사유 + 보안 검토 메모. Constitution V 게이트 |
| dev dependency 추가 | 🟢 auto | eslint/prettier/vitest 류 |
| `package-lock.json` 갱신 (`npm install`) | 🟢 auto | lockfile diff 보존 |
| Makefile target 추가/변경 | 🟢 auto | `verify` 의 게이트는 줄이지 않는다 (오직 추가만) |

## 2. Signing / Cryptographic logic

| 영역 | 권한 | 비고 |
|---|---|---|
| `lib/signing/` 작성/리팩토링 | 🟡 propose | golden fixture 통과 후에만 머지 |
| `lib/msgpack/` wrapper 수정 | 🔴 confirm | Python `msgpack.packb` 와의 호환이 깨지면 슬래시. byte-diff 변경은 무조건 confirm |
| EIP-712 domain / types 상수 (`chainId=1337`, `name=Exchange`, `verifyingContract=0x0...0`) 변경 | 📛 forbidden | HF docs 가 명시적으로 바뀌기 전엔 절대 변경 X |
| network endpoint (`api.hyperliquid.xyz`, `...-testnet.xyz`) 변경 | 🔴 confirm | URL 한 글자 바뀌어도 슬래시 위험 |
| mainnet 활성 토글 (`NEXT_PUBLIC_MAINNET_ENABLED=true`) | 🔴 confirm | CHARTER §7 의 5개 게이트 모두 통과 + builnad 명시 confirm 필요 |
| derivation path default 변경 | 🔴 confirm | `44'/60'/0'/0/0` 외 변경은 키 매칭 위험 |

## 3. UI / UX

| 영역 | 권한 | 비고 |
|---|---|---|
| 컴포넌트 구조 / 레이아웃 | 🟢 auto | 명확히 보이고, action JSON 변형 0 인 한 자유 |
| 색상 / typography / 로고 | 🔴 confirm | 브랜드 결정. testnet=노랑/mainnet=빨강 원칙은 CHARTER §6 |
| 카피 / 경고 문구 | 🟡 propose | 슬래시 경고 문구는 약화 X |
| 새 화면 추가 (history viewer 등) | 🟡 propose | Tier 2 까지 기다림 |
| device hash 확인 modal 제거 | 📛 forbidden | CHARTER §6 직결 |

## 4. Verify gate / CI

| 영역 | 권한 | 비고 |
|---|---|---|
| 새 게이트 추가 | 🟢 auto | 게이트는 더 엄격해질 수만 있다 |
| 기존 게이트 완화 / 우회 | 📛 forbidden | Constitution gate 의 어떤 라인도 주석처리/스킵 X |
| 일시적 skip (예: 외부 인터넷 없음) | 🔴 confirm | 사유 + 복구 시점 명시 |
| GitHub Actions workflow 작성 | 🟢 auto | |
| secret 사용 (NPM_TOKEN 등) | 📛 forbidden | 본 프로젝트는 secret 0 |

## 5. Git operations

| 영역 | 권한 | 비고 |
|---|---|---|
| `git init`, branch 생성, commit | 🟢 auto | `make verify` 통과 시에만 commit |
| `git push origin <branch>` | 🟢 auto | verify gate 통과 + diff summary 출력 |
| `git push origin main` (force / rewrite) | 🔴 confirm | rebase / force-with-lease 모두 confirm |
| GitHub release / tag (`v0.1.0` …) | 🔴 confirm | mainnet 영향 tag 는 §7 게이트 후 |
| 외부 repo 로 push (mirror 등) | 📛 forbidden | |
| `.git/hooks/*` 자동 수정 | 📛 forbidden | local-only |

## 6. Network operations

| 영역 | 권한 | 비고 |
|---|---|---|
| `npm install` (외부 fetch) | 🟢 auto | lockfile 갱신 |
| HF endpoint **테스트** POST (testnet) — 가짜 액션 | 🟡 propose | 실제 vote 가 아닌 dry-run 패턴은 OK. 실 vote 는 builnad 가 직접 |
| HF endpoint mainnet 호출 | 📛 forbidden | agent 가 직접 mainnet POST 절대 X |
| 외부 docs fetch (gitbook 등) | 🟢 auto | 항상 1차 소스 우선 (SKILL §3.0) |

## 7. Operational decisions (사용자 영역)

| 영역 | 누가 |
|---|---|
| 실제 outcome / governance vote 실행 (sign + submit) | **builnad only** |
| Ledger device 물리적 confirm | builnad |
| mainnet 활성 토글 결정 | builnad |
| GitHub repo public/private 전환 | builnad |
| HF / Jeff 에게 본 도구 공유 / PR / Discord 게시 | builnad |
| Validator 정책 (vote 기준) | B-Harvest 내부 (builnad + Carl) |

## 8. Stop conditions (agent 가 즉시 멈춰야 하는 상황)

agent 는 다음 중 하나라도 발생하면 **즉시 현재 작업을 멈추고 builnad 에게 보고**한다:

1. `make verify` 가 fail 인데, fail 사유가 명확하지 않거나 cryptographic 의도와 충돌 가능.
2. Python golden fixture 와 TS 결과가 어긋나는데 단순 직렬화 차이가 아닌 (예: hash 알고리즘 불일치).
3. CHARTER.md 의 결정 사항을 변경해야만 진행 가능한 상태.
4. UI 디자인 / 카피 / 브랜드 결정이 필요한 지점.
5. mainnet 영역의 코드/설정/네트워크 호출이 의도치 않게 발생.
6. 의존성 추가 검토 중 알려진 CVE 또는 typosquatting 의심 패키지 발견.
7. 시크릿 의심 입력 (private key 패턴) 이 코드/문서/로그에 우연히 들어감.

각 stop condition 발생 시, agent 는:
- 진행 중인 변경을 stage 해두되 commit X
- 본 delegation_matrix.md 의 해당 줄을 인용
- 어떤 confirm 이 필요한지 단답형으로 질문

## 9. Reporting cadence

- spec-kit 7파일 작성 완료: 한 번 보고 (파일 트리)
- 각 T### 완료: 무엇이 머지됐는지 한 줄 요약
- verify gate 통과 시 직전 commit hash + 통과한 게이트 목록
- testnet vote 시뮬레이션 결과 (golden fixture 100건 일치율)

---

## ✋ Confirmation request (builnad)

CHARTER.md 와 함께 본 matrix 의 **🟢/🟡/🔴/📛 분배**가 합리적인지 한 번만 확인:

1. Mainnet POST 가 `📛 forbidden` (agent 절대 안 함) — OK?
2. 의존성 추가가 `🟡 propose` — 더 엄격 (`🔴 confirm`) 으로 가야?
3. testnet HF endpoint 시험 호출이 `🟡 propose` — agent 가 testnet dry-run 액션 한두 건 정도 직접 시도해도 됨? 아니면 항상 builnad?
4. git push 가 `🟢 auto` (verify gate 통과 시) — OK?
5. Stop conditions 7개 중 추가/제거할 것 있나?

이 5개에 OK 또는 수정안 주시면 즉시 spec-kit 7파일 + T001~T003 진행합니다.
