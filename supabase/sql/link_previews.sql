-- 링크 미리보기 캐시 테이블
-- Supabase 대시보드 > SQL Editor 에서 이 파일의 내용 전체를 붙여넣고 Run 하세요.

create table if not exists public.link_previews (
  url        text primary key check (char_length(url) <= 2048),
  data       jsonb       not null default '{}'::jsonb check (octet_length(data::text) <= 20000),
  ok         boolean     not null default false,
  fetched_at timestamptz not null default now()
);

-- RLS를 켜고 정책을 하나도 만들지 않는다.
-- 앱(로그인 사용자·anon)은 이 테이블을 읽고 쓸 수 없고, Edge Function만 service role로 접근한다.
alter table public.link_previews enable row level security;

-- 혹시 기본 권한이 열려 있어도 앱 쪽 역할의 접근을 명시적으로 막는다
revoke all on public.link_previews from anon, authenticated;
