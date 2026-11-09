// Database schema. Applied automatically on first request (idempotent) or via `npm run db:migrate`.
export const SCHEMA_SQL = /* sql */ `
-- YouTube multi-channel dashboard schema (PostgreSQL 14+ / Supabase).
-- Idempotent: safe to run on every deploy. Applied automatically on first request,
-- or manually with \`npm run db:migrate\`.

-- One row per connected YouTube channel. Each channel has its own OAuth grant,
-- so channels can belong to different Google accounts or Brand Accounts.
create table if not exists channels (
  id                   text primary key,            -- YouTube channel ID (UC…)
  title                text not null,
  custom_url           text,
  thumbnail_url        text,
  uploads_playlist_id  text,
  google_email         text,                        -- Google account that granted access
  refresh_token_enc    text,                        -- AES-256-GCM ciphertext, never sent to the browser
  scopes               text,
  status               text not null default 'active'
                       check (status in ('active', 'needs_reauth', 'error')),
  last_error           text,
  data_through         date,                        -- latest day YouTube Analytics has published for this channel
  last_synced_at       timestamptz,
  connected_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Daily analytics per channel (YouTube Analytics API, \`day\` dimension).
-- Primary key makes every sync an idempotent upsert: no duplicate records.
create table if not exists channel_daily_stats (
  channel_id          text not null references channels(id) on delete cascade,
  day                 date not null,
  views               bigint not null,
  watch_minutes       double precision not null,
  subscribers_gained  integer not null,
  subscribers_lost    integer not null,
  fetched_at          timestamptz not null default now(),
  primary key (channel_id, day)
);

-- Lifetime public counters (YouTube Data API channels.list), one snapshot per channel per KST day.
create table if not exists channel_snapshots (
  channel_id               text not null references channels(id) on delete cascade,
  snapshot_date            date not null,
  view_count               bigint,
  subscriber_count         bigint,
  hidden_subscriber_count  boolean not null default false,
  video_count              integer,
  captured_at              timestamptz not null default now(),
  primary key (channel_id, snapshot_date)
);

create table if not exists videos (
  id             text primary key,                  -- YouTube video ID
  channel_id     text not null references channels(id) on delete cascade,
  title          text not null,
  thumbnail_url  text,
  published_at   timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists videos_channel_published_idx on videos (channel_id, published_at desc);

-- Per-video totals for a KST week (Sunday start), from the Analytics \`video\` dimension.
create table if not exists weekly_video_stats (
  week_start                     date not null,
  video_id                       text not null references videos(id) on delete cascade,
  channel_id                     text not null references channels(id) on delete cascade,
  views                          bigint not null,
  watch_minutes                  double precision not null,
  average_view_duration_seconds  double precision,
  fetched_at                     timestamptz not null default now(),
  primary key (week_start, video_id)
);
create index if not exists weekly_video_stats_views_idx on weekly_video_stats (week_start, views desc);

-- One stored report per week. Regenerating a week overwrites it (no duplicates).
create table if not exists weekly_reports (
  week_start    date primary key,
  generated_at  timestamptz not null default now(),
  trigger       text not null,
  report_json   jsonb not null,
  markdown      text not null
);

create table if not exists sync_runs (
  id               bigserial primary key,
  trigger          text not null,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running'
                   check (status in ('running', 'success', 'partial', 'failed')),
  channels_ok      integer not null default 0,
  channels_failed  integer not null default 0,
  details          jsonb
);

-- Units spent per API per Pacific-time day (YouTube quotas reset at midnight PT).
create table if not exists api_quota_usage (
  day    date not null,
  api    text not null check (api in ('data', 'analytics')),
  units  integer not null default 0,
  primary key (day, api)
);
`;
