create table if not exists projects (
  id text primary key,
  name text not null,
  filename text,
  row_count integer not null default 0,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists company_rows (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  source_index integer not null,
  raw_record jsonb not null,
  status text not null default 'queued',
  progress integer not null default 0,
  selected_decision text,
  created_at timestamptz not null default now()
);

create table if not exists cell_evals (
  id text primary key,
  row_id text not null references company_rows(id) on delete cascade,
  field_key text not null,
  current_value text,
  proposed_value text,
  trust_score integer,
  status text not null default 'queued',
  rationale text,
  contradictions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (row_id, field_key)
);

create table if not exists evidence_sources (
  id text primary key,
  cell_eval_id text references cell_evals(id) on delete cascade,
  row_id text references company_rows(id) on delete cascade,
  title text not null,
  url text not null,
  source_type text not null,
  claim text not null,
  created_at timestamptz not null default now()
);

create table if not exists data_prs (
  id text primary key,
  row_id text not null references company_rows(id) on delete cascade,
  priority text not null,
  decision text not null,
  recommended_action text not null,
  business_impact text not null,
  patch_preview jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_events (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  row_id text references company_rows(id) on delete cascade,
  field_key text,
  agent text,
  type text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_rows_project_id_idx on company_rows(project_id);
create index if not exists cell_evals_row_id_idx on cell_evals(row_id);
create index if not exists evidence_sources_row_id_idx on evidence_sources(row_id);
create index if not exists data_prs_row_id_idx on data_prs(row_id);
create index if not exists agent_events_project_id_idx on agent_events(project_id);
