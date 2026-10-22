-- أبشري — optional shared database (Supabase / Postgres)
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Visitors (anon) may only INSERT complaints. Nobody can read them except
-- signed-in accounts whose email is listed in public.admins.

create extension if not exists pgcrypto;

create table if not exists public.complaints (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  college          text not null check (char_length(college) between 1 and 80),
  title            text not null check (char_length(title) between 4 and 80),
  text             text not null check (char_length(text) between 15 and 600),
  student_category text check (student_category is null or student_category in
                   ('network','facilities','parking','food','teaching','schedule','systems','support'))
);

create table if not exists public.admins (
  email text primary key
);

alter table public.complaints enable row level security;
alter table public.admins     enable row level security;   -- no policies: not readable from the browser

-- anyone (signed in or not) may submit; nobody may update or delete from the browser
drop policy if exists "submit complaints" on public.complaints;
create policy "submit complaints" on public.complaints
  for insert to anon, authenticated with check (true);

-- only listed admins may read
drop policy if exists "admins read complaints" on public.complaints;
create policy "admins read complaints" on public.complaints
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')));

-- Then:
-- 1) Authentication → Users → Add user (your email + a strong password).
-- 2) insert into public.admins (email) values ('your-email@example.com');
-- 3) Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".
