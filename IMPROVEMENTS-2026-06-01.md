# hl-vote-web 개선 리스트 — 2026-06-01

> 근거: 첫 mainnet outcome settlement 라운드(공개 온체인 활동) + validator 운영 피드백.
> 본 도구 핵심 가치 = "사람이 본 validatorL1Vote JSON 을 **그대로** 서명·제출" + "사람이 sanity check 하기 쉽게 **시각화**". 아래 항목은 모두 msgpack 직렬화(= paste 순서)를 건드리지 않는 **표시(UI) / 키 모델 / 검증 보조** 개선이며 CHARTER Non-goals 와 충돌하지 않는다.

첫 mainnet settle 라운드에서 settleOutcome 의미 해석에 혼선이 컸고, **outcome id ↔ side index 매핑**이 부주의한 사람 실수의 가장 큰 원천으로 확인됐다. hl-vote-web 이 정확히 이 마찰을 없애는 도구다.

---

## P1 — 이번 라운드가 직접 정당화하는 핵심 기능

### I-1. settleOutcome friendly decode 패널 (★ 최우선)
- **근거**: `settleFraction` 은 인덱스가 아니라 연속값 X (첫 사이드=yes→X, 둘째=no→(1−X)). 운영자가 인덱스로 오해하기 쉬움. side 이름은 outcomeMeta `sideSpecs` 에만 있어 맨숫자만으론 식별 불가.
- **무엇**: paste 된 action 의 inner key 가 `settleOutcome` 이면 아래를 비-mutating 디코드해 표시:
  - `outcome` (예 110) → outcomeMeta 의 마켓 name (I-2 연동).
  - `settleFraction` (예 "1") → "**yes 사이드 = X (=1.0)**, no 사이드 = (1−X) (=0.0)" 로 명시. **인덱스 아님**을 라벨로 못박기.
  - sideSpecs 순서: `[0] = yes`, `[1] = no` 를 side 이름과 나란히.
  - `details` 전문(긴 텍스트)을 접지 않고 prominent 하게 — 서명 전 spec/사실 대조용.
- **주의**: 이 디코드는 표시 전용. 서명·제출은 항상 paste 원문 msgpack 그대로 (CHARTER §1.4 / Non-goal).

### I-2. outcomeMeta 조회 + 교차검증 (`/info` 화이트리스트 추가 검토)
- **근거**: id↔이름·side 매핑이 최대 실수원. outcomeMeta 를 조회해 결정론적으로 resolve 하면 사람 검증이 단단해짐.
- **무엇**: 선택한 네트워크의 `/info` 에 `{"type":"outcomeMeta"}` POST(읽기 전용) → paste action 의 `outcome` id / sideSpecs index 를 응답과 대조해 **resolved 마켓명·side명**을 표시. 불일치 시 빨강 경고.
- **CHARTER 영향**: 현재 런타임 fetch 화이트리스트는 `/exchange` 만. `/info` 추가는 **Constitution VII (외부 fetch 화이트리스트) 게이트 변경** → CHARTER §4 + constitution 개정 1줄 필요. info 는 서명·키와 무관한 공개 읽기라 위협 표면 작음. 토글로 "오프라인 모드"(fetch 안 함, 수동 입력) 보존.
- **대안(백엔드 0 유지)**: fetch 실패/오프라인 시 운영자가 outcomeMeta JSON 을 붙여넣으면 클라이언트가 cross-check.

### I-3. Submit 전 sanity-check 게이트 (체크리스트 confirm)
- **근거**: settle/deploy action 은 자동 생성(LLM 기반)이라, 보내기 전 spec 대조 sanity check 가 필수.
- **무엇**: settle/deploy action 제출 직전 체크리스트: ① outcome id 가 outcomeMeta 와 일치 ✓ ② side index↔이름 확인 ✓ ③ settleFraction 이 의도한 승자 비중 ✓ ④ details 본문이 실제 사실과 부합 ✓. 모두 체크 전 Submit 비활성. (CHARTER §6 "device hash 일치 확인 모달"과 동일 패턴 확장.)

### I-4. settleOutcome / registerTokensAndStandaloneOutcome inner-shape 커버리지 확인
- **근거**: deploy(`registerTokensAndStandaloneOutcome`) → settle(`settleOutcome`) 두 inner shape 가 mainnet 에 실제 등장.
- **무엇**: 두 shape + delisting(`D`) + 기존 outcome variant 가 paste-and-sign 회귀 테스트(golden)에 포함돼 있는지 점검. settle 의 `details` 긴 문자열·유니코드가 msgpack byte-exact 유지되는지 fixture 추가.

---

## P2 — 키 모델 / 로드맵 (HF 결정 대기)

### I-5. signer key 서명 경로 추적 (HF 구현 시 대응)
- **근거**: validator 주소에 multisig 셋업인 운영자들이 signer key 로도 투표 가능하길 요청. HF 검토 중. agent key 는 비권장(노드 머신을 떠나지 않는 signer 가 보안상 선호).
- **무엇 (지금)**: 코드 변경 없음. HF 의 signer-key 투표 지원 결정을 모니터링. 결정되면 hl-vote-web 서명 키 선택지(MetaMask/Ledger = validator key)에 signer-key 경로가 추가될 수 있음 — spec 영향 사전 검토.
- **방향성 확인**: hl-vote-web 은 **agent key 입력 폼을 의도적으로 안 만든다**(CHARTER Non-goal). "agent 비권장" 방향이 이 설계가 옳음을 재확인. multisig-on-validator 시나리오는 Ledger/MetaMask 의 multisig 흐름으로 대응(G-2).

### I-6. 중복 제출 dedup 마찰 재조정 (선택)
- **근거**: 같은 outcome 에 중복 send-sign 해도 **투표는 1회만 카운트**(slash 아님). 또한 `validatorL1Votes` 응답의 `votes[]` 가 이미 "내가 투표했는지" 를 알려줌.
- **상태**: 낮은 가치 — votes[] 기반 "Already voted" 처리가 이미 있음. 보류/드롭.

---

## P3 — 향후 대형 마켓 대비

### I-7. multi-side / piecemeal settle 표시
- **근거**: 멀티-outcome(CPI 류)은 단일 원자적 settle action, 단 일부 No 가 최종 Yes 전 확정 시 piecemeal 가능.
- **무엇**: 3-way+ outcome 의 단일 settle action 의 각 side fraction 을 표로 표시. piecemeal(부분) settle 도 어떤 side 가 확정/미확정인지 시각화.

### I-8. 대형 multi-option 마켓(World Cup 류) UI 확장 대비
- **근거**: 대형 다옵션 마켓은 모든 옵션 수용에 프론트엔드 확장 필요.
- **무엇**: side/option 수가 많은 deploy/settle action 의 nameAndDescription·sideNames·sideSpecs 리스트가 길어질 때 가독성 유지(스크롤/접기). 표시 전용, 직렬화 무영향.

---

## 우선순위 큐 (hl-vote-web 한정)
1. **I-1** settleOutcome friendly decode — ✅ 구현(2026-06-01)
2. **I-3** submit 전 sanity-check 게이트 — ✅ 구현
3. **I-2** outcomeMeta 조회 + 교차검증 — ✅ 구현(+ localStorage 캐시)
4. **I-4** inner-shape golden 커버리지 — ✅ 구현
5. **I-6** dedup 카피/동작 — ❌ 드롭(votes[]가 이미 처리)
6. (대기) **I-5** signer key — HF 결정 후
7. **G-2** multisig vote 서명 — ⏳ 진행 중
8. **I-7 / I-8** 대형·멀티사이드 마켓 — 수요 생기면
