# Cloudflare 정적 배포 — 사용량 과금 방지

현재 배포는 정적 파일 전용입니다. `wrangler.jsonc`에는 `main`, API 라우팅, DB/스토리지 바인딩, Cron이 없습니다. 기본 배포 명령은 `pnpm cf:deploy`입니다. 서버 Worker 스크립트는 업로드하지 않습니다.

- 시뮬레이션: 사용자 브라우저의 Web Worker에서 실행
- 저장: IndexedDB 자동 저장 및 파일 내보내기/불러오기
- 온라인 저장: 비활성화
- 로그인: Supabase Auth 검증 후 게임 실행. Google 제공자 연결은 대기 중([설정 상태](AUTH.md))
- R2/Hyperdrive: 생성하지 않음
- Supabase: Free 조직 확인. Auth만 연결하며 데이터 API/온라인 저장은 비활성
- 보안: Cloudflare 기본 네트워크 보호, 외부 프레임 삽입 차단, CSP 및 보안 응답 헤더

Cloudflare 공식 정책상 정적 자산 요청은 무료·무제한입니다. 유료 Worker 실행, Workers Caching, 유료 저장소를 추가하지 않습니다. 계정에 이미 존재하는 다른 프로젝트의 요금은 이 배포와 별개입니다. 결제 조회 권한이 없어 계정 전체 청구 금액은 검증하지 못했습니다.

DDoS 발생 자체나 무중단 운영을 보장할 수 없습니다. 이 구성은 공격으로 유료 서버 실행/저장소 사용량이 늘어나는 경로를 제거합니다. 별도 사용자 도메인이 없어 도메인별 WAF 규칙은 설정하지 않았습니다. 설정/요금제/서비스 정책이 바뀌면 재검토해야 합니다.

정적 파일 `_headers`에서 CSP, 프레임 차단, MIME 스니핑 차단을 적용합니다. 서버 엔드포인트와 사용자 입력 업로드가 없습니다. 향후 온라인 저장을 켜려면 비용 정책을 다시 검토해야 하며, 아래 준비 문서의 연결 절차를 현재 운영에 적용하지 않습니다.

## 이전 온라인 저장 설계 참고 — 현재 비활성

# Cloudflare 무료 플랜 배포

현재 코드는 Cloudflare Workers에서 정적 웹과 API를 제공하고, Supabase Auth/PostgreSQL 및 R2를 사용하는 구성입니다. 실제 계정 리소스 생성·서비스 활성화·실서버 배포는 별도입니다. `CLOUD_SAVES_ENABLED=false`가 기본이므로 계정 정보 없이 로컬 플레이 웹부터 배포할 수 있습니다.

## 무료 운영을 위한 구현

- API는 Workers 기본 fetch 핸들러로 실행합니다. 상주 Node 서버가 필요 없습니다. 기존 Fastify 서버는 비교·회귀 검증용으로 보존합니다.
- 시뮬레이션, 전체 상태 검증, gzip 압축/해제는 브라우저에서 수행합니다. Workers는 계정/소유권/허용 목록, 크기, gzip 매직 바이트, SHA-256 및 DB 리비전을 검사합니다. 서버는 싱글플레이 상태의 정확성을 보증하지 않고 불투명 저장 파일로 취급합니다.
- 허용 UUID는 최대 10개입니다. 계정당 저장 슬롯 3개, 전체 30슬롯, UTC 하루 기준 저장 시도 30회·조회 300회입니다. 슬롯/횟수/CAS 제한은 PostgreSQL 함수의 행 잠금과 트랜잭션으로 적용합니다.
- 온라인 세이브는 gzip 1 MiB / 브라우저 원본 8 MiB 이하입니다. 더 큰 세계는 로컬 저장과 파일 내보내기를 사용할 수 있습니다. 게임 규모 제한으로 PRD를 변경한 것은 아닙니다.
- 현재·직전 버전 2개를 보관합니다. 새 버전이 커밋된 후 더 오래된 버전을 정리합니다. 네트워크 단절로 커밋 결과를 모를 때는 업로드를 삭제하지 않으며, 일일 정리가 48시간이 지난 미참조 객체만 제거합니다.
- 일일 정리가 1,000개 이상의 객체를 만나면 자동 삭제를 멈추고 운영 확인이 필요합니다. 테스트 계정 수와 사용량을 늘리기 전 정리 작업을 확장해야 합니다.
- Google OAuth 로그인으로 기본 SMTP 제한을 피합니다. Supabase에서 Google 제공자를 활성화해야 합니다.

이 제한은 R2 과금을 완전히 차단하는 결제 한도가 아닙니다. R2 무료량 초과 시 과금될 수 있고, 인증되지 않은 API 트래픽도 Workers 요청 한도를 소비합니다. 무료 Workers CPU 10ms 안에 드는지는 실제 배포 후 측정해야 합니다. 로컬 wall time이나 dry-run으로 이를 보장하지 않습니다.

## 1. 웹부터 배포

