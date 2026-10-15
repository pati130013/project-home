-- Wklej w Supabase: SQL Editor -> New query -> Run

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  room text,
  assignee text,
  status text not null default 'todo',
  due date,
  cost numeric,
  cost_paid boolean not null default false,
  depends_on uuid[] not null default '{}',
  notes text,
  created_at timestamptz default now()
);

create table links (
  id uuid primary key default gen_random_uuid(),
  room text,
  title text not null,
  url text,
  image text,
  note text,
  created_at timestamptz default now()
);

create table budget (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric,
  room text,
  task_id uuid references tasks(id) on delete set null,
  paid boolean not null default false,
  note text,
  created_at timestamptz default now()
);

create table settings (
  key text primary key,
  value numeric
);

alter table tasks enable row level security;
alter table links enable row level security;
alter table budget enable row level security;
alter table settings enable row level security;

-- Dostęp tylko dla zalogowanych użytkowników (czyli Was dwojga)
create policy "auth all tasks" on tasks for all to authenticated using (true) with check (true);
create policy "auth all links" on links for all to authenticated using (true) with check (true);
create policy "auth all budget" on budget for all to authenticated using (true) with check (true);
create policy "auth all settings" on settings for all to authenticated using (true) with check (true);

-- Zmiany pojawiają się od razu na drugim urządzeniu (realtime)
alter publication supabase_realtime add table tasks, links, budget, settings;
