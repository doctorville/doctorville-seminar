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
