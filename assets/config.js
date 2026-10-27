/* Supabase 연결 설정 — Supabase 대시보드 > Project Settings > API 에서 복사해 넣으세요.
 * anon(public) 키는 공개되어도 되는 키입니다. 데이터 보호는 supabase/schema.sql 의 RLS 규칙이 담당합니다.
 * service_role 키는 절대 이 파일이나 저장소에 넣지 마세요. */
window.DV_CONFIG = {
  SUPABASE_URL: 'https://lzwbqgexdgtsoihsifke.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6d2JxZ2V4ZGd0c29paHNpZmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwODAwOTgsImV4cCI6MjEwODY1NjA5OH0.kQb3Z28ZvAXysWdqlX4Y8qX01QFgH3oXpIi5nsrmgx4',
  /* 아이디 로그인을 위해 내부적으로 쓰는 가상 이메일 도메인 (실제 메일은 발송되지 않음).
   * 가입 시 "invalid email" 오류가 나면 회사가 소유한 도메인으로 바꾸세요. 운영 중에는 변경하지 마세요. */
  LOGIN_EMAIL_DOMAIN: 'seminar.mcircle.biz'
};