Cloudflare Free 계정에 로그인한 PC 터미널에서 저장소 루트 기준:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm cf:deploy
```

`cf:deploy`는 빌드 후 Wrangler로 배포합니다. 유료 플랜 전환 명령은 없습니다. Wrangler가 출력하는 실제 `workers.dev` 주소를 사용하세요. 기본 상태에서는 온라인 저장 API가 503을 반환하고, 로컬 저장/내보내기는 동작합니다. 계정이나 서버 리소스의 임의 ID를 넣지 않았습니다.

GitHub와 연동하는 경우 Cloudflare Workers의 기존 Git 저장소 연결에서 `yooss2006/nation-simulator`, 루트 `/`, 빌드 `pnpm build`, 배포 `pnpm exec wrangler deploy`를 사용합니다. 패키지 매니저는 `packageManager`의 pnpm 버전을 따릅니다. GitHub Actions는 검사만 수행하며 자동 배포하거나 유료 리소스를 생성하지 않습니다.

## 2. Supabase 인증/DB 연결

1. Supabase Free 프로젝트에서 `apps/worker/schema.sql`을 실행합니다. `cloud_saves`, `cloud_save_quota`와 트랜잭션 함수가 생성됩니다. 기존 `saves` 테이블은 유지합니다.
2. Authentication → Providers에서 Google을 활성화합니다. Google OAuth 클라이언트 ID/secret과 Supabase에 표시된 정확한 callback URL을 등록합니다. secret은 채팅이나 저장소에 넣지 않습니다.
3. Authentication → URL Configuration에 배포된 웹 주소를 Site URL/허용 Redirect URL로 등록합니다.
4. `apps/web/.env.local` 또는 Cloudflare 빌드 변수에 아래 공개 값만 설정하고 웹을 다시 빌드합니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VITE_API_URL=/api
```

5. 테스트 계정으로 로그인하고 Supabase 사용자 목록에서 본인의 UUID를 확인합니다.
6. 서버 DB 역할만 `cloud_saves`/`cloud_save_quota`와 두 함수에 접근할 수 있어야 합니다. SQL에는 anon/authenticated 역할 권한을 제거하는 설정이 포함되어 있습니다. Hyperdrive 연결 자격증명은 서버 전용으로 두고 RLS/권한에 맞는 DB 역할을 사용합니다.

## 3. R2와 Hyperdrive 구성

Cloudflare R2에서 `nation-saves` 비공개 Standard 버킷을 생성합니다. 공개 URL을 활성화하지 않습니다. R2 이용 시 Cloudflare가 결제 수단 등록을 요구할 수 있으며 무료량 초과 과금 조건을 확인하세요.

Hyperdrive에서 해당 Supabase PostgreSQL에 연결되는 구성을 생성합니다. **쿼리 캐시를 비활성화**하세요. 저장 직후 이전 revision을 읽으면 충돌 판정이나 복원 결과가 잘못될 수 있습니다. Hyperdrive는 DB 자체가 아니라 기존 DB 연결 기능입니다.

실제로 발급된 ID를 확인한 뒤 `wrangler.jsonc`에 다음 항목을 추가합니다. `<...>`는 설명용이며 그대로 배포하지 않습니다.

```jsonc
"r2_buckets": [{ "binding": "SAVES", "bucket_name": "nation-saves" }],
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<실제 Hyperdrive ID>" }],
"triggers": { "crons": ["0 18 * * *"] }
```

Cron은 매일 UTC 18:00(한국 03:00)에 오래된 미참조 파일을 정리합니다. 현재·직전 세이브는 삭제하지 않습니다.

루트에서 다음 안전한 입력 프롬프트로 설정합니다. 값 자체를 명령 기록에 붙여넣지 않습니다.

```sh
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_ANON_KEY
pnpm exec wrangler secret put ALLOWED_USER_IDS
```

`ALLOWED_USER_IDS`에는 허용할 UUID만 쉼표로 구분해 입력합니다. 최대 10개입니다. `CLOUD_SAVES_ENABLED`를 `"true"`로 변경한 뒤 `pnpm cf:deploy`를 실행합니다. Workers에는 Supabase service role 키가 필요하지 않습니다. 토큰은 `/auth/v1/user`로 검증하고 DB는 Hyperdrive를 통해 접근합니다.

## 4. 운영 활성화 전 검증

- `/api/health` 응답과 웹 화면 확인
- Google 로그인 후 새 슬롯 저장 → 다른 브라우저에서 복원
- 동일 슬롯을 두 브라우저에서 수정 → 한쪽 409 → 서버 버전 복원 또는 로컬 새 슬롯 보존
- 타인 저장 조회 404, 허용 목록 밖 계정 403 확인
- 4번째 슬롯 생성 차단, 하루 저장 횟수 제한 확인
- Workers 실제 CPU 사용량과 R2 저장량/작업량 확인
- 최신·직전 버전 보관 및 고아 파일 정리 확인

무료 한도를 넘으면 유료 플랜으로 자동 전환하는 대신 온라인 저장을 끄고(`CLOUD_SAVES_ENABLED=false`) 로컬 저장을 유지하는 운영 방식을 권장합니다. Supabase Free 비활동 정지 시에도 이미 내려받은 로컬 게임은 플레이할 수 있습니다.

## 로컬 검증

```sh
pnpm build
pnpm cf:check   # 배포 없는 Workers 번들 검사
pnpm cf:dev     # http://localhost:8787 웹 + API
```

Vite 개발 중에는 별도 터미널에서 `pnpm dev`를 실행하면 `/api`를 8787로 프록시합니다. `.dev.vars`는 git에서 제외됩니다. DB/R2가 연결되지 않으면 온라인 저장만 비활성화합니다.

## 공식 문서

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- https://developers.cloudflare.com/hyperdrive/reference/faq/
- https://developers.cloudflare.com/r2/pricing/
- https://supabase.com/docs/guides/auth/social-login/auth-google
