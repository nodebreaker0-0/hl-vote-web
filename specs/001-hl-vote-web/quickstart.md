# Quickstart — hl-vote-web 검증 시나리오

> spec.md 의 Success Criteria (SC-001 ~ SC-007) 만족 검증. Tier 별로 단계 진행.

## 사전 조건

- Node 20 LTS (`node -v` ≥ 20).
- npm 10+.
- Mac local 환경.
- Chromium 계열 브라우저 (Chrome / Edge / Brave) — 최신.
- MetaMask 확장 (Tier 0 부터).
- Ledger Nano S Plus 또는 X (Tier 1 부터). Ethereum 앱 + Blind signing 활성.
- Python 3.10+ (golden fixture 생성용; 운영 단계엔 불필요).
- testnet 환경에서 validator agent key 가 등록된 주소 1개 (MetaMask account 1 또는 Ledger derivation `44'/60'/0'/0/0` 가 그 주소이어야 함).

## QS-0 — 로컬 빌드 & 검증

```bash
cd /Users/ijeseon/hl-agent/validator/hl-vote-web
npm ci --ignore-scripts
make verify          # 7 gate (lint / typecheck / test / golden / build / constitution-gate / bundle-size)
```

**기대**: 모든 gate green. 산출물 `out/` 생성. `dist/SHA256SUMS.txt` 갱신.

**합격**: `make verify` exit 0. zero stderr (warning 까지 0 목표).

## QS-1 — Tier 0 / US1 / SC-001, SC-002, SC-004, SC-005

### QS-1.1 — 정적 빌드 & 로컬 서빙

```bash
npx serve out/                 # http://localhost:3000
```

브라우저로 `http://localhost:3000` 접속.

**기대**: 헤더에 `hl-vote-web vX.Y.Z`, Network selector unset, Action paste box 빈 상태.

### QS-1.2 — Action paste & preview (outcome)

publisher Slack 의 실제 outcome action JSON 1건을 paste box 에 붙여넣고 "Parse / Preview" 클릭.

**기대**:
- Action Summary 의 variant = "Outcome (key \"O\")".
- msgpack hex / action_hash / typed_data / domain_hash / message_hash / signing_hash 모두 표시.
- 1초 이내 (SC-001).

**합격**: 표시된 `action_hash` 가 동일 입력에 대해 Python SDK 가 계산한 값과 일치 (수동 1건 비교).

### QS-1.3 — Action paste & preview (delisting)

`{"type":"validatorL1Vote","D":"BTC-TEST"}` 를 paste.

**기대**: variant = "Delisting (key \"D\")".

### QS-1.4 — Unknown variant

`{"type":"validatorL1Vote","X":{"foo":"bar"}}` 를 paste.

**기대**: variant = "Unknown — proceed with caution" 경고 (orange). preview 는 정상 표시. 서명 흐름은 가능.

### QS-1.5 — MetaMask + testnet 실제 vote

1. Network = testnet 클릭. yellow border.
2. Wallet = MetaMask 클릭. MetaMask popup → connect. 주소 표시.
3. "Sign + Submit" 클릭.
4. MetaMask 의 EIP-712 typed-data popup 확인 — UI 의 typed_data 와 동일.
5. confirm.
6. POST → HF 응답 표시.

**기대**: 응답 `status: "ok"` (action 이 실제 publisher surface 한 valid action 일 때). dedup cache 에 기록.

**합격**: 30초 이내 (SC-001). publisher 가 다음 cycle 에서 같은 outcome 더 propose 안 함.

### QS-1.6 — Dedup

QS-1.5 직후 동일 action 으로 다시 "Sign + Submit".

**기대**: DedupModal 표시. "RESEND" 타이핑 없으면 진행 X.

**합격**: 사용자가 modal Cancel → 어떤 서명도 발생 X.

### QS-1.7 — Private key guard

paste box 에 `0x` + 64 hex 패턴 (테스트용 무작위 hex) 을 입력.

**기대**: 즉시 red banner. 입력 영역 차단. localStorage 등에 기록 0.

