-- Bulk Perps Web — free-tier Postgres (Neon). Run once: npm run db:init
create table if not exists oi_samples (t timestamptz primary key, oi_usd double precision not null, vol24_usd double precision);
create table if not exists weekly_weights (week int primary key, w jsonb not null, resid jsonb not null, platform jsonb, n int, created timestamptz default now());
-- journal sync: server stores only ciphertext; id is derived from the user's passphrase client-side (PBKDF2), never the wallet address
create table if not exists journal_sync (id text primary key, iv text not null, blob text not null, updated timestamptz default now());
create table if not exists push_subs (endpoint text primary key, sub jsonb not null, wallets jsonb not null, warn double precision not null default 0.15, danger double precision not null default 0.07, last_alert jsonb default '{}'::jsonb, created timestamptz default now());
