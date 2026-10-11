import { z } from "zod";
import { client } from "../api/client";
import { BUNDLED, Model, Raw, WeekW, meanWeights, weekStart, weekEnd, weekOf, weekFeatures, refit, OI_STATS_FACTOR, VOL_KLINES_FACTOR, lastPlatformWeek } from "./estimator";

const NS = 1e6;

// ---------- aurabulk.xyz (no CORS → Tauri HTTP plugin in the app, Vite proxy in dev) ----------
async function auraGet(path: string): Promise<any> {
  const r = await fetch(`/api/aura?u=${encodeURIComponent(path)}`); // same-origin proxy (Vercel function in prod, Vite middleware in dev)
  if (!r.ok) throw new Error(`aurabulk HTTP ${r.status}`);
  return r.json();
}
export type AuraWallet = { wallet: string; aura: number; aura_rank?: number; categories: Record<string, number> };
export async function auraWallet(address: string): Promise<AuraWallet | null> { const d = await auraGet(`wallet?address=${encodeURIComponent(address)}`); return d?.wallet ? d : null; }
export async function leaderboard(tab: "aura" | "volume" | "pnl", limit = 100): Promise<AuraWallet[]> { return (await auraGet(`leaderboard?tab=${tab}&limit=${limit}`)).items ?? []; }
export const actualFor = (a: AuraWallet | null, w: number) => a ? { trading: a.categories[`mainnet_week${w}_trading`] ?? null, maker: a.categories[`mainnet_week${w}_maker`] ?? null, boost: a.categories[`mainnet_week${w}_boost`] ?? null } : null;
export const publishedWeek = (rows: AuraWallet[]) => { let w = 0; for (const x of rows) for (const k of Object.keys(x.categories)) { const m = /^mainnet_week(\d+)_trading$/.exec(k); if (m) w = Math.max(w, +m[1]); } return w; };

// ---------- Bulk history: master + sub-accounts ----------
const Any = z.any();
async function pageBack(type: "fills" | "positions" | "fundingHistory", user: string, from: number, tsOf: (r: any) => number, maxPages: number) {
  const rows: any[] = []; let cursor: string | undefined; let complete = false;
  for (let i = 0; i < maxPages; i++) {
    const p = await client.history(type, Any, user, { limit: 1000, cursor }); rows.push(...p.data);
    if (!p.page.hasMore || !p.page.nextCursor) { complete = true; break; }
    if (p.data.length && tsOf(p.data[p.data.length - 1]) < from) { complete = true; break; }
    cursor = p.page.nextCursor;
  }
  return { rows, complete };
}
export type LoadedRaw = Raw & { accounts: string[]; complete: boolean; from: number };
/** Positions (closed), hourly funding rows and fills since `from` for the address and all its sub-accounts. */
export async function loadRaw(address: string, from: number, onProgress?: (m: string) => void, maxPages = 40): Promise<LoadedRaw> {
  let subs: string[] = [];
  try { const fa: any = await client.fullAccount(address); subs = (fa.subAccounts ?? []).map((s: any) => s.pubkey).filter(Boolean); } catch { /* no account yet */ }
  const accounts = [address, ...subs]; const out: LoadedRaw = { positions: [], funding: [], fills: [], own: new Set(accounts), accounts, complete: true, from };
  for (const a of accounts) {
    onProgress?.(`${a.slice(0, 4)}…: positions`); const p = await pageBack("positions", a, from, (r) => r.closeTime / NS, maxPages);
    onProgress?.(`${a.slice(0, 4)}…: funding`); const f = await pageBack("fundingHistory", a, from, (r) => r.timestamp / NS, maxPages);
    onProgress?.(`${a.slice(0, 4)}…: fills`); const fl = await pageBack("fills", a, from, (r) => r.timestamp / NS, maxPages);
    out.positions.push(...p.rows); out.funding.push(...f.rows); out.fills.push(...fl.rows); out.complete &&= p.complete && f.complete && fl.complete;
  }
  return out;
}

