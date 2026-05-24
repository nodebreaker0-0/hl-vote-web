# Contract: UI — Screens, States, Guards

> 본 문서는 hl-vote-web 의 화면 / 컴포넌트 / 상태 머신 / 사용자 입력 가드 명세다.
> spec.md 의 User Story / FR 과 cross-ref. Constitution VII / VIII / IX 의 UX 강제 규정 포함.

## 1. Top-level page (`app/page.tsx`)

```
┌────────────────────────────────────────────────────────┐
│ hl-vote-web   [version]                  [GitHub link] │
├────────────────────────────────────────────────────────┤
│ Network:  [ Testnet ]  [ Mainnet ]   ← unset default   │
├────────────────────────────────────────────────────────┤
│ Action JSON                                            │
│ ┌────────────────────────────────────────────────────┐ │
│ │ {                                                  │ │
│ │   "type": "validatorL1Vote",                       │ │
│ │   "O": { ... }                                     │ │
│ │ }                                                  │ │
│ └────────────────────────────────────────────────────┘ │
│ [Parse / Preview]                                      │
├────────────────────────────────────────────────────────┤
│ Action Summary                                         │
│  type:        validatorL1Vote                          │
│  variant:     Outcome (key "O")                        │
│  nonce:       1716530000123  (Date.now() — refresh)    │
│  msgpack:     0xXX...  (NN bytes)                      │
│  action_hash: 0xXX...                                  │
│  EIP-712 typed_data:  [collapsible JSON view]          │
│  domain_hash:  0xXX...                                 │
│  message_hash: 0xXX...                                 │
│  signing_hash: 0xXX...                                 │
├────────────────────────────────────────────────────────┤
│ Wallet:   [ MetaMask ]  [ Ledger ]                     │
│            (connected: 0xabc...123)                    │
├────────────────────────────────────────────────────────┤
│ [Sign + Submit]                                        │
└────────────────────────────────────────────────────────┘
```

## 2. Component map

| Component | Path | Responsibility |
|---|---|---|
| `NetworkSelector` | `components/NetworkSelector.tsx` | testnet/mainnet 토글. Constitution VIII: default 없음. mainnet 빌드 아니면 mainnet 옵션 disabled. |
| `ActionPasteBox` | `components/ActionPasteBox.tsx` | textarea, JSON parse on blur, hex private-key guard |
| `ActionPreview` | `components/ActionPreview.tsx` | msgpack hex, action_hash, typed-data preview |
| `WalletSelector` | `components/WalletSelector.tsx` | MetaMask / Ledger 토글, 연결된 주소 표시 |
| `LedgerConnector` | `components/LedgerConnector.tsx` | WebHID prompt, derivation path 입력, 주소 조회 |
| `DeviceHashConfirmModal` | `components/DeviceHashConfirmModal.tsx` | Constitution VII: typed-confirm |
| `DedupModal` | `components/DedupModal.tsx` | Constitution IX: 동일 action 재submit 시 |
| `ResponseViewer` | `components/ResponseViewer.tsx` | HF 응답 JSON 표시, 성공/실패 색상 |
| `HistoryViewer` | `app/history/page.tsx` (Tier 2) | localStorage `hlVoteHistory` 리스트 |

## 3. State machine

```
idle
  └─ (paste & valid JSON) ──> previewed
       └─ (parse fail)     ──> idle (red banner)

previewed
  ├─ (network unset)        ──> previewed (sign disabled)
  ├─ (wallet unset)         ──> previewed (sign disabled)
  ├─ (dedup hit)            ──> dedupModal ─[confirm]─> ready
  └─ (network+wallet set)   ──> ready

ready
  ├─ (sign click, MetaMask) ──> signing_metamask
  └─ (sign click, Ledger)   ──> ledger_confirm ─[ok]─> signing_ledger

signing_metamask
  ├─ (user reject)   ──> ready (red banner)
  ├─ (sign success)  ──> submitting

signing_ledger
  ├─ (device reject) ──> ready (red banner)
  ├─ (sign success)  ──> submitting

submitting
  ├─ (HF 200 + ok)   ──> success (localStorage 기록)
  ├─ (HF 200 + err)  ──> err_response
  └─ (network err)   ──> err_network

success
  └─ (paste new)     ──> idle (history reflected)

err_response
err_network
  └─ (retry / new paste)
```

## 4. 입력 가드

### 4.1 Action paste

- `JSON.parse` 실패 → red banner "Invalid JSON". sign disabled.
- top-level 이 object 아님 → 동일.
- `obj.type !== "validatorL1Vote"` → red banner "Refusing to sign non-validatorL1Vote action".
- 내용에 `0x[0-9a-fA-F]{64}` 매치 → red banner "Possible private key detected. Refusing.". 입력 차단 + auto-clear suggestion.
- 내용에 BIP39 12/24 단어 매치 → 동일 차단 (Tier 1+).

