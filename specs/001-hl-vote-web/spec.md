# Feature Specification: hl-vote-web (validatorL1Vote 정적 SPA)

**Feature Branch**: `001-hl-vote-web`
**Created**: 2026-05-24
**Status**: Draft
**Input**: builnad — "outcome vote + delisting vote (모두 validatorL1Vote, inner shape 만 다름) 를 Mac 로컬에서 Ledger Nano + 브라우저로 서명·제출하는 정적 SPA 가 필요. 현재 동선 (venv + Python ledgereth + 파일 paste) 을 대체."

## User Scenarios & Testing

### User Story 1 — Outcome vote 를 한 번에 서명·제출 (P1, MVP)

**시나리오**: builnad 는 Slack `outcome_actions_channel` 에서 publisher 가 surface 한 outcome action JSON 을 본다 (예: `{"type":"validatorL1Vote","O":{"registerTokensAndStandaloneOutcome":{...}}}`). 현재 동선은 Mac 터미널 → venv → Python 파일 편집 → 실행. hl-vote-web 에서는 브라우저 한 화면에서 paste → 요약 확인 → MetaMask (또는 Ledger) 서명 → HF endpoint POST 까지 한 흐름으로 끝난다.

**Why this priority**: outcome vote 는 가장 자주 발생하는 액션. publisher 가 testnet 1시간에 수 건 흘림. 운영 마찰이 가장 큰 부분이라 가치 즉발.

**Independent Test**: testnet 환경에서 publisher Slack 의 실제 outcome action JSON 1건을 paste → MetaMask 서명 → submit → HF 응답 `status:"ok"` 수신 + publisher 가 다음 cycle 에서 같은 outcome 을 더 이상 propose 하지 않으면 통과.

**Acceptance Scenarios**:
1. **Given** outcome action JSON 을 paste box 에 입력, **When** 사용자가 "Preview" 누름, **Then** action type 요약 + msgpack hex + action_hash (keccak256) + EIP-712 typed-data preview 가 표시된다. 1초 이내.
2. **Given** preview 가 정상 표시, **When** MetaMask 가 연결되어 있고 "Sign + Submit" 클릭, **Then** MetaMask popup 이 EIP-712 typed-data 를 보여주고, 사용자가 confirm 시 HF endpoint 로 POST + 응답 표시.
3. **Given** submit 성공, **When** 같은 action 으로 한 번 더 submit 시도, **Then** dedup modal 이 뜨고 typed-confirm 없이는 진행 X.
4. **Given** 같은 action 의 testnet vs mainnet 토글, **When** network 가 바뀜, **Then** typed-data 의 phantom_agent.source 가 `b` (testnet) ↔ `a` (mainnet) 로 바뀌고 action_hash 는 동일.

---

### User Story 2 — Delisting vote 를 동일 흐름으로 (P1, MVP)

**시나리오**: HF 가 거버넌스 차원에서 특정 자산/시장을 delisting 결정 → publisher 가 `{"type":"validatorL1Vote","D":"<id>"}` 형태로 surface. builnad 는 동일 SPA 에서 paste-and-sign. action type 이 outcome 인지 delisting 인지 UI 가 구분하여 표시하되 서명 흐름은 동일.

**Why this priority**: outcome 만큼 자주는 아니지만 거버넌스 중요도 높음. 별도 도구 만들면 코드 중복 + 운영자 혼동. **paste-and-sign 통일** 이 본 프로젝트의 핵심 design choice.

**Independent Test**: 합성 delisting action `{"type":"validatorL1Vote","D":"BTC-TEST"}` 를 testnet 에 paste → 서명 → submit → HF 응답 정상 (action 자체가 dummy 라 reject 될 수 있지만 서명 검증은 통과해야).

**Acceptance Scenarios**:
1. **Given** delisting action JSON 을 paste, **When** preview, **Then** UI 가 "Delisting vote" 라벨을 표시하되 msgpack 직렬화는 outcome 과 동일 코드 path.
2. **Given** outcome → delisting 으로 paste 교체, **When** preview 재실행, **Then** action_hash 가 다르게 계산 (당연).
3. **Given** 향후 HF 가 새 inner key 추가 (예: `"G"`), **When** unknown inner key 의 action 을 paste, **Then** UI 가 "Unknown validatorL1Vote variant — proceed with caution" 경고만 표시하고 서명 흐름은 동일하게 동작.

---

### User Story 3 — Ledger 동선 (MetaMask import) (P2)

**시나리오**: builnad 는 mainnet validator v-key 가 들어있는 Ledger Nano 를 Mac USB 에 꽂은 상태에서 MetaMask 의 "Connect hardware wallet → Ledger" 로 그 account 를 이미 import 해두었다. hl-vote-web 의 MetaMask 버튼으로 연결 → MetaMask UI 에서 active account 를 Ledger account 로 선택 → 평소처럼 Sign + Submit → MetaMask 가 typed-data 를 device 로 라우팅 → device 화면에 domain hash + message hash 표시 → 사용자가 SPA Preview 패널의 hash 와 직접 비교한 후 device 에서 confirm.

