# 아키텍처
## 스택
pnpm 모노레포. apps/web: React + TypeScript + Vite + PixiJS + Zustand. apps/api: Fastify. packages/simulation-core: UI 없는 순수 TypeScript. packages/world-generator, contracts, game-data, test-fixtures. PostgreSQL + Supabase Auth + 객체 저장소(압축 스냅샷). IndexedDB 로컬 저장. Vitest + Playwright + GitHub Actions.

## 실행 흐름
React 정책 명령 → Web Worker 명령 검증 → 법률·자원·예산 검사 → 턴 처리 → 회계·물량 정산 → 이벤트/원인 추적 → 집계 지표 → React 및 PixiJS 읽기 전용 투영.

## 엔진 모듈
인구·가구, 노동시장, 기업·생산, 상품·시장·가격, 토지·건설, 정부·재정, 은행·중앙은행, 정치·법률·선거, 무역·외환·외교, 세계 시뮬레이션. 공통 장부와 명령 API를 통해 상호작용. 엔진은 DOM/네트워크에 의존하지 않는다.

## 결정론
동일한 세계 시드, 명령 로그, 규칙 버전, 엔진 버전이면 동일 결과. Math.random/Date.now 금지. 난수 스트림을 시스템별로 분리하고 처리 순서를 안정적으로 정렬. 화폐는 정수 최소 단위 또는 고정소수점; 저장 시 문자열 직렬화.

## 저장·동기화
IndexedDB에 스냅샷·명령 로그·미동기화 큐 보관. 서버는 save_id, owner_id, revision, engine_version, schema_version, snapshot_key, checksum을 관리. 로그인 사용자는 소유권 검증 후 압축 스냅샷 업로드. 서버 revision과 일치할 때만 조건부 업데이트. 충돌 시 두 버전 보존 후 사용자가 선택하며 자동 덮어쓰기/자동 병합 금지. 오프라인 진행 후 재접속 동기화.

## 보안·운영
API에서 인증 토큰 및 저장 소유권 확인, TLS, 요청/파일 크기 제한, 백업·복구, 저장 스키마 마이그레이션, 개인정보 최소화. 클라이언트 계산이므로 경쟁형 치트 방지 보장은 하지 않는다.

## 규모 확장
초기에는 개인 단위 계산. 인구 증가 시 가구/코호트 집계와 주요 행위자 개별 추적을 혼합하되 인구·돈·재고 보존 검증. 실제 프로파일링 결과가 필요할 때만 Rust/WASM으로 이전.
