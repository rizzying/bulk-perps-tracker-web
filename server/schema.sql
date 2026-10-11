-- Bulk Perps Web — free-tier Postgres (Neon). Run once: npm run db:init
create table if not exists oi_samples (t timestamptz primary key, oi_usd double precision not null, vol24_usd double precision);
create table if not exists weekly_weights (week int primary key, w jsonb not null, resid jsonb not null, platform jsonb, n int, created timestamptz default now());
-- Public deployment: no user data is stored server-side (no journal, no wallet addresses). Only platform-wide OI samples and AURA weights.
