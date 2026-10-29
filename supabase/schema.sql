-- =====================================================================
-- 닥터빌 세미나 신청 솔루션 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
-- (다시 실행해도 되도록 작성되어 있습니다)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- 회원 프로필 (auth.users 와 1:1)
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  login_id       text not null unique,
  name           text not null,
  company        text not null,
  company_source text not null default 'list' check (company_source in ('list','custom')),
  dept           text not null default '',
  email          text not null default '',
  role           text not null default 'member' check (role in ('member','admin')),
  created_at     timestamptz not null default now()
);

-- 직접 입력으로 누적되는 회사명 (회원가입 검색에 재사용)
create table if not exists public.companies (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 세미나 신청
create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  slot_key         text not null unique,               -- YYYY-MM-DD_L|D_n  (중복 신청 방지)
  event_date       date not null,
  meal             text not null check (meal in ('L','D')),
  slot             smallint not null check (slot between 1 and 5),
  company          text not null,
  user_id          uuid not null references auth.users(id) on delete restrict,
  applicant        text not null default '',
  status           text not null default 'req' check (status in ('req','rev','adj','ok')),
  acad             text not null default '학술' check (acad in ('학술','비학술')),
  type             text not null check (type in ('줌 라이브세미나','현장 라이브세미나','웹심포지움')),
  mode             text not null check (mode in ('생방송','재송출','녹화','녹화송출')),
  category         text not null default '',
  lead_item        text not null default '',
  item             text not null default '',
  title            text not null,
  topic            text not null default '',
  speakers         jsonb not null default '[]'::jsonb,
  recruit          integer,
  survey_on        boolean not null default false,
  survey           text not null default '' check (survey in ('','인식형','리뷰형','분석형','적용형')),
  pm               text not null default '',
  adjust_note      text not null default '',
  admin_registered boolean not null default false,
  price_list       bigint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists applications_date_idx on public.applications(event_date);
create index if not exists applications_company_idx on public.applications(company);

-- 관리자 전용 협의 기록 (회원에게는 보이지 않음)
create table if not exists public.application_admin (
  application_id      uuid primary key references public.applications(id) on delete cascade,
  time_text           text not null default '',
  cid                 text not null default '',
  survey_dist         text not null default '',
  vendor              text not null default '',
  channel             text not null default '',
  manager             text not null default '',
  pm_internal         text not null default '',
  applicants          integer,
  attendees           integer,
  survey_participants integer,
  privacy             text not null default '',
  questions           text not null default '',
  replay              text not null default '',
  base_price          bigint,
  survey_pay          bigint,
  survey_bill         bigint,
  final_price         bigint,
  updated_at          timestamptz not null default now()
);

-- 슬롯 점유 현황 (상세 없이 "세미나 확정" 표시용, 모든 회원 열람)
create table if not exists public.slot_locks (
  slot_key   text primary key,
  created_at timestamptz not null default now()
);

-- 알림
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('new','changed','status')),
  text       text not null,
  slot_key   text not null default '',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);


-- 단가표 (값은 저장소에 두지 않습니다 — 별도 전달된 price_tiers_seed.sql 로 입력)
create table if not exists public.price_tiers (
  col   text not null check (col in ('L','D','R')),   -- L: 라이브세미나(줌·현장), D: 웹심포지움, R: 재송출
  tier  integer not null,                              -- 모집 인원 구간 상한
  price bigint not null,
  primary key (col, tier)
);

-- ---------------------------------------------------------------------
-- 2. 도우미 함수
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_company() returns text
language sql stable security definer set search_path = public as $$
  select company from profiles where id = auth.uid();
$$;

create or replace function public.label_slot(d date, m text, s int) returns text
language sql immutable as $$
  select to_char(d, 'FMMM') || '월 ' || to_char(d, 'FMDD') || '일 '
      || case when m = 'L' then '점심' else '저녁' end || ' · ' || s || '번 슬롯';
$$;

create or replace function public.status_label(s text) returns text
language sql immutable as $$
  select case s when 'req' then '신청' when 'rev' then '검토중' when 'adj' then '조정' when 'ok' then '확정' else s end;
$$;

create or replace function public.notify_admins(k text, msg text, sk text) returns void
language sql security definer set search_path = public as $$
  insert into notifications(user_id, kind, text, slot_key)
  select id, k, msg, coalesce(sk, '') from profiles where role = 'admin';
$$;

