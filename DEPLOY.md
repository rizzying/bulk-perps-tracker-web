# Bulk Perps Web: deploy (100% free tiers)

**Stack:** Vite + React SPA with Vercel Functions (`/api/*.ts`) on **Vercel Hobby**, **Neon Postgres Free**, **GitHub Actions** for cron jobs, and web push via VAPID (no push service account needed).
Bulk data is fetched **client-side** (each user's own IP, the existing 4 req/s limiter, WebSocket in the browser). The server only proxies aurabulk.xyz (no CORS there) and stores small tables.

## Accounts needed (owner must create/sign in; the agent did not)
| Service | Plan | Used for |
|---|---|---|
| GitHub | Free (public repo recommended, see Actions minutes) | source + Actions cron |
| Vercel | Hobby | hosting + /api functions |
| Neon | Free (0.5 GB) | Postgres |

## Env vars / secrets
| Name | Where | Value |
|---|---|---|
| `DATABASE_URL` | Vercel env + GitHub Actions secret | Neon pooled connection string |
| `VAPID_PUBLIC_KEY` | Vercel env + GitHub secret | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | GitHub secret only | same command |
| `VAPID_SUBJECT` | GitHub secret | `mailto:you@example.com` |
| (optional) `VERCEL_TOKEN` | only if deploying via CLI/agent instead of the Vercel GitHub integration | vercel.com/account/tokens |

## Steps
1. Create a GitHub repo and push this folder.
2. Create a Neon project, copy the pooled `DATABASE_URL`, then run `DATABASE_URL=… npm run db:init`.
3. In Vercel: Import the repo (framework auto = Vite), add `DATABASE_URL` + `VAPID_PUBLIC_KEY`, deploy.
4. In the GitHub repo, under Settings → Secrets → Actions, add `DATABASE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The workflows `sample-and-alerts` (*/15) and `aura-weekly-refit` (daily, no-op unless a new week is published) start automatically.

Without the DB/VAPID vars the app still works fully client-side. Sync, background push and server OI samples/refits then show "not configured" and the app falls back to the browser's own OI recorder and the bundled weights.

## Free-tier limits
- **GitHub Actions:** a public repo has unlimited minutes. A private repo gets 2,000 min/month, but a 15-min job ≈ 2,900 runs ≈ 2,900+ billed minutes, so it would exceed the limit. For a private repo, use `*/30` (≈1,450 min) or make it public. Scheduled runs can be delayed 5–15+ min at busy times.
- **Vercel Hobby:** non-commercial use only; 100 GB bandwidth/month; functions are light here (aurabulk proxy cached 5 min at the edge).
- **Neon Free:** 0.5 GB storage. OI samples ≈ 35k rows/year (tiny); compute auto-suspends, so the first request after idle has about 0.5–1 s cold start.
- **Bulk 5 req/s per IP:** browsers fetch directly. Only the Actions jobs hit Bulk from GitHub IPs: sampler 1 req/15 min; the alert checker needs about 2–4 req per subscribed wallet; the refit makes about 1–3k req once a week, paced at 4/s.