**Why this priority**: 현재 동선의 진짜 대체는 Ledger 경로. MetaMask 가 hardware wallet 라우팅을 책임지므로 별도 WebHID 코드 불요 (Constitution §VII).

**Independent Test**: 동일 testnet action 1건을 (a) Python `ledger_outcome_vote.py` 로 서명한 결과와 (b) hl-vote-web (MetaMask + 임포트된 Ledger) 로 서명한 결과의 `r/s/v` 가 일치 (동일 nonce 사용 시).

**Acceptance Scenarios**:
1. **Given** MetaMask 의 active account 가 imported Ledger account, **When** "Sign + Submit", **Then** MetaMask 가 device 와 통신 → device 가 domain hash + message hash 표시.
2. **Given** device 화면이 표시한 두 hash, **When** 사용자가 SPA Preview 의 domain_hash / message_hash 와 비교, **Then** 일치 시 device 의 양쪽 버튼 confirm → MetaMask 가 signature 반환 → POST.
3. **Given** device hash 가 Preview hash 와 다름 (host 탈취 의심), **When** 사용자가 device 에서 reject, **Then** MetaMask 에서 4001 에러 → UI 가 "User rejected the signature" 표시 + history 기록 0.
4. **Given** Ledger 가 미연결 / 앱 미오픈, **When** sign 시도, **Then** MetaMask 가 device-not-available 에러 → UI 가 그 메시지 표시.

---

### User Story 4 — Mainnet 활성 (P3, Tier 1 → Tier 2 단계적)

**시나리오**: Tier 0/1 안정 후, builnad 는 mainnet 빌드 (`NEXT_PUBLIC_MAINNET_ENABLED=true`) 를 만들어 별도 배포. CHARTER §7 의 5개 gate 통과 시점에서.

**Acceptance Scenarios**: CHARTER §7 참조. spec.md 에서는 SC-007 만 명시.

---

### Edge Cases

- **paste 한 JSON 이 invalid** → 즉시 syntax error 표시, sign 비활성. (msgpack 직렬화 시도 X)
- **paste 한 JSON 의 top-level 이 `{"type":"validatorL1Vote", ...}` 가 아님** → red banner "Not a validatorL1Vote action — refusing to sign". (다른 액션 타입은 의도적 미지원, Tier 3+ 검토)
- **paste 한 JSON 에 hex 32B private key 패턴** → 즉시 red banner + 입력 차단 + clipboard 클리어 권유.
- **MetaMask 가 잘못된 chain 에 연결** → typed-data 의 chainId 가 1337 (HL L1 phantom) 이라 MetaMask 가 모르는 chain 으로 보일 수 있음. EIP-712 typed-data 는 chain 무관 서명이라 OK. UI 가 "이는 Hyperliquid L1 phantom signer 라 MetaMask 에서 chain 미인식이 정상" 안내.
- **WebHID 미지원 브라우저 (Firefox/Safari)** → Ledger 옵션 disabled + "Use Chrome/Edge/Brave for Ledger" 안내.
- **localStorage 차단** → dedup 동작 안 함. red banner "Storage disabled — duplicate-send protection off. Proceed with caution."
- **publisher 가 같은 outcome 을 두 번 propose** (정상 — vote 가 아직 안 모임) → 사용자가 첫 번째 submit 후 두 번째 paste 시 dedup hit. typed-confirm 필요. CHARTER §6.
- **nonce 시계 스큐** → submit 직전 `Date.now()` 재계산. HF 가 reject 시 명확한 에러 + 재시도 버튼.
- **Mac sleep → 깬 직후 Ledger 미감지** → "Reconnect Ledger" 버튼.

## Requirements

### Functional Requirements

#### Tier 0 — MetaMask + testnet paste-and-sign (P1, MVP)

- **FR-001**: System MUST `{"type":"validatorL1Vote", ...}` 형태의 action JSON 을 paste 받아 syntax check + top-level type 검증.
- **FR-002**: System MUST paste 된 JSON 을 **insertion order 그대로** msgpack 직렬화한다 (key 정렬 X, mutation X). 직렬화 결과 bytes 를 hex 로 UI 에 노출.
- **FR-003**: System MUST `action_hash = keccak256(msgpack(action) || nonce(8B BE) || flags)` 를 계산하여 32B digest 를 UI 에 노출.
- **FR-004**: System MUST `phantom_agent = {source: "a"|"b", connectionId: action_hash}` + `l1_payload(phantom_agent)` 의 EIP-712 typed-data 를 구성하여 UI 에 노출.
- **FR-005**: System MUST network selector 를 제공 (testnet / mainnet). default 없음. mainnet 빌드 아니면 mainnet disabled.
- **FR-006**: System MUST MetaMask 의 `eth_signTypedData_v4` 로 서명을 수행하고 `{r, s, v}` 를 받는다.
- **FR-007**: System MUST `{action, nonce, signature, vaultAddress: null, expiresAfter: null}` 를 HF `/exchange` endpoint 로 POST 한다. URL 은 network 에 따라 분기.
- **FR-008**: System MUST 응답 JSON 을 UI 에 표시 (성공/실패/에러 텍스트).
- **FR-009**: System MUST 성공 응답 (`status:"ok"` 또는 200) 을 받으면 `sha256(msgpack(action))` 키로 localStorage `hlVoteHistory` 에 `{nonce, network, response, ts}` 저장.
- **FR-010**: System MUST 동일 key 로 submit 시도 시 dedup modal 을 띄우고, typed-confirm ("RESEND") 입력 시에만 진행.
- **FR-011**: System MUST hex `0x[0-9a-fA-F]{64}` 패턴이 paste box 또는 다른 입력에 들어오면 red banner + 입력 차단.