-- ---------------------------------------------------------------------
-- 3. 회원가입 → 프로필 자동 생성 (+ 직접 입력 회사 누적)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  co text  := btrim(coalesce(m->>'company', ''));
begin
  if co = '' then raise exception '회사(소속)를 입력하세요.'; end if;
  insert into profiles(id, login_id, name, company, company_source, dept, email)
  values (new.id,
          lower(coalesce(nullif(m->>'login_id', ''), split_part(new.email, '@', 1))),
          coalesce(m->>'name', ''),
          co,
          case when m->>'company_source' = 'custom' then 'custom' else 'list' end,
          coalesce(m->>'dept', ''),
          coalesce(m->>'contact_email', ''));
  if m->>'company_source' = 'custom' then
    insert into companies(name, added_by) values (co, new.id) on conflict (name) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. 신청 보호 규칙 (회원이 바꿀 수 없는 값 강제)
-- ---------------------------------------------------------------------
create or replace function public.applications_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.slot_key := to_char(new.event_date, 'YYYY-MM-DD') || '_' || new.meal || '_' || new.slot;
    if extract(isodow from new.event_date) > 5 then raise exception '평일만 신청할 수 있습니다.'; end if;
    if not is_admin() then
      if new.slot > 3 then raise exception '관리자 등록 슬롯은 신청할 수 없습니다.'; end if;
      if new.event_date < current_date then raise exception '지난 날짜는 신청할 수 없습니다.'; end if;
      new.user_id := auth.uid();
      new.company := my_company();
      new.status := 'req';
      new.admin_registered := false;
      new.adjust_note := '';
      select name into new.applicant from profiles where id = auth.uid();
    else
      new.user_id := coalesce(new.user_id, auth.uid());
      new.admin_registered := true;
      if coalesce(new.applicant, '') = '' then select name into new.applicant from profiles where id = auth.uid(); end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if not is_admin() then
      if old.status not in ('req','adj') or old.admin_registered then
        raise exception '검토 중이거나 확정된 신청은 수정할 수 없습니다. 운영팀에 문의하세요.';
      end if;
      new.status := 'req';
      new.company := old.company;  new.user_id := old.user_id;  new.applicant := old.applicant;
      new.admin_registered := old.admin_registered;  new.adjust_note := old.adjust_note;
      new.event_date := old.event_date;  new.meal := old.meal;  new.slot := old.slot;  new.slot_key := old.slot_key;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists applications_guard on public.applications;
create trigger applications_guard before insert or update on public.applications
  for each row execute function public.applications_guard();

-- ---------------------------------------------------------------------
-- 5. 슬롯 점유 + 알림 발생 (정의서 기준)
--    관리자: 신규 접수 / 신청자에 의한 변경(수정·취소)
--    신청자: 내 신청의 상태값 변경(삭제 포함)
-- ---------------------------------------------------------------------
create or replace function public.applications_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_admin boolean := is_admin();
  owner_admin boolean;
