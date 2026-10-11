/**
 * AURA estimator v2 (ESTIMATE). Share-of-platform log model, fit on 1480 wallet-weeks (weeks 1–5):
 *   ln AURA_trading = 17.90 + 0.230 ln(vol/PV) + 0.366 ln((|fees|+0.01)/PV) + 0.368 ln((OIh+1)/POH) − 0.202 ln(1+hours_open)  (mean of per-week weights)
 * PV = platform volume of the week (2 × Σ klines quote volume), POH = platform OI-hours (1.93 × mean /stats OI × 168).
 * Walk-forward (resample-week MC): typical error ×1.49, P10–P90 coverage 78.9%. Maker AURA = exp(−6.946) · makerVol^0.890 (separate line).
 * Week = Sat 06:00 UTC (13:00 WIB) → next Sat.
 */
import M from "./model_v2.json";
import TM from "./model_tiered.json";

export const WEEK_MS = 7 * 864e5, HOUR = 36e5, DAY = 864e5;
export const WEEK1_START = Date.parse(M.week1_start_utc);
export const weekOf = (t: number) => Math.floor((t - WEEK1_START) / WEEK_MS) + 1;
export const weekStart = (w: number) => WEEK1_START + (w - 1) * WEEK_MS;
export const weekEnd = (w: number) => weekStart(w + 1);
export const BAND = 2.6;

export type WeekW = { week: number; w: number[]; resid: number[] };
export type Model = { coef: number[]; weekly: WeekW[]; platform: Record<number, { vol: number; oih: number }>; fittedOn: string; refitWeek?: number; source: "bundled" | "in-app" };
/** Tier-balanced calibration (aura/weekly_weights_tiered.json): tier-weighted per-week weights, per-tier residual pools,
 *  tier from the model's own point estimate (cuts 148/512/1900/5300/30000), median ×1.2 (models under-predict ~20%), Silver/Challenger bands ×1.12.
 *  Walk-forward weeks 2–5 (1,996 wallet-weeks): typical error ×1.52, P10–P90 coverage 80.7%, P90/P10 width ×5.83 (old model ×1.59 / 79.8% / ×6.73), bias ×1.05. */
export const TIERED = TM as { mean: number[]; weekly: WeekW[]; cuts: number[]; tiers: string[]; calib: number; widen: Record<string, number>; residByTier: Record<string, number[]> };
export const tierOf = (aura: number) => TIERED.tiers[TIERED.cuts.findIndex((c) => aura <= c) === -1 ? TIERED.cuts.length : TIERED.cuts.findIndex((c) => aura <= c)];
const TIER_MED = Object.fromEntries(Object.entries(TIERED.residByTier).map(([t, r]) => [t, [...r].sort((a, b) => a - b)[Math.floor(r.length / 2)]]));
export const BUNDLED_WEEKS = TIERED.weekly.map((w) => w.week);
export const BUNDLED: Model = { coef: TIERED.mean, weekly: TIERED.weekly, platform: Object.fromEntries(Object.entries(M.platform).map(([k, v]) => [+k, v as any])), fittedOn: M.fitted_on, source: "bundled" };
export const MC = M.mc, SIG = { week: M.sig_week, pv: M.sig_pv, po: M.sig_po };
export const OI_STATS_FACTOR = M.oi_stats_factor, VOL_KLINES_FACTOR = M.vol_klines_factor;
export const TRAIN: number[][] = M.train as number[][]; // [week, vol, |fees|, OIh, hours_open, aura]

/** Weekly (and daily) features from raw Bulk rows of master + sub-accounts. */
export type Raw = { positions: any[]; funding: any[]; fills: any[]; own: Set<string> };
export type Feat = { vol: number; fees: number; oih: number; hoursOpen: number; makerVol: number; positions: number; oiC?: number; oiF?: number };
const NS = 1e6;
export function weekFeatures(r: Raw, w: number, now = Infinity): Feat {
  return rangeFeatures(r, weekStart(w), Math.min(weekEnd(w), now));
}
export function rangeFeatures(r: Raw, lo: number, hi: number): Feat {
  let vol = 0, fees = 0, oiC = 0, n = 0;
  for (const x of r.positions) {
    const ct = x.closeTime / NS;
    if (ct >= lo && ct < hi) { vol += Math.abs(x.totalVolume) * (x.avgOpenPrice + x.avgClosePrice) / 2; fees += x.fees ?? 0; n++; }
    const a = Math.max(x.openTime / NS, lo), b = Math.min(ct, hi); if (b > a) oiC += Math.abs(x.quantity) * x.avgOpenPrice * (b - a) / HOUR;
  }
  let oiF = 0; const hours = new Set<number>();
  for (const x of r.funding) { const t = x.timestamp / NS; if (t < lo || t >= hi) continue; const v = Math.abs(x.size) * x.markPrice; oiF += v; if (v > 0) hours.add(Math.floor(t / HOUR)); }
  let makerVol = 0; for (const x of r.fills) { const t = x.timestamp / NS; if (t >= lo && t < hi && r.own.has(x.maker) && !r.own.has(x.taker)) makerVol += Math.abs(x.amount * x.price); }
  return { vol, fees: Math.abs(fees), oih: Math.max(oiC, oiF), hoursOpen: hours.size, makerVol, positions: n, oiC, oiF };
}

