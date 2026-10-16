> 이 문서는 기존 Fastify 서버용 참고입니다. 현재 웹의 온라인 저장은 Cloudflare 바이너리 프로토콜을 사용하므로 [CLOUDFLARE.md](CLOUDFLARE.md)를 따르세요.

# 로컬 실행과 운영 환경

## 웹

`pnpm dev`로 실행하고 `pnpm build`로 `dist/web`를 생성합니다. 정적 서버에 배치할 수 있습니다. 사이트 배포는 이 작업에 포함하지 않았습니다.

클라우드 저장 없이도 로컬 플레이가 가능합니다. 온라인 저장을 사용하려면 `apps/web/.env.local`에 `.env.example`의 `VITE_*` 값을 설정하세요. Vite 환경변수는 브라우저에 노출되므로 서비스 키를 절대 넣지 않습니다.

## 저장 서버

1. PostgreSQL 데이터베이스에 `apps/api/schema.sql`을 적용합니다. 전용 서버 DB 역할에만 테이블 접근을 허용하세요. Supabase PostgreSQL을 사용할 때 RLS 우회 권한은 서버 역할에만 둡니다.
2. Supabase 프로젝트에서 이메일 링크 로그인과 웹 URL 리디렉션을 설정합니다.
3. `nation-saves`라는 비공개 Storage 버킷을 생성합니다. 공개 버킷이나 anon 쓰기 권한을 사용하지 않습니다.
4. `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `WEB_ORIGIN`을 서버 환경변수로 설정합니다.
5. `pnpm api`로 서버를 시작합니다. `.env` 파일은 자동 로딩되지 않으므로 프로세스 매니저에서 주입하거나 `node --env-file=.env --import tsx apps/api/src/index.ts`로 실행합니다.
6. 프록시에서 HTTPS, 인증 요청 속도 제한, 최대 본문 21 MB 이하를 설정합니다. 서버 서비스 키는 비밀 저장소에서 관리합니다.

API 계약:

- `GET /health`: 상태, 인증 불필요
- `GET /saves`: 내 저장 슬롯 목록
- `POST /saves`: `{snapshot}` 새 슬롯
- `GET /saves/:id`: 소유자만 복원
- `PUT /saves/:id`: `{snapshot, expectedRevision}` 조건부 갱신
- 401 인증 실패, 404 저장 없음/다른 소유자, 409 충돌과 현재 버전

객체 경로는 업로드마다 새 UUID를 사용하고 PostgreSQL에서 revision을 원자적으로 비교합니다. 동시 요청 중 하나만 갱신됩니다. 충돌 업로드 객체 및 이전 객체는 보존됩니다. 아직 객체 정리 작업이 없으므로 운영 전 보존 기한/정리 정책을 구현해야 합니다. DB 및 Storage의 동시 시점 백업과 실제 복구 검증이 필요합니다. API 단위 테스트는 인메모리 저장 어댑터로 실행하며 외부 서비스 배포 성공을 의미하지 않습니다.

## 버전/보안

엔진·규칙·스키마 0.1.0/0.1.0/1만 지원합니다. 손상된 데이터와 다른 스키마는 거부하며 아직 이전 버전 마이그레이션은 없습니다. 클라이언트 계산 결과는 싱글플레이용이고 치트 방지를 보장하지 않습니다. API는 상태의 스키마와 핵심 불변식을 검사합니다.

## CI

push/PR에서 lockfile 설치, 포맷 검사, 테스트, 빌드, Chromium E2E를 수행합니다. 외부 로그인/DB/Storage 테스트는 별도 스테이징 환경에서 수행해야 합니다.
