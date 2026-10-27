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