#### Tier 1 — Ledger Nano via WebHID (P2)

- **FR-020**: System MUST `@ledgerhq/hw-transport-webhid` 로 Ledger 와 연결 prompt 수행.
- **FR-021**: System MUST derivation path 입력 필드를 제공 (default `44'/60'/0'/0/0`). 입력 시 해당 path 의 주소를 표시.
- **FR-022**: System MUST EIP-712 typed-data 의 domain hash / message hash 를 SPA 측에서 미리 계산하여 표시.
- **FR-023**: System MUST Ledger `signEIP712HashedMessage(path, domain_hash_hex, message_hash_hex)` 를 호출하여 `{r, s, v}` 를 받는다.
- **FR-024**: System MUST 서명 전에 typed-confirm modal 을 띄워, 사용자가 device 화면의 domain hash 와 SPA UI 의 domain hash 가 일치함을 확인하는 체크박스 + "device hash matches" typed string 입력을 강제.
- **FR-025**: System MUST WebHID 미지원 브라우저에서 Ledger 옵션을 disabled + 안내 메시지 표시.

#### Tier 2 — Mainnet + 추가 UX (P3)

- **FR-030**: System MUST `NEXT_PUBLIC_MAINNET_ENABLED=true` 빌드에서만 mainnet endpoint 호출을 활성화.
- **FR-031**: System MUST mainnet 모드 entering 시 빨강 banner + 즉시 typed-confirm.
- **FR-032**: System MUST history viewer 페이지에서 localStorage 의 모든 submitted action 을 표시 (시각, action hash, network, response 요약).
- **FR-033**: System SHOULD action inner-shape (`O.registerTokens...`, `D`, etc.) 별로 friendly 요약 (예: token 이름, market id) 을 표시. **msgpack 직렬화에는 영향 X**.

#### 보안 / 운영 / 통합 요구사항

- **FR-040**: System MUST CSP 메타태그를 빌드 산출물에 포함 — `connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz; script-src 'self'; object-src 'none'; base-uri 'none'`.
- **FR-041**: System MUST 어떤 외부 telemetry / analytics 도 fetch / send X.
- **FR-042**: System MUST 런타임에 외부 CDN script 를 로드 X. 모든 JS/CSS 는 `out/` 산출물 내부.
- **FR-043**: System MUST 빌드 산출물 zip 의 SHA-256 을 release notes 에 자동 게시 (GitHub Actions).
- **FR-044**: System MUST `lib/signing/` 의 모든 함수가 pure (no side effect, no I/O) — golden fixture 가능.

### Success Criteria

- **SC-001**: testnet 에서 outcome action 5건 + delisting action 1건 paste-and-sign-and-submit 전체 P95 시간 ≤ 30초 (사람 입력 제외).
- **SC-002**: Python SDK ↔ TS golden fixture 100건 (outcome + delisting 혼합) 100% byte-exact 일치 (action_hash + EIP-712 hash).
- **SC-003**: Ledger Nano 로 testnet 3건 서명 — device hash 와 UI hash 100% 일치 (사용자 수동 검증).
- **SC-004**: 빌드 산출물 gzip 후 < 1 MB.
- **SC-005**: `make verify` 7 gate 100% 통과.
- **SC-006**: hex 32B private key 패턴 텍스트가 코드/주석/fixture/문서 어디에도 commit 되지 않음 (verify gate grep).
- **SC-007**: mainnet 활성 시점에 CHARTER §7 의 5 게이트 모두 ✅ + builnad 명시 confirm 기록.

## Out of Scope (Tier 0/1/2 모두 X)

- `validatorL1Vote` 외의 action 타입 (예: `usdSend`, `order`, agent approval 등) 서명.
- Multi-sig flow.
- Mobile / iOS / Android wallet (Tier 3+ 검토).
- Action template 작성 도구 (사용자가 publisher Slack 없이 action 을 새로 만드는 기능 — 의도적 미지원, 슬래시 위험 큼).