begin
  if tg_op = 'INSERT' then
    insert into slot_locks(slot_key) values (new.slot_key) on conflict do nothing;
    if not actor_admin then
      perform notify_admins('new',
        new.company || ' · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title, new.slot_key);
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    select role = 'admin' into owner_admin from profiles where id = new.user_id;
    if not actor_admin then
      perform notify_admins('changed',
        new.company || ' · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title || ' (신청 내용 수정)', new.slot_key);
    elsif new.status is distinct from old.status and not coalesce(owner_admin, false) then
      insert into notifications(user_id, kind, text, slot_key)
      values (new.user_id, 'status',
        status_label(old.status) || ' → ' || status_label(new.status) || ' · '
        || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title
        || case when new.adjust_note <> '' then ' — ' || new.adjust_note else '' end,
        new.slot_key);
    end if;
    return new;

  else -- DELETE
    delete from slot_locks where slot_key = old.slot_key;
    select role = 'admin' into owner_admin from profiles where id = old.user_id;
    if not actor_admin then
      perform notify_admins('changed',
        old.company || ' · ' || label_slot(old.event_date, old.meal, old.slot) || ' · ' || old.title || ' (신청 취소)', '');
    elsif not coalesce(owner_admin, false) then
      insert into notifications(user_id, kind, text, slot_key)
      values (old.user_id, 'status',
        status_label(old.status) || ' → 삭제 · ' || label_slot(old.event_date, old.meal, old.slot) || ' · ' || old.title, '');
    end if;
    return old;
  end if;
end $$;

drop trigger if exists applications_after on public.applications;
create trigger applications_after after insert or update or delete on public.applications
  for each row execute function public.applications_after();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists application_admin_touch on public.application_admin;
create trigger application_admin_touch before update on public.application_admin
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. 접근 권한 (RLS) — 소속 회사 일정만 상세 열람, 관리자 전용 데이터 분리
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.companies         enable row level security;
alter table public.applications      enable row level security;
alter table public.application_admin enable row level security;
alter table public.slot_locks        enable row level security;
alter table public.notifications     enable row level security;
alter table public.price_tiers       enable row level security;

drop policy if exists price_read  on public.price_tiers;
drop policy if exists price_admin on public.price_tiers;
create policy price_read  on public.price_tiers for select to authenticated using (true);
create policy price_admin on public.price_tiers for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists profiles_read  on public.profiles;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_read  on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy profiles_admin on public.profiles for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists companies_read  on public.companies;
drop policy if exists companies_admin on public.companies;
create policy companies_read  on public.companies for select to anon, authenticated using (true);
create policy companies_admin on public.companies for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists apps_read   on public.applications;
drop policy if exists apps_insert on public.applications;
drop policy if exists apps_update on public.applications;
drop policy if exists apps_delete on public.applications;
create policy apps_read   on public.applications for select to authenticated
  using (is_admin() or company = my_company());
create policy apps_insert on public.applications for insert to authenticated
  with check (is_admin() or company = my_company());
create policy apps_update on public.applications for update to authenticated
  using (is_admin() or (company = my_company() and status in ('req','adj') and not admin_registered))
  with check (is_admin() or company = my_company());
create policy apps_delete on public.applications for delete to authenticated
  using (is_admin() or (company = my_company() and status in ('req','adj') and not admin_registered));

drop policy if exists adm_all on public.application_admin;
create policy adm_all on public.application_admin for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists locks_read on public.slot_locks;
create policy locks_read on public.slot_locks for select to authenticated using (true);

drop policy if exists noti_read   on public.notifications;
drop policy if exists noti_update on public.notifications;
create policy noti_read   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy noti_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 7. 실시간 반영 (Realtime)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['applications','application_admin','slot_locks','notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. 관리자 지정 (관리자 계정으로 회원가입한 뒤 아이디를 바꿔 실행)
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin' where login_id = 'admin';
-- =====================================================================
-- 002 회원 관리 · 권한 부여 (관리자 사이트 "회원 관리" 메뉴)
-- 이미 schema.sql 을 실행한 프로젝트에서 이 파일만 추가로 실행하세요. (재실행 가능)
-- =====================================================================

-- 1. 계정 상태 · 변경 시각
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table public.profiles add constraint profiles_status_check check (status in ('active','suspended'));
  end if;
end $$;

-- 2. 계정 변경 이력 (관리자만 열람)
create table if not exists public.account_logs (
  id         bigint generated always as identity primary key,
  target_id  uuid references auth.users(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null,            -- role / status / company / profile
  detail     text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists account_logs_target_idx on public.account_logs(target_id, created_at desc);
alter table public.account_logs enable row level security;
drop policy if exists logs_admin_read on public.account_logs;
create policy logs_admin_read on public.account_logs for select to authenticated using (is_admin());

-- 3. 정지 계정은 관리자 권한 · 회사 열람 권한을 잃음
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.my_company() returns text
language sql stable security definer set search_path = public as $$
  select company from profiles where id = auth.uid() and status = 'active';
$$;

-- 4. 프로필 변경 보호 + 이력 기록
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare admins int;
begin
  -- 아이디 · 가입일은 바꿀 수 없음
  new.id := old.id; new.login_id := old.login_id; new.created_at := old.created_at; new.updated_at := now();
  new.name := btrim(new.name); new.company := btrim(new.company);
  if new.name = '' or new.company = '' then raise exception '이름과 회사는 비워 둘 수 없습니다.'; end if;

  if auth.uid() is not null then
    if not is_admin() then raise exception '회원 정보를 변경할 권한이 없습니다.'; end if;
    if new.id = auth.uid() and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception '본인 계정의 권한이나 상태는 바꿀 수 없습니다.';
    end if;
  end if;

  if old.role = 'admin' and old.status = 'active' and (new.role <> 'admin' or new.status <> 'active') then
    select count(*) into admins from profiles where role = 'admin' and status = 'active';
    if admins <= 1 then raise exception '마지막 관리자는 권한을 해제하거나 정지할 수 없습니다.'; end if;
  end if;

  if new.role is distinct from old.role then
    insert into account_logs(target_id, actor_id, action, detail) values (new.id, auth.uid(), 'role',
      case old.role when 'admin' then '관리자' else '회원' end || ' → ' || case new.role when 'admin' then '관리자' else '회원' end);
  end if;
  if new.status is distinct from old.status then
    insert into account_logs(target_id, actor_id, action, detail) values (new.id, auth.uid(), 'status',
      case old.status when 'suspended' then '정지' else '활성' end || ' → ' || case new.status when 'suspended' then '정지' else '활성' end);
  end if;
  if new.company is distinct from old.company then
    insert into account_logs(target_id, actor_id, action, detail) values (new.id, auth.uid(), 'company', old.company || ' → ' || new.company);
  end if;
  if new.name is distinct from old.name or new.dept is distinct from old.dept or new.email is distinct from old.email then
    insert into account_logs(target_id, actor_id, action, detail) values (new.id, auth.uid(), 'profile', '이름 · 부서 · 이메일 수정');
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- 5. 정지 계정은 신청 · 수정 불가 (보호 규칙에 상태 확인 추가)
create or replace function public.block_suspended() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not exists (select 1 from profiles where id = auth.uid() and status = 'active') then
    raise exception '이용이 정지된 계정입니다. 운영팀에 문의하세요.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists applications_block_suspended on public.applications;
create trigger applications_block_suspended before insert or update or delete on public.applications
  for each row execute function public.block_suspended();
-- =====================================================================
-- 003 외주사 계정 · 세미나 배정
--  - 관리자가 외주사 계정을 생성 (vendor_invites → 가입 시 vendor 권한 부여)
--  - 외주사는 신청 불가, 배정된 세미나만 조회 (vendor_seminars 함수, 금액 정보 제외)
-- schema.sql, 002_accounts.sql 실행 후 이 파일을 실행하세요. (재실행 가능)
-- =====================================================================

-- 1. 외주사 · 초대 테이블, 컬럼
create table if not exists public.vendors (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  memo       text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles     add column if not exists vendor_id bigint references public.vendors(id) on delete set null;
alter table public.applications add column if not exists vendor_id bigint references public.vendors(id) on delete set null;
create index if not exists applications_vendor_idx on public.applications(vendor_id);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('member','admin','vendor'));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('new','changed','status','assign'));

-- 관리자가 만든 외주사 계정 초대 (가입 순간 vendor 권한으로 연결, 사용 후 삭제)
create table if not exists public.vendor_invites (
  login_id   text primary key,
  vendor_id  bigint not null references public.vendors(id) on delete cascade,
  name       text not null default '',
  email      text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 2. 도우미 함수
create or replace function public.my_company() returns text
language sql stable security definer set search_path = public as $$
  select company from profiles where id = auth.uid() and status = 'active' and role = 'member';
$$;

create or replace function public.my_vendor() returns bigint
language sql stable security definer set search_path = public as $$
  select vendor_id from profiles where id = auth.uid() and status = 'active' and role = 'vendor';
$$;

-- 3. 가입 처리: 초대가 있으면 외주사 계정으로, 없으면 일반 회원
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  lid text  := lower(coalesce(nullif(m->>'login_id', ''), split_part(new.email, '@', 1)));
  co  text  := btrim(coalesce(m->>'company', ''));
  inv record;
  vname text;
begin
  select * into inv from vendor_invites where login_id = lid
    and created_at > now() - interval '1 day';
  if found then
    select name into vname from vendors where id = inv.vendor_id;
    insert into profiles(id, login_id, name, company, company_source, dept, email, role, vendor_id)
    values (new.id, lid, coalesce(nullif(inv.name, ''), m->>'name', ''), vname, 'list', '외주사',
            coalesce(nullif(inv.email, ''), m->>'contact_email', ''), 'vendor', inv.vendor_id);
    delete from vendor_invites where login_id = lid;
    return new;
  end if;

  if co = '' then raise exception '회사(소속)를 입력하세요.'; end if;
  insert into profiles(id, login_id, name, company, company_source, dept, email)
  values (new.id, lid, coalesce(m->>'name', ''), co,
          case when m->>'company_source' = 'custom' then 'custom' else 'list' end,
          coalesce(m->>'dept', ''), coalesce(m->>'contact_email', ''));
  if m->>'company_source' = 'custom' then
    insert into companies(name, added_by) values (co, new.id) on conflict (name) do nothing;
  end if;
  return new;
end $$;

-- 4. 신청 보호: 회원(member)만 신청 · 수정, 배정 외주사는 관리자만 지정
create or replace function public.applications_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.slot_key := to_char(new.event_date, 'YYYY-MM-DD') || '_' || new.meal || '_' || new.slot;
    if extract(isodow from new.event_date) > 5 then raise exception '평일만 신청할 수 있습니다.'; end if;
    if not is_admin() then
      if my_company() is null then raise exception '세미나를 신청할 수 없는 계정입니다.'; end if;
      if new.slot > 3 then raise exception '관리자 등록 슬롯은 신청할 수 없습니다.'; end if;
      if new.event_date < current_date then raise exception '지난 날짜는 신청할 수 없습니다.'; end if;
      new.user_id := auth.uid();
      new.company := my_company();
      new.status := 'req';
      new.admin_registered := false;
      new.adjust_note := '';
      new.vendor_id := null;
      select name into new.applicant from profiles where id = auth.uid();
    else
      new.user_id := coalesce(new.user_id, auth.uid());
      new.admin_registered := true;
      if coalesce(new.applicant, '') = '' then select name into new.applicant from profiles where id = auth.uid(); end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if not is_admin() then
      if my_company() is null then raise exception '세미나를 수정할 수 없는 계정입니다.'; end if;
      if old.status not in ('req','adj') or old.admin_registered then
        raise exception '검토 중이거나 확정된 신청은 수정할 수 없습니다. 운영팀에 문의하세요.';
      end if;
      new.status := 'req';
      new.company := old.company;  new.user_id := old.user_id;  new.applicant := old.applicant;
      new.admin_registered := old.admin_registered;  new.adjust_note := old.adjust_note;
      new.event_date := old.event_date;  new.meal := old.meal;  new.slot := old.slot;  new.slot_key := old.slot_key;
      new.vendor_id := old.vendor_id;
    end if;
  end if;
  return new;
end $$;

-- 5. 알림: 기존 규칙 + 외주사 배정 알림
create or replace function public.applications_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_admin boolean := is_admin();
  owner_admin boolean;
begin
  if tg_op = 'INSERT' then
    insert into slot_locks(slot_key) values (new.slot_key) on conflict do nothing;
    if not actor_admin then
      perform notify_admins('new',
        new.company || ' · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title, new.slot_key);
    end if;
    if new.vendor_id is not null then
      insert into notifications(user_id, kind, text, slot_key)
      select id, 'assign', '세미나 배정 · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title, new.slot_key
      from profiles where role = 'vendor' and status = 'active' and vendor_id = new.vendor_id;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    select role = 'admin' into owner_admin from profiles where id = new.user_id;
    if not actor_admin then
      perform notify_admins('changed',
        new.company || ' · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title || ' (신청 내용 수정)', new.slot_key);
    elsif new.status is distinct from old.status and not coalesce(owner_admin, false) then
      insert into notifications(user_id, kind, text, slot_key)
      values (new.user_id, 'status',
        status_label(old.status) || ' → ' || status_label(new.status) || ' · '
        || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title
        || case when new.adjust_note <> '' then ' — ' || new.adjust_note else '' end,
        new.slot_key);
    end if;
    if new.vendor_id is distinct from old.vendor_id and new.vendor_id is not null then
      insert into notifications(user_id, kind, text, slot_key)
      select id, 'assign', '세미나 배정 · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title, new.slot_key
      from profiles where role = 'vendor' and status = 'active' and vendor_id = new.vendor_id;
    end if;
    return new;

  else -- DELETE
    delete from slot_locks where slot_key = old.slot_key;
    select role = 'admin' into owner_admin from profiles where id = old.user_id;
    if not actor_admin then
      perform notify_admins('changed',
        old.company || ' · ' || label_slot(old.event_date, old.meal, old.slot) || ' · ' || old.title || ' (신청 취소)', '');
    elsif not coalesce(owner_admin, false) then
      insert into notifications(user_id, kind, text, slot_key)
      values (old.user_id, 'status',
        status_label(old.status) || ' → 삭제 · ' || label_slot(old.event_date, old.meal, old.slot) || ' · ' || old.title, '');
    end if;
    return old;
  end if;
end $$;

-- 6. 외주사 전용 조회: 배정된 세미나만, 금액 · 정산 정보 제외
create or replace function public.vendor_seminars()
returns table (
  slot_key text, event_date date, meal text, slot smallint, status text, acad text, type text, mode text,
  category text, lead_item text, item text, title text, topic text, speakers jsonb, recruit integer,
  survey_on boolean, survey text, pm text, company text, adjust_note text,
  time_text text, cid text, channel text, manager text, pm_internal text, survey_dist text, replay text,
  updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.slot_key, a.event_date, a.meal, a.slot, a.status, a.acad, a.type, a.mode,
         a.category, a.lead_item, a.item, a.title, a.topic, a.speakers, a.recruit,
         a.survey_on, a.survey, a.pm, a.company, a.adjust_note,
         coalesce(d.time_text,''), coalesce(d.cid,''), coalesce(d.channel,''), coalesce(d.manager,''),
         coalesce(d.pm_internal,''), coalesce(d.survey_dist,''), coalesce(d.replay,''), a.updated_at
  from applications a left join application_admin d on d.application_id = a.id
  where my_vendor() is not null and a.vendor_id = my_vendor()
  order by a.event_date, a.meal desc, a.slot;
$$;
revoke all on function public.vendor_seminars() from public, anon;
grant execute on function public.vendor_seminars() to authenticated;

-- 7. 프로필 보호 규칙: 외주사 권한 반영
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare admins int; vname text;
begin
  new.id := old.id; new.login_id := old.login_id; new.created_at := old.created_at; new.updated_at := now();
  new.name := btrim(new.name); new.company := btrim(new.company);
  if new.role = 'vendor' then
    if new.vendor_id is null then raise exception '외주사 계정은 소속 외주사를 지정해야 합니다.'; end if;
    select name into vname from vendors where id = new.vendor_id;
    new.company := vname;
  else
    new.vendor_id := null;
  end if;
  if new.name = '' or new.company = '' then raise exception '이름과 회사는 비워 둘 수 없습니다.'; end if;

  if auth.uid() is not null then
    if not is_admin() then raise exception '회원 정보를 변경할 권한이 없습니다.'; end if;
    if new.id = auth.uid() and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception '본인 계정의 권한이나 상태는 바꿀 수 없습니다.';
    end if;
  end if;

  if old.role = 'admin' and old.status = 'active' and (new.role <> 'admin' or new.status <> 'active') then
    select count(*) into admins from profiles where role = 'admin' and status = 'active';
    if admins <= 1 then raise exception '마지막 관리자는 권한을 해제하거나 정지할 수 없습니다.'; end if;
  end if;

  if new.role is distinct from old.role then
    insert into account_logs(target_id, actor_id, action, detail) values (new.id, auth.uid(), 'role',
      case old.role when 'admin' then '관리자' when 'vendor' then '외주사' else '회원' end || ' → ' ||
      case new.role when 'admin' then '관리자' when 'vendor' then '외주사' else '회원' end);
  end if;
  if new.status is distinct from old.status then
    insert into account_logs(target_id, actor_id, action, detail) values (new.id, auth.uid(), 'status',
      case old.status when 'suspended' then '정지' else '활성' end || ' → ' || case new.status when 'suspended' then '정지' else '활성' end);
  end if;
  if new.company is distinct from old.company then
    insert into account_logs(target_id, actor_id, action, detail) values (new.id, auth.uid(), 'company', old.company || ' → ' || new.company);
  end if;
  if new.name is distinct from old.name or new.dept is distinct from old.dept or new.email is distinct from old.email then
    insert into account_logs(target_id, actor_id, action, detail) values (new.id, auth.uid(), 'profile', '이름 · 부서 · 이메일 수정');
  end if;
  return new;
end $$;

-- 8. 접근 권한
alter table public.vendors        enable row level security;
alter table public.vendor_invites enable row level security;

drop policy if exists vendors_read  on public.vendors;
drop policy if exists vendors_admin on public.vendors;
create policy vendors_read  on public.vendors for select to authenticated using (is_admin() or id = my_vendor());
create policy vendors_admin on public.vendors for all    to authenticated using (is_admin()) with check (is_admin());

drop policy if exists invites_admin on public.vendor_invites;
create policy invites_admin on public.vendor_invites for all to authenticated using (is_admin()) with check (is_admin());
-- =====================================================================
-- 004 카테고리(질환별 · 진료과) 직접 입력 누적
--  - 기본 목록은 화면(app.js)에 있고, 직접 입력한 항목만 이 테이블에 쌓여 다음 검색에 재사용
--  - 품목 여러 개, 심포지움 좌장 · 연자별 주제는 기존 컬럼(item, speakers jsonb)에 저장되어 DB 변경 없음
-- 003_vendors.sql 실행 후 이 파일을 실행하세요. (재실행 가능)
-- =====================================================================
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text not null unique check (char_length(btrim(name)) between 2 and 40),
  kind       text not null check (kind in ('질환','진료과')),
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
grant select, insert, update, delete on public.categories to authenticated;
drop policy if exists categories_read   on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_admin  on public.categories;
-- 로그인한 사용자 조회
create policy categories_read on public.categories for select to authenticated using (true);
-- 정상 회원 · 관리자만 본인 명의로 추가 (외주사 · 정지 계정 불가)
create policy categories_insert on public.categories for insert to authenticated
  with check (added_by = auth.uid() and (is_admin() or my_company() is not null));
-- 관리자는 수정 · 삭제 가능
create policy categories_admin on public.categories for all to authenticated using (is_admin()) with check (is_admin());
-- =====================================================================
-- 005 진행 시간 · 웨비나 진행 상태 · 설문 진행 상태
--  - applications: start_time / end_time (발주자 · 관리자 입력), progress (발주자 · 관리자 변경),
--    survey_status (관리자 변경, 발주자 조회)
--  - CID · 행사 담당자 · 운영 결과 · 정산은 기존 application_admin 컬럼 사용 (관리자 전용)
-- 004_categories.sql 실행 후 이 파일을 실행하세요. (재실행 가능)
-- =====================================================================
alter table public.applications add column if not exists start_time    text not null default '';
alter table public.applications add column if not exists end_time      text not null default '';
alter table public.applications add column if not exists progress      text not null default '진행예정';
alter table public.applications add column if not exists survey_status text not null default '';

alter table public.applications drop constraint if exists applications_time_check;
alter table public.applications add constraint applications_time_check
  check ((start_time = '' or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and (end_time = '' or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));
alter table public.applications drop constraint if exists applications_progress_check;
alter table public.applications add constraint applications_progress_check
  check (progress in ('진행예정','진행완료','연기','취소'));
alter table public.applications drop constraint if exists applications_survey_status_check;
alter table public.applications add constraint applications_survey_status_check
  check (survey_status in ('','준비중','진행중','마감','결과전달'));

-- 1. 신청 보호 규칙: 진행 상태만 바꾸는 변경 허용, 설문 진행 상태는 관리자만
create or replace function public.applications_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.start_time <> '' and new.end_time <> '' and new.end_time <= new.start_time then
    raise exception '종료 시간은 시작 시간보다 늦어야 합니다.';
  end if;
  if tg_op = 'INSERT' then
    new.slot_key := to_char(new.event_date, 'YYYY-MM-DD') || '_' || new.meal || '_' || new.slot;
    if extract(isodow from new.event_date) > 5 then raise exception '평일만 신청할 수 있습니다.'; end if;
    if not is_admin() then
      if my_company() is null then raise exception '세미나를 신청할 수 없는 계정입니다.'; end if;
      if new.slot > 3 then raise exception '관리자 등록 슬롯은 신청할 수 없습니다.'; end if;
      if new.event_date < current_date then raise exception '지난 날짜는 신청할 수 없습니다.'; end if;
      new.user_id := auth.uid();
      new.company := my_company();
      new.status := 'req';
      new.admin_registered := false;
      new.adjust_note := '';
      new.vendor_id := null;
      new.progress := '진행예정';  new.survey_status := '';
      select name into new.applicant from profiles where id = auth.uid();
    else
      new.user_id := coalesce(new.user_id, auth.uid());
      new.admin_registered := true;
      if coalesce(new.applicant, '') = '' then select name into new.applicant from profiles where id = auth.uid(); end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if not is_admin() then
      if my_company() is null or old.company is distinct from my_company() then raise exception '세미나를 수정할 수 없는 계정입니다.'; end if;
      -- 진행 상태(웨비나)만 바꾸는 경우: 신청 상태와 무관하게 허용, 다른 값은 그대로 유지
      if (to_jsonb(new) - 'progress' - 'updated_at') = (to_jsonb(old) - 'progress' - 'updated_at') then
        return new;
      end if;
      if old.status not in ('req','adj') or old.admin_registered then
        raise exception '검토 중이거나 확정된 신청은 수정할 수 없습니다. 운영팀에 문의하세요.';
      end if;
      new.status := 'req';
      new.company := old.company;  new.user_id := old.user_id;  new.applicant := old.applicant;
      new.admin_registered := old.admin_registered;  new.adjust_note := old.adjust_note;
      new.event_date := old.event_date;  new.meal := old.meal;  new.slot := old.slot;  new.slot_key := old.slot_key;
      new.vendor_id := old.vendor_id;
      new.survey_status := old.survey_status;  new.progress := old.progress;
    end if;
  end if;
  return new;
end $$;

-- 2. 알림: 진행 상태 · 설문 상태 변경 알림 추가
create or replace function public.applications_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_admin boolean := is_admin();
  owner_admin boolean;
begin
  if tg_op = 'INSERT' then
    insert into slot_locks(slot_key) values (new.slot_key) on conflict do nothing;
    if not actor_admin then
      perform notify_admins('new',
        new.company || ' · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title, new.slot_key);
    end if;
    if new.vendor_id is not null then
      insert into notifications(user_id, kind, text, slot_key)
      select id, 'assign', '세미나 배정 · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title, new.slot_key
      from profiles where role = 'vendor' and status = 'active' and vendor_id = new.vendor_id;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    select role = 'admin' into owner_admin from profiles where id = new.user_id;
    if not actor_admin then
      if (to_jsonb(new) - 'progress' - 'updated_at') = (to_jsonb(old) - 'progress' - 'updated_at') then
        perform notify_admins('changed',
          new.company || ' · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title
          || ' (웨비나 진행: ' || old.progress || ' → ' || new.progress || ')', new.slot_key);
      else
        perform notify_admins('changed',
          new.company || ' · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title || ' (신청 내용 수정)', new.slot_key);
      end if;
    elsif not coalesce(owner_admin, false)
          and (new.progress is distinct from old.progress or new.survey_status is distinct from old.survey_status)
          and new.status is not distinct from old.status then
      insert into notifications(user_id, kind, text, slot_key)
      values (new.user_id, 'status',
        concat_ws(' · ',
          case when new.progress is distinct from old.progress then '웨비나 ' || old.progress || ' → ' || new.progress end,
          case when new.survey_status is distinct from old.survey_status then '설문 ' || coalesce(nullif(new.survey_status,''),'미정') end,
          label_slot(new.event_date, new.meal, new.slot), new.title),
        new.slot_key);
    elsif new.status is distinct from old.status and not coalesce(owner_admin, false) then
      insert into notifications(user_id, kind, text, slot_key)
      values (new.user_id, 'status',
        status_label(old.status) || ' → ' || status_label(new.status) || ' · '
        || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title
        || case when new.adjust_note <> '' then ' — ' || new.adjust_note else '' end,
        new.slot_key);
    end if;
    if new.vendor_id is distinct from old.vendor_id and new.vendor_id is not null then
      insert into notifications(user_id, kind, text, slot_key)
      select id, 'assign', '세미나 배정 · ' || label_slot(new.event_date, new.meal, new.slot) || ' · ' || new.title, new.slot_key
      from profiles where role = 'vendor' and status = 'active' and vendor_id = new.vendor_id;
    end if;
    return new;

  else -- DELETE
    delete from slot_locks where slot_key = old.slot_key;
    select role = 'admin' into owner_admin from profiles where id = old.user_id;
    if not actor_admin then
      perform notify_admins('changed',
        old.company || ' · ' || label_slot(old.event_date, old.meal, old.slot) || ' · ' || old.title || ' (신청 취소)', '');
    elsif not coalesce(owner_admin, false) then
      insert into notifications(user_id, kind, text, slot_key)
      values (old.user_id, 'status',
        status_label(old.status) || ' → 삭제 · ' || label_slot(old.event_date, old.meal, old.slot) || ' · ' || old.title, '');
    end if;
    return old;
  end if;
end $$;

-- 3. 진행 상태 변경 (발주자: 신청 상태와 무관하게 자기 회사 일정만)
create or replace function public.set_progress(p_slot_key text, p_progress text) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_progress not in ('진행예정','진행완료','연기','취소') then raise exception '알 수 없는 진행 상태입니다.'; end if;
  if not is_admin() and my_company() is null then raise exception '진행 상태를 바꿀 수 없는 계정입니다.'; end if;
  update applications set progress = p_progress
   where slot_key = p_slot_key and (is_admin() or company = my_company());
  get diagnostics n = row_count;
  if n = 0 then raise exception '변경할 수 있는 일정이 아닙니다.'; end if;
end $$;
revoke all on function public.set_progress(text, text) from public, anon;
grant execute on function public.set_progress(text, text) to authenticated;

-- 4. 외주사 조회: 진행 시간 · 진행 상태 · 설문 상태 추가 (반환 형식이 바뀌어 다시 생성)
drop function if exists public.vendor_seminars();
create function public.vendor_seminars()
returns table (
  slot_key text, event_date date, meal text, slot smallint, status text, acad text, type text, mode text,
  category text, lead_item text, item text, title text, topic text, speakers jsonb, recruit integer,
  survey_on boolean, survey text, pm text, company text, adjust_note text,
  start_time text, end_time text, progress text, survey_status text,
  time_text text, cid text, channel text, manager text, pm_internal text, survey_dist text, replay text,
  updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.slot_key, a.event_date, a.meal, a.slot, a.status, a.acad, a.type, a.mode,
         a.category, a.lead_item, a.item, a.title, a.topic, a.speakers, a.recruit,
         a.survey_on, a.survey, a.pm, a.company, a.adjust_note,
         a.start_time, a.end_time, a.progress, a.survey_status,
         coalesce(d.time_text,''), coalesce(d.cid,''), coalesce(d.channel,''), coalesce(d.manager,''),
         coalesce(d.pm_internal,''), coalesce(d.survey_dist,''), coalesce(d.replay,''), a.updated_at
  from applications a left join application_admin d on d.application_id = a.id
  where my_vendor() is not null and a.vendor_id = my_vendor()
  order by a.event_date, a.meal desc, a.slot;
$$;
revoke all on function public.vendor_seminars() from public, anon;
grant execute on function public.vendor_seminars() to authenticated;
