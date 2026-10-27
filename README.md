# 닥터빌 세미나 신청 솔루션

라이브세미나 · 웹심포지움 일정 신청(회원용)과 관리(관리자용) 사이트입니다.
GitHub Pages로 화면을 배포하고, Supabase에 데이터를 저장합니다.

| 구분 | 주소 (GitHub Pages 배포 후) |
|---|---|
| 신청 사이트 | `https://<계정>.github.io/<저장소>/` |
| 관리자 사이트 | `https://<계정>.github.io/<저장소>/admin/` |

## 폴더 구성

```
index.html            신청 사이트 (회원가입 · 일정 신청 · 내 신청 현황 · 알림)
admin/index.html      관리자 사이트 (일정 관리 · 전체 신청 현황 · Excel/PDF · 알림)
assets/app.js         두 사이트 공용 화면 로직
assets/app.css        공용 스타일
assets/config.js      Supabase 연결 설정 (주소 · 공개 키)
supabase/schema.sql   DB 테이블 · 접근 권한(RLS) · 알림 발생 규칙
```

## 설치 순서

### 1. Supabase 프로젝트 만들기
1. https://supabase.com 에 가입하고 **New project** 를 만듭니다. (Region: Northeast Asia (Seoul) 권장)
2. **SQL Editor** → New query → `supabase/schema.sql` 전체를 붙여넣고 **Run**.
3. 별도로 전달받은 `price_tiers_seed.sql`(단가표, 대외비)을 같은 방법으로 실행합니다. 이 파일은 저장소에 올리지 마세요.
4. **Authentication → Sign In / Providers → Email** 에서
   - **Confirm email** 을 끕니다. (아이디 로그인 방식이라 메일 확인을 쓰지 않습니다)
   - 비밀번호 최소 길이는 8자로 둡니다.
5. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사합니다.
   - `service_role` 키는 어디에도 넣지 마세요.

### 2. 연결 설정
`assets/config.js` 의 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 를 복사한 값으로 바꿉니다.
anon 키는 공개되어도 되는 키이며, 데이터 보호는 RLS 규칙이 담당합니다.

### 3. GitHub 저장소 · Pages 배포
1. GitHub에서 새 저장소를 만들고 이 폴더 전체를 올립니다.
   ```bash
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
2. 저장소 **Settings → Pages**: Source `Deploy from a branch`, Branch `main` / `/ (root)` → Save. 이후 `main` 에 올릴 때마다 자동으로 다시 배포됩니다.
3. 1~2분 뒤 표시되는 주소로 접속합니다.
4. 저장소에는 비밀 정보가 없습니다. 단가표는 코드가 아니라 Supabase `price_tiers` 테이블에 있고, 로그인한 사용자만 조회할 수 있습니다.

### 4. 관리자 계정 만들기
1. 신청 사이트에서 관리자로 쓸 아이디(예: `admin`)로 회원가입합니다.
2. Supabase SQL Editor에서 실행합니다.
   ```sql
   update public.profiles set role = 'admin' where login_id = 'admin';
   ```
3. 이후 이 계정은 `/admin/` 관리자 사이트에서만 로그인됩니다. (신청 사이트 로그인은 차단)
4. 관리자 가입 시 직접 입력한 회사명(예: 닥터빌)이 회사 검색 목록에 들어갔다면 Table Editor → `companies` 에서 지우면 됩니다.

## 동작 규칙

- **슬롯**: 평일만, 점심·저녁 각 5개. 1~3번은 회원 신청, 4~5번은 관리자 등록 전용.
- **열람 범위**: 회원은 자기 회사 신청만 상세 조회(서버 RLS로 차단). 다른 회사 일정은 `slot_locks` 로 "세미나 확정"만 표시.
- **중복 신청 방지**: `slot_key` 고유 제약으로 같은 슬롯 동시 신청 시 한 건만 접수.
- **수정 제한**: 회원은 `신청`·`조정` 상태에서만 수정·취소 가능, 수정하면 상태가 `신청`으로 돌아감.
- **관리자 전용 기록**: CID·업체·참석자 수·정산 금액 등은 `application_admin` 테이블에 저장되어 회원에게 보이지 않음.

## 알림

DB 트리거가 정의서대로 알림을 만듭니다.

| 받는 사람 | 발생 조건 |
|---|---|
| 관리자 전원 | 신규 접수 / 신청자의 수정·취소 |
| 신청자 | 관리자가 상태값을 변경(삭제 포함) |

화면에서는 실시간으로 팝업 · 알림음 · 배지가 표시되고, 알림 탭에서 **윈도우 알림 켜기**를 누르면
브라우저 알림 권한을 받아 윈도우 알림 센터에도 표시합니다(사이트가 열려 있는 동안, 다른 탭이어도 동작).

### 다음 단계 (선택)
- **사이트를 닫아도 받는 윈도우 알림**: Service Worker + Web Push(VAPID) 구독을 저장하고, `notifications` INSERT 시 Supabase Edge Function(Database Webhook)으로 푸시 발송.
- **텔레그램**: BotFather로 봇 생성 → 마이페이지 "텔레그램 연결" 딥링크(`t.me/<봇>?start=<1회용토큰>`) → 봇 웹훅(Edge Function)에서 chat_id를 프로필에 저장 → `notifications` INSERT 시 Edge Function이 `sendMessage` 호출. 봇 토큰은 Supabase Secrets에만 보관.
- 외부 메신저로 행사 정보가 나가므로 개인정보 동의 항목 추가와 사내 승인이 필요합니다.

## 알아둘 점

- 회사 검색 목록(`PHARMA`)은 주요 제약사 **샘플**입니다. 공식 등록 목록으로 교체하세요.
- 녹화·녹화송출 단가는 미확정이라 생방송 단가로 임시 계산합니다.
- 단가 변경은 Supabase Table Editor → `price_tiers` 에서 바로 수정하면 됩니다(배포 불필요).
- 공휴일은 반영되어 있지 않습니다.
- `config.js` 의 `LOGIN_EMAIL_DOMAIN` 은 아이디를 내부 이메일로 바꾸는 데 쓰입니다. 운영 시작 후에는 바꾸지 마세요.
- Supabase 무료 플랜은 1주일 이상 사용이 없으면 프로젝트가 일시 중지됩니다. 운영 시 Pro 플랜을 검토하세요.
