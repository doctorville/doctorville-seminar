-- =====================================================================
-- 008 관리자 메일 OTP 수정
--  - 원인: Supabase(GoTrue)가 OTP 가입 계정에도 임의 비밀번호를 넣어 007의 '비밀번호 없음' 판별이 실패
--    → 회원 가입 분기로 넘어가 '회사(소속)를 입력하세요.' 오류
--  - 변경: 관리자 OTP 요청은 admin_otp 표시로 구분, 관리자 권한은 OTP 인증 세션에서만 부여(claim_admin)
--  - is_admin(): 메일 로그인 관리자 계정은 OTP로 로그인한 세션에서만 관리자 권한 (비밀번호 세션 차단)
-- 007_admin_otp.sql 실행 후 이 파일을 실행하세요. (재실행 가능)
-- =====================================================================
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
  -- 관리자 메일 OTP 요청(admin_otp): 초대된 메일만 계정 생성, 프로필은 OTP 인증 후 claim_admin()에서 생성
  if coalesce(m->>'admin_otp', '') = 'true' then
    if not exists (select 1 from admin_invites where email = lower(new.email)) then
      raise exception '등록된 관리자 메일이 아닙니다.';
    end if;
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

create or replace function public.jwt_has_otp() returns boolean
language sql stable as $$
  select exists (select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a where a->>'method' = 'otp');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active'
                and (login_id not like '%@%' or jwt_has_otp()));
$$;

-- 메일 OTP로 로그인한 직후 호출: 초대된 메일이면 관리자 프로필 생성
create or replace function public.claim_admin() returns text
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt()->>'email', '')); inv record;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then return 'exists'; end if;
  if not jwt_has_otp() then raise exception '메일 인증으로 로그인해야 합니다.'; end if;
  select * into inv from admin_invites where email = em;
  if not found then raise exception '등록된 관리자 메일이 아닙니다.'; end if;
  insert into profiles(id, login_id, name, company, company_source, dept, email, role)
  values (auth.uid(), em, coalesce(nullif(inv.name, ''), split_part(em, '@', 1)), '닥터빌', 'list', '관리자', em, 'admin');
  delete from admin_invites where email = em;
  return 'created';
end $$;
revoke all on function public.claim_admin() from public, anon;
grant execute on function public.claim_admin() to authenticated;
