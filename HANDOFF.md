# Handoff — 2026-05-24 session end

## What's done

| # | 작업 | 상태 | 비고 |
|---|---|---|---|
| 1 | vpub-exporter 패턴 스캔 | ✅ | spec-kit + Makefile verify gate 패턴 흡수 |
| 2 | SDK 사이닝 예제 분석 | ✅ | `ledger_outcome_vote.py` / `ledger_validator_l1_vote.py` / `signing.py` 정독 |
| 3 | CHARTER.md + delegation_matrix.md | ✅ | builnad confirm 받음 (delisting 추가, Mac local 동선 명확화) |
| 4 | spec-kit 7파일 | ✅ | constitution / spec / plan / contracts/{signing,ui} / quickstart / tasks |
| 5 | T001 Next.js + TS + Tailwind 스켈레톤 | ✅ | 빌드 가능 상태. node_modules 미설치 (sandbox 제약) |
| 6 | T002 signing TS 포팅 | ✅ | `lib/signing/{serialize, actionHash, phantomAgent, l1Payload, typedDataHashes, submit}.ts` + 단위 테스트 |
| 7 | T003 Python SDK golden fixture | ✅ | **100/100 byte-exact 일치** (Python SDK ↔ TS pure-Node verify). `tests/golden/fixtures.json` 생성됨 (단, `.gitignore` 패턴이라 commit 대상 아님; `make golden-gen` 재생성) |
| 8 | Verify gate + git push | ⏳ | sandbox 제약 — Mac local에서 이어서 |

## Why T8 stopped

delegation_matrix §8 stop condition #1 = "verify가 명확히 통과 안 된 상태에서 commit/push 금지". sandbox에서:

1. **`npm install` 풀-설치 불가** — wagmi + viem + @ledgerhq/* + react + next = ~700 packages, 45초 timeout 한도 초과. 작은 install (msgpack + noble/hashes 2개) 만 별도로 검증.
2. **`make verify` 7 gate 중 6개 (lint / typecheck / test / verify-golden / build / bundle-size) 가 node_modules 필요**.
3. **`.git/index.lock` unlink 권한 없음** — sandbox 파일시스템 제약.
4. ✅ **검증된 부분**:
   - `make constitution-gate` — **green**
   - golden fixture parity 100/100 — **green** (별도 임시 디렉토리에서 pure JS 검증)
   - 모든 spec-kit 7파일 + 코드 파일 디렉토리에 존재

## Mac local 이어서 (Mac terminal)

```bash
# 1. 이동
cd /Users/ijeseon/hl-agent/validator/hl-vote-web

# 2. .git 의 stuck lock 정리 (있으면)
rm -f .git/index.lock

# 3. 의존성 설치
make install     # npm ci --ignore-scripts

# 4. 풀 verify (7 gate 모두)
make golden-gen   # Python SDK 가 sibling dir 에 있어야 함
make verify       # lint / typecheck / test / verify-golden / build / constitution-gate / bundle-size

# 5. verify green 확인 후
git add -A
git commit -m "feat: hl-vote-web scaffold — spec-kit 7 files + lib/signing TS port + golden fixture parity (Python SDK ↔ TS 100/100)"

# 6. GitHub repo 생성 후 push
gh repo create nodebreaker0-0/hl-vote-web --private --source=. --remote=origin --push
# 또는
git remote add origin git@github.com:nodebreaker0-0/hl-vote-web.git
git push -u origin main
```

## 검증 결과 (sandbox)

### Golden fixture parity (T003 완료 증거)

```
pass=100 fail=0 / total=100
fixtures sha256: 4d7826ec626e8ffaa73e5defc11a841b574da9211150f61259560d52498171f2
```

13개 base action × 5 nonce × 2 mainnet flag → 100 row. `msgpack_hex` / `action_hash` / `domain_hash` / `message_hash` / `signing_hash` 5종 모두 일치.

Pure-Node verifier 코드는 `/tmp/golden-verify/verify.mjs` (sandbox 내). Mac local에서 `make verify-golden` 가 동등 검증.

### Constitution gate

```
== I.   static-only: no SSR / route handlers / server actions ==  ok
== II.  action pass-through: no key sort / stringify of action ==  ok
== III. mainnet build flag respected ==  ok (testnet build — mainnet URL absent in out/)
== IV.  no 32B hex private key literal ==  ok
== V.   dependency count <= 15 ==  direct deps: 12
== VI.  golden fixtures dir present ==  ok
== VII. DeviceHashConfirmModal referenced when Ledger code present ==  (skipped — Tier 1)
== VIII. NetworkSelector has no default value ==  (skipped — T031)
== IX.  dedup cache (hlVoteHistory) referenced ==  (not yet — pre-T038 acceptable)
== gate OK ==
```

## 디자인 결정 필요 시점 도달 — 없음

이번 세션에서 user-confirm 대기 지점 1회 ("delisting 추가 + Mac local 동선") → builnad가 정보 보강으로 응답 → 그대로 진행. 그 외 모든 결정 (스택, repo path, tier 정의, mainnet gate) 은 CHARTER 의 사전 동의 범위 내.

## 다음 작업 (Phase 3 — Tier 0 UI)

`tasks.md` T030~T040. node_modules 설치 후:

1. T030: wagmi config (`lib/wagmi/config.ts`)
2. T031: NetworkSelector (Constitution VIII 강제)
3. T032: WalletSelector (MetaMask only Tier 0)
4. T033: ActionPasteBox (private-key guard 포함)
5. T034: ActionPreview (msgpack hex / hashes)
6. T035: app/page.tsx state machine
7. T036: MetaMask sign path
8. T037: ResponseViewer
9. T038: lib/history.ts (localStorage dedup)
10. T039: DedupModal
11. T040: CSP meta in layout.tsx

이 11개가 Tier 0 MVP 완성. testnet 에서 publisher 의 outcome 1건 + delisting 1건 실 vote 통과하면 Checkpoint 3 (quickstart.md QS-1).