// ---------- platform totals ----------
let syms: string[] | null = null;
/** Platform volume as used in the fit: 2 × Σ (1h klines volume × close) over all markets. */
export async function platformVolume(from: number, to: number) {
  syms ??= (await client.exchangeInfo()).map((x) => x.symbol);
  let v = 0; for (const s of syms) for (const c of await client.klines(s, "1h", from)) if (c.t >= from && c.t < to) v += c.v * c.c;
  return v * VOL_KLINES_FACTOR;
}
// own OI recorder (fallback for bulkstats oi-chart): Bulk /stats total OI, sampled every 15 min while the app runs
const OK = "aura.oiRecorder.v1";
type OiPt = { t: number; oi: number };
export const oiPoints = (): OiPt[] => { try { return JSON.parse(localStorage.getItem(OK) || "[]"); } catch { return []; } };
export async function recordOI() {
  const s: any = await client.stats(); const oi = s?.openInterest?.totalUsd; if (!(oi > 0)) return;
  const pts = [...oiPoints(), { t: Date.now(), oi }].filter((p) => p.t > Date.now() - 60 * 864e5); localStorage.setItem(OK, JSON.stringify(pts));
}
export function startOiRecorder() { void recordOI().catch(() => {}); setInterval(() => void recordOI().catch(() => {}), 15 * 60_000); }
/** Platform OI-hours for a week: 1.93 × mean recorded OI × 168 (1.93 reproduces the fit's bulkstats-based totals). */
/** Server-recorded samples (GitHub Actions every 15 min) merged with this browser's own samples. */
async function serverOI(from: number, to: number): Promise<OiPt[]> { try { const r = await fetch(`/api/platform?from=${from}&to=${to}`); return r.ok ? (await r.json()).points : []; } catch { return []; } }
export async function platformOIHours(w: number) {
  const srv = await serverOI(weekStart(w), weekEnd(w));
  const pts = srv.length >= 24 ? srv : [...srv, ...oiPoints().filter((p) => p.t >= weekStart(w) && p.t < weekEnd(w))];
  let mean = pts.length ? pts.reduce((s, p) => s + p.oi, 0) / pts.length : NaN;
  if (!Number.isFinite(mean)) { const s: any = await client.stats(); mean = s?.openInterest?.totalUsd; }
  return { oih: OI_STATS_FACTOR * mean * 168, recorded: pts.length };
}
/** Platform totals for a complete week: bundled for fitted weeks, else computed (and cached in the model store). */
export async function platformFor(m: Model, w: number): Promise<{ vol: number; oih: number; source: string }> {
  if (m.platform[w]) return { ...m.platform[w], source: m.source === "bundled" || w <= 5 ? "fit" : "stored" };
  const vol = await platformVolume(weekStart(w), weekEnd(w)); const o = await platformOIHours(w);
  return { vol, oih: o.oih, source: o.recorded ? `klines + ${o.recorded} OI samples` : "klines + current OI (approx)" };
}

