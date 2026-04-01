create table if not exists research_records (
  id text primary key,
  slug text not null,
  source_type text not null,
  source_reference text not null,
  raw_input text not null,
  normalized_text text not null,
  title text,
  authors jsonb not null default '[]'::jsonb,
  publication text,
  source_date text,
  completeness text not null,
  requested_action text not null,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  model text not null,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  export_paths jsonb not null default '[]'::jsonb,
  github_sync_status text not null default 'not_requested',
  github_sync_target text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_records_created_at
  on research_records (created_at desc);

create index if not exists idx_research_records_action
  on research_records (requested_action);

create index if not exists idx_research_records_source_type
  on research_records (source_type);