### 4.2 Network

- unset 상태 → sign 버튼 disabled + tooltip "Select network".
- mainnet 클릭 (mainnet 빌드 시) → 즉시 빨강 banner + typed-confirm modal "Type MAINNET to enable".
- mainnet 클릭 (testnet 빌드 시) → 클릭 자체 무시 + tooltip.

### 4.3 Wallet

- MetaMask 미감지 → 옵션 disabled + 안내 "Install MetaMask".
- Ledger / WebHID 미지원 브라우저 → 옵션 disabled + "Use Chrome/Edge/Brave".

### 4.4 Sign 단계 (Ledger)

- `DeviceHashConfirmModal` 표시:
  ```
  ┌────────────────────────────────────────────┐
  │ Confirm device hashes                      │
  │                                            │
  │ Domain hash (compare with device screen):  │
  │   0xXXXXXXXXXXXX...XXXX                    │
  │                                            │
  │ Message hash (compare with device screen): │
  │   0xYYYYYYYYYYYY...YYYY                    │
  │                                            │
  │ [ ] I verified both hashes match           │
  │     the device display                     │
  │                                            │
  │ Type CONFIRM to proceed: [__________]      │
  │                                            │
  │     [ Cancel ]      [ Proceed ]  (gray     │
  │                       until both above)    │
  └────────────────────────────────────────────┘
  ```
- 체크박스 + typed "CONFIRM" 둘 다 통과해야 Proceed 활성.
- Constitution VII / FR-024 직결.

### 4.5 Dedup

- submit 직전 `sha256(msgpack(action))` 계산, `localStorage.hlVoteHistory[key]` 존재 시:
  ```
  ┌────────────────────────────────────────────┐
  │ Duplicate send detected                    │
  │                                            │
  │ Previously sent: 2026-05-24 14:30 UTC      │
  │ Network: testnet                           │
  │ Response: { status: "ok", ... }            │
  │                                            │
  │ Sending again may be slashable.            │
  │                                            │
  │ Type RESEND to proceed: [_________]        │
  │                                            │
  │     [ Cancel ]      [ Resend ]             │
  └────────────────────────────────────────────┘
  ```
- typed "RESEND" 없이는 진행 X.

## 5. 색상 / 시각 단서

| 상태 | 색 |
|---|---|
| Testnet | yellow accent border |
| Mainnet (활성 빌드) | red accent border + bold |
| Disabled | gray |
| Success | green |
| Error | red |
| Warning (unknown variant) | orange |

Tailwind 기본 팔레트로 충분. 외부 폰트 / 이미지 로드 X (Constitution V).

## 6. 접근성 / i18n

- Tier 0/1: 영어만. 운영자 (builnad) 가 영문 능통이고 publisher Slack 도 영문.
- 사용자가 추후 한국어 추가 요청 시 별도 PR. 본 contract 에선 미커밋.
- 색상 외에 텍스트 라벨 / aria-label 로 상태 전달 (색맹 대응).
- 모든 hash / hex 표시는 monospace.

## 7. 라우팅

- `/` — 메인 sign-and-submit.
- `/history` — (Tier 2) localStorage 리스트.
- 그 외 경로 → 404 (Next.js default).

## 8. 빌드 산출물 contract

- `out/index.html` + `out/_next/...` static assets.
- 환경별 산출물:
  - testnet only: `npm run build` (NEXT_PUBLIC_MAINNET_ENABLED unset).
  - mainnet enabled: `NEXT_PUBLIC_MAINNET_ENABLED=true npm run build`.
- 두 빌드의 `dist/SHA256SUMS.txt` 가 release notes 에 첨부.

## 9. CSP

빌드 시 `app/layout.tsx` 의 `<head>` 에 정적 meta:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz;
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
">
```

`'unsafe-inline'` for style 은 Tailwind 의 CSS-in-JS / Next.js inline style 때문에 불가피. JS 쪽은 `'unsafe-inline'` 금지.

## 10. 비기능 (logging / analytics)

- 본 SPA 는 console.log 도 production build 에서 최소화. eslint 가 `no-console: warn`.
- 절대 fetch X: GA, Sentry, Mixpanel, Datadog RUM, etc.
- bug report 는 GitHub issue 로만.

## 11. UI 변경 정책

- Constitution VII / VIII / IX 직결 컴포넌트 (NetworkSelector, DeviceHashConfirmModal, DedupModal) 의 동작은 `delegation_matrix.md §3` 의 `🔴 confirm` / `📛 forbidden` 분배 적용.
- 그 외 visual / copy 는 `🟢 auto` 지만 슬래시 경고 약화는 X.
