-- 初始化 AI 旅行规划师数据库结构
-- 约定：所有表使用 timestamptz 并以 created_at/updated_at 追踪。

-- 1. Profile 扩展表：补充 Supabase Auth 默认 users 表
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  default_budget numeric(12, 2),
  preferences jsonb default '{}'::jsonb,
  travel_style text, -- 例如：慢节奏、亲子、探险
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger user_profiles_updated_at
before update on public.user_profiles
for each row execute procedure public.set_updated_at();

-- 2. Trips
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  budget numeric(12, 2),
  travelers jsonb default '[]'::jsonb, -- 同行人信息
  tags text[] default '{}',
  llm_request jsonb, -- 请求参数留档
  budget_breakdown jsonb,
  status text default 'draft', -- draft / generating / ready / archived
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create trigger trips_updated_at
before update on public.trips
for each row execute procedure public.set_updated_at();

create index if not exists trips_user_id_idx on public.trips(user_id);
create index if not exists trips_destination_idx on public.trips using gin (to_tsvector('simple', destination));

-- 3. Trip days
create table if not exists public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  date date not null,
  summary text,
  notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null,
  unique(trip_id, date)
);

create trigger trip_days_updated_at
before update on public.trip_days
for each row execute procedure public.set_updated_at();

create index if not exists trip_days_trip_id_idx on public.trip_days(trip_id);

-- 4. Activities
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_day_id uuid not null references public.trip_days on delete cascade,
  type text not null, -- e.g. transport / attraction / dining / hotel
  start_time timestamptz,
  end_time timestamptz,
  location text,
  poi_id text,
  cost numeric(12, 2),
  currency text default 'CNY',
  details jsonb,
  status text default 'planned',
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create trigger activities_updated_at
before update on public.activities
for each row execute procedure public.set_updated_at();

create index if not exists activities_trip_day_idx on public.activities(trip_day_id);
create index if not exists activities_type_idx on public.activities(type);

-- 5. Expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  category text not null,
  amount numeric(12, 2) not null,
  currency text default 'CNY',
  source text, -- manual / system / voice
  memo text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create trigger expenses_updated_at
before update on public.expenses
for each row execute procedure public.set_updated_at();

create index if not exists expenses_trip_id_idx on public.expenses(trip_id);
create index if not exists expenses_category_idx on public.expenses(category);

-- 6. Voice inputs
create table if not exists public.voice_inputs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips on delete set null,
  user_id uuid not null references auth.users on delete cascade,
  transcript text,
  audio_url text,
  status text default 'pending',
  created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists voice_inputs_user_id_idx on public.voice_inputs(user_id);

-- 7. Sync logs
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  change jsonb not null,
  created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists sync_logs_trip_id_idx on public.sync_logs(trip_id);

-- 8. 视图：聚合行程预算与支出
create or replace view public.trip_expense_summary as
select
  t.id as trip_id,
  coalesce(sum(e.amount), 0) as total_expense,
  t.budget,
  case
    when t.budget is null or t.budget = 0 then null
    else sum(e.amount) / t.budget
  end as budget_usage
from public.trips t
left join public.expenses e on e.trip_id = t.id
group by t.id;

-- 9. RLS 策略
alter table public.user_profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_days enable row level security;
alter table public.activities enable row level security;
alter table public.expenses enable row level security;
alter table public.voice_inputs enable row level security;
alter table public.sync_logs enable row level security;

-- 用户只能访问自己的 profile
drop policy if exists "用户仅能查看自己的资料" on public.user_profiles;
create policy "用户仅能查看自己的资料"
  on public.user_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "用户仅能更新自己的资料" on public.user_profiles;
create policy "用户仅能更新自己的资料"
  on public.user_profiles
  for update using (auth.uid() = user_id);

drop policy if exists "用户自动插入自己的资料" on public.user_profiles;
create policy "用户自动插入自己的资料"
  on public.user_profiles
  for insert with check (auth.uid() = user_id);

-- Trips 及其子表
drop policy if exists "仅行程拥有者可访问 trips" on public.trips;
create policy "仅行程拥有者可访问 trips"
  on public.trips
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "仅行程拥有者可访问 trip_days" on public.trip_days;
create policy "仅行程拥有者可访问 trip_days"
  on public.trip_days
  for all using (
    exists (
      select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "仅行程拥有者可访问 activities" on public.activities;
create policy "仅行程拥有者可访问 activities"
  on public.activities
  for all using (
    exists (
      select 1
      from public.trip_days td
      join public.trips t on t.id = td.trip_id
      where td.id = trip_day_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.trip_days td
      join public.trips t on t.id = td.trip_id
      where td.id = trip_day_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "仅行程拥有者可访问 expenses" on public.expenses;
create policy "仅行程拥有者可访问 expenses"
  on public.expenses
  for all using (
    exists (
      select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "仅行程拥有者可访问 voice_inputs" on public.voice_inputs;
create policy "仅行程拥有者可访问 voice_inputs"
  on public.voice_inputs
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "仅行程拥有者可访问 sync_logs" on public.sync_logs;
create policy "仅行程拥有者可访问 sync_logs"
  on public.sync_logs
  for select using (
    exists (
      select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()
    )
  );

-- 10. Helper 函数：自动初始化 profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
