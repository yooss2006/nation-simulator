# Nation Simulator · 신생국

가상 현대 세계의 초대 대통령으로 시작하는 PC 웹 싱글플레이 국가 운영 시뮬레이션입니다. 1턴은 1개월이며 플레이어만 시간을 진행합니다.

> 상태: **0.1 내부 통합 개발 빌드**. 첨부 기획의 최초 착수 스프린트와 여러 시스템의 실행 가능한 기반을 구현했습니다. 기획 전체가 완성되거나 출시 기준을 통과한 상태는 아닙니다. 원본의 모든 요구사항은 `docs/design/`에 변경 없이 보존했습니다.

## 실행

Node.js 22 이상, pnpm 10.18.3을 사용합니다.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

http://localhost:5173 에서 정치 성향, 난이도, 시드를 선택하고 취임합니다. 지도나 대시보드에서 명령을 예약하고 '다음 달 진행'을 누릅니다. 잘못된 명령이 있으면 해당 월은 진행하지 않습니다. 명령을 취소하거나 수정한 뒤 다시 실행할 수 있습니다.

```sh
pnpm test            # 엔진 / 저장 API
pnpm build           # TypeScript 검사 + 웹 프로덕션 빌드
pnpm format:check
pnpm exec playwright install chromium
pnpm test:e2e        # 실제 Chromium 플레이 / 로컬 저장 복원
```

## 구현된 흐름

- pnpm 모노레포, React/TypeScript/Vite, Zustand, PixiJS, Fastify, Vitest, Playwright, GitHub Actions
- 정치 성향 3축 입력, 난이도별 초기 자원, 1,000명 시민 / 250가구 / 12기업 / 256필지 생성
- UI와 분리된 Web Worker 월 진행, 시스템별 시드 난수, 정렬 직렬화, 상태 해시
- 기업 채용 → 임금과 소득세 → 국내 식량 구매 / 협정국 수입 → 가격 조정 / 폐기 → 공공조달
- BigInt 최소 화폐 단위, 균형 분개, 통화량 보존, 물량 입출고 장부, 출생·사망 대조
- 소득세 법안 의회 표결 / 다음 월 시행, 공공사업 선지급 및 6개월 준공, 국채 발행 / 이자 / 상환
- 24개월 초대 총선, 이후 48개월 간격 총선, 11석 생트라고식 배분
- 48개월 대통령 선거, 과반 미달 결선투표, 연임 또는 대통령직 상실 시 종료
- PixiJS 아이소메트릭 지도 / 카메라 / 필지 선택, 경제·재정·가구·기업·의회·외교·보고서 화면
- IndexedDB 자동 저장, JSON 내보내기 / 가져오기, 스키마 검증 및 손상 감지
- Supabase 이메일 링크 로그인 UI, 인증·소유권 기반 저장 API, PostgreSQL revision 비교 갱신, gzip 객체 저장, 충돌 시 서버 복원 또는 로컬 새 슬롯 저장

## 아직 구현하지 않았거나 단순화한 부분

출시 조건과 남은 작업은 [구현 상태](docs/IMPLEMENTATION_STATUS.md)를 확인하세요. 특히 실제 은행 신용창조·기업 대출, 정당 생성/분열/합당과 유연형 후보 명부, 이민/이주, 민간 건설, 상세 주변국 및 세계 시장, 100년 회귀와 성능 검증은 미완료입니다. 현재 은행은 자본으로 국채를 인수하는 최소 모형이며 독립 중앙은행의 금리 규칙도 내부 검증용입니다.

정책 효과는 현실 예측이 아닙니다. 거래 흐름을 실행하고 검증할 수 있는 개발 기반이며 경제 파라미터 교정이 필요합니다.

## 디렉터리

```text
apps/web                  React 화면, PixiJS 지도, Web Worker, IndexedDB
apps/api                  인증 저장 API, PostgreSQL / 객체 저장 어댑터
packages/contracts        엔티티 / 명령 / 워커 메시지
packages/simulation-core  순수 계산, 회계, 정치, 저장 형식
packages/world-generator  난이도와 시드 기반 세계 생성
packages/game-data        수정 가능한 규칙과 초기값
packages/test-fixtures    반복 가능한 테스트 세계
```

원본 PRD / 아키텍처 / 데이터 모델 / 태스크 / 테스트 전략: [docs/design](docs/design)
온라인 저장 설정: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 저장 원칙

로컬 모드는 계정이나 서버 없이 실행됩니다. 금액은 BigInt이며 저장할 때 `{"$money":"1500"}` 형태로 직렬화됩니다. 동일 엔진/규칙/시드/명령에서 결과를 재현합니다. FNV 상태 해시는 재현 비교용이며 보안 검증용이 아닙니다. 서버 객체에는 별도로 SHA-256을 적용합니다.

현재 자동 저장은 브라우저당 1슬롯입니다. 다른 게임 시작 전 JSON 내보내기로 보존하세요. 서버 저장에는 서비스 설정이 필요하며 이 저장소 생성 작업에서는 외부 인프라를 배포하지 않았습니다. 새로운 스키마 마이그레이션이 준비되기 전까지 다른 버전은 명시적으로 거부합니다.
