-- =====================================================================
-- 006 운영 상세 · 진행업체 정보
--  - application_admin: place(장소), survey_paid(심화설문 지급 여부 Y/N)
--  - vendors(진행업체): contact_name, contact_phone (담당자 · 연락처)
--  - vendor_seminars: 장소 추가 (반환 형식이 바뀌어 다시 생성)
-- 005_progress.sql 실행 후 이 파일을 실행하세요. (재실행 가능)
-- =====================================================================
alter table public.application_admin add column if not exists place       text not null default '';
alter table public.application_admin add column if not exists survey_paid text not null default '';
alter table public.application_admin drop constraint if exists application_admin_survey_paid_check;
alter table public.application_admin add constraint application_admin_survey_paid_check check (survey_paid in ('','Y','N'));

alter table public.vendors add column if not exists contact_name  text not null default '';
alter table public.vendors add column if not exists contact_phone text not null default '';

drop function if exists public.vendor_seminars();
create function public.vendor_seminars()
returns table (
  slot_key text, event_date date, meal text, slot smallint, status text, acad text, type text, mode text,
  category text, lead_item text, item text, title text, topic text, speakers jsonb, recruit integer,
  survey_on boolean, survey text, pm text, company text, adjust_note text,
  start_time text, end_time text, progress text, survey_status text,
  time_text text, cid text, channel text, place text, manager text, pm_internal text, survey_dist text, replay text,
  updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.slot_key, a.event_date, a.meal, a.slot, a.status, a.acad, a.type, a.mode,
         a.category, a.lead_item, a.item, a.title, a.topic, a.speakers, a.recruit,
         a.survey_on, a.survey, a.pm, a.company, a.adjust_note,
         a.start_time, a.end_time, a.progress, a.survey_status,
         coalesce(d.time_text,''), coalesce(d.cid,''), coalesce(d.channel,''), coalesce(d.place,''), coalesce(d.manager,''),
         coalesce(d.pm_internal,''), coalesce(d.survey_dist,''), coalesce(d.replay,''), a.updated_at
  from applications a left join application_admin d on d.application_id = a.id
  where my_vendor() is not null and a.vendor_id = my_vendor()
  order by a.event_date, a.meal desc, a.slot;
$$;
revoke all on function public.vendor_seminars() from public, anon;
grant execute on function public.vendor_seminars() to authenticated;