export const xrow = (f: { vol: number; fees: number; oih: number; hoursOpen: number }, pv: number, poh: number) =>
  [1, Math.log(Math.max(f.vol, 1e-6) / pv), Math.log((f.fees + 0.01) / pv), Math.log((f.oih + 1) / poh), Math.log1p(f.hoursOpen)];
export function pointTrading(m: Model, f: Feat, pv: number, poh: number) {
  if (!(f.vol > 0)) return { mid: 0, lo: 0, hi: 0 };
  const y = xrow(f, pv, poh).reduce((s, x, i) => s + x * m.coef[i], 0); const mid = Math.exp(y) * TIERED.calib;
  return { mid, lo: mid / BAND, hi: mid * BAND };
}
export const maker = (makerVol: number) => (makerVol > 0 ? Math.exp(M.maker.a) * makerVol ** M.maker.b : 0);

/** Latest week with known platform totals (for the in-week forecast we use the previous complete week, as in mc.py). */
export const lastPlatformWeek = (m: Model) => Math.max(...Object.keys(m.platform).map(Number));

// ---------- Monte Carlo in-week forecast (port of mc.py, tuned settings) ----------
export type Rng = () => number;
export const mulberry = (seed: number): Rng => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (rng: Rng) => { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
export type DayRow = { vol: number; oih: number; fees: number; hoursOpen: number };
export function dailyRows(r: Raw, from: number, to: number): DayRow[] {
  const out: DayRow[] = []; for (let t = from; t < to; t += DAY) { const f = rangeFeatures(r, t, Math.min(t + DAY, to)); out.push({ vol: f.vol, oih: f.oih, fees: f.fees, hoursOpen: f.hoursOpen }); } return out;
}
export type McOut = { p10: number; p50: number; p90: number; samples: Float64Array; pAbove: (x: number) => number };
/**
 * observed: features so far this week; elapsedDays (0..7, fractional); pool: last 14 days before the week + observed days.
 * Remaining days are bootstrapped from the pool, scaled by a lognormal activity ramp (mu 0.5, sd 1.5), platform totals of the
 * previous week get lognormal noise; then one stored week's weight vector + one of that week's residuals is drawn.
 */
export function monteCarlo(m: Model, observed: DayRow, elapsedDays: number, pool: DayRow[], prev: { vol: number; oih: number }, opts: { N?: number; seed?: number; extraVol?: number; feeRate?: number; forced?: { vol: number; fees: number; oih: number; hoursOpen: number } } = {}): McOut {
  const N = opts.N ?? MC.N, rng = mulberry(opts.seed ?? 7); const remDays = Math.max(0, 7 - elapsedDays);
  const S = new Float64Array(N); const P = pool.length ? pool : [{ vol: 0, oih: 0, fees: 0, hoursOpen: 0 }];
  for (let i = 0; i < N; i++) {
    let v = 0, o = 0, fe = 0, h = 0; const whole = Math.floor(remDays), frac = remDays - whole;
    for (let d = 0; d < whole + (frac > 0 ? 1 : 0); d++) { const p = P[Math.floor(rng() * P.length)]; const w = d < whole ? 1 : frac; v += p.vol * w; o += p.oih * w; fe += p.fees * w; h += p.hoursOpen * w; }
    const ramp = remDays > 0 ? Math.exp(MC.ramp_mu + MC.ramp_sd * gauss(rng)) : 1;
    const extra = opts.extraVol ?? 0;
    const F = opts.forced;
    // open positions can't vanish: their close at the cutoff is always added; accrued OI-hours / hours-open are floors
    const f = { vol: observed.vol + v * ramp + extra + (F?.vol ?? 0), oih: Math.max(observed.oih + o * ramp, F?.oih ?? 0), fees: observed.fees + fe * ramp + extra * (opts.feeRate ?? 0.00035) + (F?.fees ?? 0), hoursOpen: Math.max(Math.min(168, observed.hoursOpen + h), F?.hoursOpen ?? 0) };
    if (!(f.vol > 0)) { S[i] = 0; continue; }
    const pv = prev.vol * Math.exp(SIG.pv * gauss(rng)), po = prev.oih * Math.exp(SIG.po * gauss(rng));
    // resample one past week's full weight vector, then a residual from that week's own fit
    const wk = m.weekly[Math.floor(rng() * m.weekly.length)]; const X = xrow(f, pv, po);
    // tier from the model's own point estimate; residual drawn from that tier's pool (all weeks), widened for Silver/Challenger
    const tier = tierOf(Math.exp(X.reduce((s, x, j) => s + x * m.coef[j], 0))); const pool = TIERED.residByTier[tier]?.length > 20 ? TIERED.residByTier[tier] : wk.resid;
    const e0 = pool[Math.floor(rng() * pool.length)]; const wf = TIERED.widen[tier] ?? 1; const e = TIER_MED[tier] != null ? TIER_MED[tier] + (e0 - TIER_MED[tier]) * wf : e0;
    const y = X.reduce((s, x, j) => s + x * wk.w[j], 0) + e + Math.log(TIERED.calib);
    S[i] = Math.exp(y);
  }
  const sorted = Float64Array.from(S).sort(); const q = (p: number) => sorted[Math.min(N - 1, Math.floor(p * N))];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), samples: sorted, pAbove: (x) => { let c = 0; for (const s of sorted) if (s > x) c++; return c / N; } };
}

