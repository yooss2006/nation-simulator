# 공개 가입 로그인 — 2026-10-16

## 구현 및 현재 연결 상태

Supabase Auth + Google OAuth(PKCE) 로그인 화면을 구현했습니다. 계정 허용 목록은 없습니다. 익명 사용자는 거부하고, SDK의 로컬 세션만 믿지 않고 Auth 서버의 getUser로 검증한 뒤 게임을 마운트합니다. 로그아웃은 게임 Worker를 종료하고 메모리 상태를 비웁니다. 자동 저장 키에는 사용자 ID가 포함됩니다. 이전 비로그인 자동 저장은 삭제하지 않지만 새 계정에 자동 귀속하지 않습니다.

Supabase 조직 `dxncvfjxumaxohxnfcjx`의 실제 plan=free, tier=tier_free를 API로 확인했습니다. 프로젝트 `dhpxzwgkbkkvjiisnkbc`는 정상입니다. 공개 회원가입은 허용되지만 Google 제공자는 아직 비활성입니다. 현재 로그인 버튼을 누르면 연결 준비 중임을 표시합니다. 실제 Google 로그인 성공은 아직 검증하지 않았습니다.

## 남은 연결 설정

Google Auth Platform에서 이 게임용 웹 OAuth 클라이언트를 준비합니다. 결제 계정 연결이나 유료 API 활성화는 필요 작업에 포함하지 않습니다.

- 대상: External. 공개 이용을 위해 테스트 사용자 전용 상태가 아닌 Production으로 설정
- scope: openid, email, profile만 사용
- JavaScript origin: `https://nation-simulator.dream-montage-web.workers.dev`
- Google 승인된 리디렉션 URI: `https://dhpxzwgkbkkvjiisnkbc.supabase.co/auth/v1/callback`
- Client ID/Secret: Supabase Authentication → Sign In / Providers → Google에 직접 입력하고 활성화. Secret은 저장소/채팅/브라우저 번들에 넣지 않음
- Supabase Site URL 및 Redirect URL: `https://nation-simulator.dream-montage-web.workers.dev`
- 실제 계정으로 로그인→새 게임→자동 저장→로그아웃→재로그인→복원 확인

현재 Supabase 연결 도구에는 인증 설정 수정 기능이 없습니다. 연결 작업은 대시보드 또는 별도로 승인된 관리 API 접근이 필요합니다. 기본 이메일 SMTP는 조직 팀원 외 주소로 발송할 수 없으므로 공개 가입 수단으로 사용하지 않습니다. 익명 로그인/이메일 자동 인증을 켜서 대체하지 않습니다.

## 보호 범위와 비용

이 배포는 공개 정적 웹입니다. 로그인 게이트는 정상 웹 이용 흐름을 제한하지만 공개 JavaScript나 로컬 저장을 비밀로 만들지는 않습니다. 사용자가 배포 코드를 수정하거나 내려받은 시뮬레이션을 직접 실행하는 것을 서버에서 막는 구성은 아닙니다. 로컬 자동 저장의 계정별 키 역시 공유 기기의 운영체제 사용자에 대한 암호화 보호가 아닙니다.

온라인 저장/API는 여전히 비활성입니다. DB 테이블과 함수 권한을 새로 공개하지 않았고, 서비스 비밀키를 클라이언트에 넣지 않았습니다. Cloudflare Access는 앱에 연결하지 않습니다. 기존 준비용 Access 조직/이메일 제공자는 미사용 상태입니다.

Free 요금제를 유지하며 유료 전환·카드 등록·유료 Worker·스토리지를 추가하지 않았습니다. Supabase 무료 한도와 서비스 정책에 따른 사용 제한/중단은 발생할 수 있습니다. 무제한 인증 또는 DDoS 무중단을 보장하지 않습니다. 계정의 다른 서비스 청구는 별개입니다.

## 검증

22개 기존 테스트, 타입 검사, 프로덕션 빌드, 포맷 검사, 4개 Playwright 테스트 통과. 로그인 관련 E2E는 Auth 응답을 모킹해 비로그인 차단, 서버가 거부한 토큰 차단, 로그아웃, 인증 후 게임/저장 동작을 검증했습니다. 실제 Google 연동 E2E 성공과 구분합니다. 로컬 pnpm 실행기의 모듈 재설치 오류 때문에 동일 package.json 스크립트를 npm run으로 실행했습니다.

공식 문서: https://supabase.com/docs/guides/auth/social-login/auth-google · https://supabase.com/docs/guides/auth/auth-smtp