// ---------- model store + weekly auto-refit ----------
const MK = "aura.modelV2.v1";
type Stored = { weekly: WeekW[]; platform: Model["platform"]; refitWeek: number; fittedOn: string };
export function loadModel(): Model {
  try { const s: Stored | null = JSON.parse(localStorage.getItem(MK) || "null");
    if (s?.weekly?.length) return { coef: meanWeights(s.weekly), weekly: s.weekly, platform: { ...BUNDLED.platform, ...s.platform }, fittedOn: s.fittedOn, refitWeek: s.refitWeek, source: "in-app" }; } catch { /* ignore */ }
  return BUNDLED;
}
const sane = (c: number[]) => c[1] > 0 && c[1] < 1 && c[2] > 0 && c[2] < 1 && c[3] > 0 && c[3] < 1 && c[4] > -1 && c[4] < 0.5;
/** After a drop (week N published): features for ~300 leaderboard wallets for week N → OLS → append that week's weights + residuals. */
export async function autoRefit(N: number, onProgress?: (m: string) => void, maxWallets = 300): Promise<Model> {
  const cur = loadModel();
  const tabs = await Promise.all((["aura", "volume", "pnl"] as const).map((t) => leaderboard(t, 300)));
  const seen = new Set<string>(); const cand: AuraWallet[] = [];
  for (let i = 0; i < 1000; i++) for (const t of tabs) { const x = t[i]; if (x && !seen.has(x.wallet) && (x.categories[`mainnet_week${N}_trading`] ?? 0) > 0) { seen.add(x.wallet); cand.push(x); } }
  const plat = await platformFor(cur, N); const rows: number[][] = [];
  let i = 0;
  for (const x of cand.slice(0, maxWallets)) {
    onProgress?.(`refit week ${N}: wallet ${++i}/${Math.min(maxWallets, cand.length)}`);
    try { const r = await loadRaw(x.wallet, weekStart(N), undefined, 10); if (!r.complete) continue;
      const f = weekFeatures(r, N); if (f.vol > 0) rows.push([N, f.vol, f.fees, f.oih, f.hoursOpen, x.categories[`mainnet_week${N}_trading`]]); } catch { /* skip */ }
  }
  if (rows.length < 30) throw new Error(`refit week ${N}: only ${rows.length} usable wallets, keeping the current model`);
  const platform = { ...cur.platform, [N]: { vol: plat.vol, oih: plat.oih } };
  const f = refit(rows, platform); const ok = sane(f.coef);
  const weekly = [...cur.weekly.filter((x) => x.week !== N), ...(ok ? [{ week: N, w: f.coef, resid: f.resid.map((r) => +r.toFixed(4)) }] : [])];
  const next: Stored = { weekly, platform, refitWeek: N, fittedOn: `${weekly.length} weekly weight sets (weeks ${weekly.map((x) => x.week).join(",")})${ok ? "" : `; week ${N} fit rejected as implausible`}` };
  localStorage.setItem(MK, JSON.stringify(next)); return loadModel();
}
export const needsRefit = (m: Model, published: number) => published > Math.max(5, m.refitWeek ?? 0, lastPlatformWeek(m));

// ---------- boost promo (separate line, default OFF) ----------
const BK = "aura.boost.v1";
export type Boost = { enabled: boolean; multiplier: number; start: string; days: number };
export const loadBoost = (): Boost => { try { return { enabled: false, multiplier: 1.1, start: new Date().toISOString().slice(0, 10), days: 7, ...JSON.parse(localStorage.getItem(BK) || "{}") }; } catch { return { enabled: false, multiplier: 1.1, start: "", days: 7 }; } };
export const saveBoost = (b: Boost) => localStorage.setItem(BK, JSON.stringify(b));
export const boostActive = (b: Boost, now: number) => { if (!b.enabled) return false; const s = Date.parse(b.start + "T00:00:00Z"); return Number.isFinite(s) && now >= s && now < s + b.days * 864e5; };

// ---------- recent lookups ----------
const RK = "aura.recentLookups.v1";
export const recentLookups = (): string[] => { try { return JSON.parse(localStorage.getItem(RK) || "[]"); } catch { return []; } };
export const pushLookup = (a: string) => localStorage.setItem(RK, JSON.stringify([a, ...recentLookups().filter((x) => x !== a)].slice(0, 8)));
export { weekOf };

/** Weekly weights appended server-side by the Saturday refit job (falls back to bundled weeks 1–5). */
export async function loadServerModel(): Promise<Model> {
  const base = loadModel();
  try { const r = await fetch("/api/weights"); if (!r.ok) return base; const { weekly } = await r.json();
    if (!weekly?.length) return base;
    const extra: WeekW[] = weekly.map((x: any) => ({ week: x.week, w: x.w, resid: x.resid }));
    const all = [...base.weekly.filter((x) => !extra.some((e) => e.week === x.week)), ...extra].sort((a, b) => a.week - b.week);
    const platform = { ...base.platform }; for (const x of weekly) if (x.platform) platform[x.week] = x.platform;
    return { ...base, weekly: all, coef: meanWeights(all), platform, fittedOn: `${all.length} weekly weight sets (weeks ${all.map((x) => x.week).join(",")}), server refit`, source: "in-app" };
  } catch { return base; }
}