// ---------- weekly refit (OLS on bundled rows + rows pulled in-app for new weeks) ----------
export function ols(X: number[][], y: number[]): number[] {
  const k = X[0].length; const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let r = 0; r < X.length; r++) for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += X[r][i] * X[r][j]; A[i][k] += X[r][i] * y[r]; }
  for (let i = 0; i < k; i++) { let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]];
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c]; } }
  return A.map((row, i) => row[k] / row[i]);
}
/** Per-week OLS: weights + residuals for one week's rows. */
export function refit(rows: number[][], platform: Model["platform"]): { coef: number[]; resid: number[] } {
  const X: number[][] = [], y: number[] = [];
  for (const [w, vol, fees, oih, h, a] of rows) { const p = platform[w]; if (!p || !(vol > 0) || !(a > 0)) continue; X.push(xrow({ vol, fees, oih, hoursOpen: h }, p.vol, p.oih)); y.push(Math.log(a)); }
  const coef = ols(X, y); const resid = X.map((x, i) => y[i] - x.reduce((s, v, j) => s + v * coef[j], 0));
  return { coef, resid };
}

export type Confidence = "Low" | "Medium" | "High";
export function confidenceOf(elapsedH: number, vol: number): { level: Confidence; why: string } {
  if (elapsedH < 48) return { level: "Low", why: "early in the week: most of the week's activity is still unknown" };
  if (vol > 20e6) return { level: "Low", why: "very large volume: possible cap/wash filter" };
  if (elapsedH < 120) return { level: "Medium", why: "mid-week forecast" };
  return { level: "High", why: "most of the week observed (model error still ×/÷2.6)" };
}
export const isBulkAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
export const meanWeights = (ws: WeekW[]) => ws[0].w.map((_, j) => ws.reduce((a, x) => a + x.w[j], 0) / ws.length);

/** Live scenarios from this week's realized features + currently open positions (master + subs). */
export type OpenPos = { size: number; entry: number; mark: number; fees: number; entryMs?: number | null };
export const CLOSE_FEE = 0.00035; // assumed taker fee to close at market
export function liveScenarios(obs: Feat, pos: OpenPos[], now: number, w: number) {
  const ws = weekStart(w), left = Math.max(0, (weekEnd(w) - now) / HOUR);
  let addVol = 0, addFee = 0, oiOpen = 0, oiHold = 0, oiMark = 0;
  for (const p of pos) {
    const q = Math.abs(p.size); if (!q) continue;
    const since = Math.max(ws, p.entryMs ?? ws), h = Math.max(0, (now - since) / HOUR);
    addVol += q * (p.entry + p.mark); addFee += Math.abs(p.fees) + q * p.mark * CLOSE_FEE;
    oiOpen += q * p.entry * h; oiHold += q * p.entry * (h + left); oiMark += q * p.mark * left;
  }
  const oiC = obs.oiC ?? obs.oih, oiF = obs.oiF ?? obs.oih, any = pos.some((p) => p.size !== 0);
  const closeNow: Feat = { ...obs, vol: obs.vol + addVol, fees: obs.fees + addFee, oih: Math.max(oiC + oiOpen, oiF) };
  // hold: positions stay at current size until the cutoff and are closed AT the cutoff at the projected (current) mark
  const hold: Feat = { ...obs, vol: obs.vol + addVol, fees: obs.fees + addFee, oih: Math.max(oiC + oiHold, oiF + oiMark), hoursOpen: Math.min(168, obs.hoursOpen + (any ? Math.floor(left) : 0)) };
  /** Floor for the Monte Carlo: forced close volume/fees are added on top of every sim; accrued OI-hours/hours-open are minimums. */
  const forced = { vol: addVol, fees: addFee, oih: hold.oih, hoursOpen: hold.hoursOpen };
  return { closeNow, hold, forced, openCount: pos.filter((p) => p.size !== 0).length, hoursLeft: left };
}
