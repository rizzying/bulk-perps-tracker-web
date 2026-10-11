// GitHub Actions, Saturdays after the drop (+ daily retry): fit the newly published week on ~300 leaderboard wallets, append weights + residuals.
import { neon } from "@neondatabase/serverless";
import { refit, weekFeatures, weekStart, weekEnd, OI_STATS_FACTOR, VOL_KLINES_FACTOR, BUNDLED } from "../src/aura/estimator";
import { loadRawNode } from "./raw";
import { client } from "../src/api/client";
const db = neon(process.env.DATABASE_URL!);
const lb = async (tab: string) => (await (await fetch(`https://www.aurabulk.xyz/api/leaderboard?tab=${tab}&limit=100`)).json()).items ?? [];
const tabs = await Promise.all(["aura", "volume", "pnl"].map(lb));
let N = 0; for (const t of tabs) for (const x of t) for (const k of Object.keys(x.categories)) { const m = /^mainnet_week(\d+)_trading$/.exec(k); if (m) N = Math.max(N, +m[1]); }
const have = new Set([...BUNDLED.weekly.map((w) => w.week), ...(await db`select week from weekly_weights`).map((r: any) => r.week)]);
if (have.has(N)) { console.log(`week ${N} already fitted`); process.exit(0); }
// platform totals for week N
const syms = (await client.exchangeInfo()).map((x) => x.symbol); let pv = 0;
for (const s of syms) for (const c of await client.klines(s, "1h", weekStart(N))) if (c.t >= weekStart(N) && c.t < weekEnd(N)) pv += c.v * c.c;
pv *= VOL_KLINES_FACTOR;
const oi = await db`select avg(oi_usd) as m, count(*) as n from oi_samples where t >= ${new Date(weekStart(N)).toISOString()} and t < ${new Date(weekEnd(N)).toISOString()}`;
const meanOI = +oi[0].m || ((await (await fetch("https://mainnet-api1.bulk.trade/api/v1/stats?period=1d")).json()).openInterest.totalUsd);
const platform = { [N]: { vol: pv, oih: OI_STATS_FACTOR * meanOI * 168 } };
const seen = new Set<string>(); const cand: any[] = [];
for (let i = 0; i < 100; i++) for (const t of tabs) { const x = t[i]; if (x && !seen.has(x.wallet) && (x.categories[`mainnet_week${N}_trading`] ?? 0) > 0) { seen.add(x.wallet); cand.push(x); } }
const rows: number[][] = [];
for (const [i, x] of cand.entries()) { try { const r = await loadRawNode(x.wallet, weekStart(N)); if (!r.complete) continue; const f = weekFeatures(r, N);
  if (f.vol > 0) rows.push([N, f.vol, f.fees, f.oih, f.hoursOpen, x.categories[`mainnet_week${N}_trading`]]); } catch { /* skip */ } if (i % 25 === 0) console.log(`${i}/${cand.length}`); }
if (rows.length < 30) { console.log(`only ${rows.length} usable wallets; not appending`); process.exit(0); }
const f = refit(rows, platform); const c = f.coef;
const sane = c[1] > 0 && c[1] < 1 && c[2] > 0 && c[2] < 1 && c[3] > 0 && c[3] < 1 && c[4] > -1 && c[4] < 0.5;
if (!sane) { console.log("implausible fit, not appending", c); process.exit(0); }
await db`insert into weekly_weights (week, w, resid, platform, n) values (${N}, ${JSON.stringify(c)}, ${JSON.stringify(f.resid.map((r) => +r.toFixed(4)))}, ${JSON.stringify(platform[N])}, ${rows.length})`;
console.log(`week ${N}: n=${rows.length} weights`, c.map((x) => x.toFixed(3)).join(" "), `OI samples ${oi[0].n}`);
