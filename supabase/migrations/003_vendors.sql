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
