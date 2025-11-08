-- 新增 trip_intents 表：用于存储语音/文本解析后的结构化意图

create table if not exists public.trip_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  voice_input_id uuid references public.voice_inputs on delete set null,
  raw_input text not null,
  structured_payload jsonb not null,
  field_confidences jsonb,
  confidence numeric(5, 4) default 0 not null,
  source text default 'text' not null,
  status text default 'parsed' not null,
  error text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists trip_intents_user_id_idx on public.trip_intents(user_id);
create index if not exists trip_intents_voice_input_id_idx on public.trip_intents(voice_input_id);
create index if not exists trip_intents_created_at_idx on public.trip_intents(created_at desc);

create trigger trip_intents_updated_at
before update on public.trip_intents
for each row execute procedure public.set_updated_at();

alter table public.trip_intents enable row level security;

drop policy if exists "用户仅能访问自己的 trip_intents" on public.trip_intents;
create policy "用户仅能访问自己的 trip_intents"
  on public.trip_intents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
