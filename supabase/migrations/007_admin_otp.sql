-- =====================================================================
-- 007 관리자 메일 OTP 로그인
--  - 관리자는 메일 주소 + 8자리 인증번호(OTP)로 로그인 (회원 · 외주사는 기존 아이디/비밀번호 유지)
--  - admin_invites 에 등록된 메일만 첫 OTP 로그인 때 관리자 계정이 만들어짐
--  - 비밀번호로 가입한 계정은 초대 메일과 같아도 관리자가 되지 않음 (비밀번호 없는 OTP 계정만)
--  - Supabase 설정: Authentication → Providers → Email → Email OTP Length = 8,
--    Email Templates(Magic Link · Confirm signup)에 {{ .Token }} 포함, 운영 메일 발송은 Custom SMTP 필요
-- 006_ops_detail.sql 실행 후 이 파일을 실행하세요. (재실행 가능)
-- =====================================================================
create table if not exists public.admin_invites (
  email      text primary key check (email = lower(btrim(email)) and email like '%_@_%._%'),
  name       text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_invites enable row level security;
grant select, insert, update, delete on public.admin_invites to authenticated;
drop policy if exists admin_invites_admin on public.admin_invites;
create policy admin_invites_admin on public.admin_invites for all to authenticated using (is_admin()) with check (is_admin());

-- 초기 관리자
insert into public.admin_invites(email, name) values ('ojungin@mcircle.biz', '오정인') on conflict (email) do nothing;

-- 가입 처리: 관리자 OTP 계정 분기 추가 (외주사 · 회원은 기존과 동일)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  lid text  := lower(coalesce(nullif(m->>'login_id', ''), split_part(new.email, '@', 1)));
  co  text  := btrim(coalesce(m->>'company', ''));
  inv record;
  vname text;
  ainv record;
begin
  -- 메일 OTP로 처음 로그인한 계정(비밀번호 없음): 관리자 초대 메일만 허용
  if coalesce(new.encrypted_password, '') = '' then
    select * into ainv from admin_invites where email = lower(new.email);
    if not found then raise exception '등록된 관리자 메일이 아닙니다.'; end if;
    insert into profiles(id, login_id, name, company, company_source, dept, email, role)
    values (new.id, lower(new.email), coalesce(nullif(ainv.name, ''), split_part(new.email, '@', 1)),
            '닥터빌', 'list', '관리자', lower(new.email), 'admin');
    delete from admin_invites where email = lower(new.email);
    return new;
  end if;

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