## QS-2 — Tier 1 / US3 / SC-003

### QS-2.1 — Ledger 연결

1. Ledger Nano 를 Mac USB 에 꽂음. PIN unlock. Ethereum 앱 open. Settings → Blind signing on.
2. SPA 에서 Wallet = Ledger 클릭.
3. WebHID permission prompt → allow.
4. derivation path 입력 (default `44'/60'/0'/0/0`).
5. 주소 표시.

**기대**: 표시 주소가 validator agent key 등록 주소와 일치.

### QS-2.2 — Ledger 서명

QS-1.2 의 outcome JSON paste 상태에서 Wallet=Ledger, Network=testnet.

1. "Sign + Submit" 클릭.
2. `DeviceHashConfirmModal` 표시.
3. Ledger device 화면에 domain hash 표시 → modal 의 domain hash 와 비교.
4. 양쪽 버튼 press 후 device 화면이 message hash 표시 → modal 의 message hash 와 비교.
5. 둘 다 일치 확인 후 modal 체크박스 + "CONFIRM" 타이핑 → Proceed.
6. device 가 "Sign typed message?" → 양쪽 버튼.
7. POST + 응답.

**기대**: 응답 `status: "ok"`. device hash 와 UI hash 100% 일치 (스크린샷 보존).

**합격**: 3건 (outcome 2 + delisting 1) 모두 통과 (SC-003).

### QS-2.3 — Cross-verify with Python

동일 action + 동일 nonce 로 (a) hl-vote-web Ledger 서명, (b) Python `ledger_outcome_vote.py` Ledger 서명.

**기대**: 두 서명의 `r/s/v` 가 byte-exact (nonce 가 같으므로).

**합격**: 1건 수동 비교 통과.

## QS-3 — Golden fixture (SC-002)

```bash
make golden-gen        # scripts/gen_golden_fixtures.py 실행. 100 fixture 생성.
make verify-golden     # vitest 의 golden suite 만 실행.
```

**기대**: 100/100 byte-exact 일치 (msgpack_hex + action_hash + domain_hash + message_hash + signing_hash).

**합격**: 100% (SC-002). 1건이라도 mismatch 면 stop, 디버깅.

## QS-4 — Bundle size & secret leak (SC-004, SC-006)

```bash
make bundle-size       # out/_next/static/chunks/*.js gzip 합산 < 1MB
make constitution-gate # grep gates
```

**기대**:
- gzip 후 < 1 MB.
- `0x[a-fA-F0-9]{64}` literal grep 결과 0건 (테스트 fixture 의 hex 32B 가 우연히 매치 X — fixture 는 prefix 다른 형태 사용).
- mainnet URL 문자열 — testnet 빌드에서 grep 0건.

**합격**: 모두 통과.

## QS-5 — Mainnet activation (SC-007, CHARTER §7)

Tier 0/1 안정 + 다음 5 게이트 통과 시점에 실행:

1. testnet 실 vote 5건 이상 성공 기록 (history file 또는 별도 ledger 보관).
2. golden fixture 100건 100% 통과 (QS-3).
3. Ledger device hash 수동 검증 3건 (QS-2).
4. `make verify` green.
5. builnad 명시 confirm.

```bash
NEXT_PUBLIC_MAINNET_ENABLED=true make verify
NEXT_PUBLIC_MAINNET_ENABLED=true npm run build
```

**기대**: 별도 mainnet 빌드 산출물 (`out-mainnet/`). 별도 hash 파일 release notes 첨부.

**합격**: mainnet 1건 (적은 위험의 delisting 또는 outcome 1건) 통과. 운영자가 brave-pencil sign-off.

---

## 검증 결과 보존

각 QS 통과 시점에 다음을 commit:

```
docs/qs-runs/
└── 2026-MM-DD-QS-N.md   # 사용 환경, 입력 action, 결과 hash, 응답 JSON, 스크린샷 paths
```

(스크린샷은 별도 storage. 코드 repo 에 image binary 추가는 bundle 영향 없도록 `.gitignore` 패턴 검토.)
