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
