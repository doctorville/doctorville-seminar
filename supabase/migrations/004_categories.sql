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
