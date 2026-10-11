import { Candle, ema, rsi, atr } from "./indicators";
import { pivots, structureBreaks, liquidityPools, Zone, Break } from "./smc";
import { htfZones, targetLevels, HtfZone } from "./zones";

export const SETUP_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"] as const; // rizzy 2026-10-10
export const HTF = "4h", LTF = "15m";
export type Check = { name: string; pass: boolean; detail: string };
export type Dir = "long" | "short";
export type Mode = "auto" | Dir; // auto = evaluate both sides; long/short = rizzy's Find Long / Find Short buttons
export type Alignment = "with-trend" | "counter-trend" | "neutral-trend";
export type SideResult = {
  dir: Dir; valid: boolean; alignment: Alignment; checks: Check[]; reasons: string[];
  entry?: { low: number; high: number }; entryPx?: number; stop?: number; tp1?: number; tp2?: number; rr?: number;
  confidence: number; zones: Zone[]; lastBreak?: Break; targetNote?: string;
  /** Best entry found for this side. status "ready" = valid now; "wait" = hypothetical plan at the nearest level. */
  plan?: Plan;
};
export type Candidate = { zone: HtfZone; entryPx: number; stop: number; tp1: number; tp2: number; tp1Label: string; tp2Label: string; rr: number; meetsRR: boolean; best?: boolean };
export type Plan = { status: "ready" | "wait"; level: number; levelSource: string; entry: { low: number; high: number }; entryPx: number;
  stop: number; tp1: number; tp2: number; rr: number; targetNote: string; waitFor: string[]; candidates: Candidate[] };
export type Rules = typeof RULES;
export type SetupOpts = { h1?: Candle[]; minRR?: number; rules?: Partial<Rules> };
export type SetupResult = {
  symbol: string; mode: Mode; verdict: "LONG" | "SHORT" | "NO TRADE"; counterTrend: boolean;
  bias: "bull" | "bear" | "neutral"; price: number; ltfRsi: number; ema: { fast: number; slow: number; third: number | null };
  common: Check[]; best: SideResult; other?: SideResult;
  // mirrors of `best` for chart/compat
  checks: Check[]; reasons: string[]; zones: Zone[]; score: number;
  entry?: { low: number; high: number }; stop?: number; tp1?: number; tp2?: number; rr?: number;
};
export const RULES = {
  minExtraBars: 20, freshBosBars: 24, rsiLong: [40, 65], rsiShort: [35, 60], rsiVetoHi: 75, rsiVetoLo: 25,
  minRR: 3, slAtrBuffer: 0.1, minStopAtr: 0.5, maxZeroVolShare: 0.3,
  stopZoneAtr: 0.25, zoneDistHalf: 0.04, /* 0.02 (v1.1.0) did not hold on 7 months of HL history: +9.9R vs +21.7R */ zoneMinDistAtr: 1, counterTrendPenalty: 25, useRsi: true, allowCounterTrend: true, minZoneScore: 0,
};
export type EmaCfg = { fast: number; slow: number; thirdOn: boolean; third: number };
export const DEFAULT_EMA: EmaCfg = { fast: 21, slow: 50, thirdOn: false, third: 200 }; // rizzy's usual double EMA
export function sanitizeEma(c: Partial<EmaCfg>): EmaCfg {
  const n = (v: unknown, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 2 && x <= 200 /* Bulk serves ~235 4h candles */ ? x : d; };
  let fast = n(c.fast, DEFAULT_EMA.fast), slow = n(c.slow, DEFAULT_EMA.slow);
  if (fast >= slow) [fast, slow] = fast === slow ? [DEFAULT_EMA.fast, DEFAULT_EMA.slow] : [slow, fast];
  return { fast, slow, thirdOn: !!c.thirdOn, third: n(c.third, DEFAULT_EMA.third) };
}
export const emaLabel = (c: EmaCfg) => `EMA ${c.fast}/${c.slow}${c.thirdOn ? "/" + c.third : ""}`;
const last = <T,>(a: T[]) => a[a.length - 1];

export const CONFIDENCE_PENALTY: Record<Alignment, number> = { "with-trend": 0, "neutral-trend": 10, "counter-trend": 25 };

/** Deterministic rule engine. Evaluates long and short independently (or one side in Find Long / Find Short mode).
 *  The 4h trend no longer blocks a side: it sets alignment, confidence penalty and target style. Not advice; never trades. */
/** Empirical hit rate of "limit at best zone, TP2 ≈3R" by side × 4h alignment, from 264 backtest trades on
 *  Hyperliquid BTC/ETH/SOL history Apr–Oct 2026 (backtest/results-hl-calib.txt). The checklist % has no predictive
 *  power (higher checklist scores did NOT win more), so the UI shows this instead of calling the checklist "confidence". */
export const HIST_HIT: Record<string, { n: number; win: number; avgR: number }> = {
  "long/with-trend": { n: 34, win: 0.29, avgR: 0.40 }, "long/neutral-trend": { n: 51, win: 0.29, avgR: 0.22 }, "long/counter-trend": { n: 31, win: 0.19, avgR: -0.20 },
  "short/with-trend": { n: 36, win: 0.25, avgR: 0.07 }, "short/neutral-trend": { n: 54, win: 0.22, avgR: -0.07 }, "short/counter-trend": { n: 58, win: 0.24, avgR: 0.08 },
};
export const histHit = (dir: string, alignment: string) => HIST_HIT[`${dir}/${alignment}`];
export const histLabel = (dir: string, alignment: string) => { const h = histHit(dir, alignment); return h ? `historical hit rate ~${Math.round(h.win * 100)}% (avg ${h.avgR >= 0 ? "+" : ""}${h.avgR.toFixed(2)}R, ${h.n} past trades)` : ""; };
export function evaluateSetup(symbol: string, htf: Candle[], ltf: Candle[], marketTrading = true, emaCfg: EmaCfg = DEFAULT_EMA, mode: Mode = "auto", opts: SetupOpts = {}): SetupResult {
  const R: Rules = { ...RULES, ...(opts.rules ?? {}) } as Rules;
  const minRR = opts.minRR && opts.minRR > 0 ? opts.minRR : R.minRR; const h1 = opts.h1 ?? [];
  const E = sanitizeEma(emaCfg); const minBars = Math.max(E.slow, E.thirdOn ? E.third : 0) + R.minExtraBars;
  const price = last(ltf)?.c ?? NaN;
  const common: Check[] = [];
  common.push({ name: "Market open", pass: marketTrading, detail: marketTrading ? "TRADING" : "market suspended" });
  const enough = htf.length >= minBars && ltf.length >= 60;
  common.push({ name: "Enough history", pass: enough, detail: `${htf.length} × ${HTF}, ${ltf.length} × ${LTF} candles (need ${minBars} / 60)` });
  const zeroShare = ltf.slice(-96).filter((k) => k.v === 0).length / Math.min(96, ltf.length || 1);
  common.push({ name: "Liquidity (volume)", pass: zeroShare <= R.maxZeroVolShare, detail: `${Math.round(zeroShare * 100)}% of recent ${LTF} candles had zero volume` });

  const dirs: Dir[] = mode === "auto" ? ["long", "short"] : [mode];
  const res: SetupResult = { symbol, mode, verdict: "NO TRADE", counterTrend: false, bias: "neutral", price, ltfRsi: NaN, ema: { fast: NaN, slow: NaN, third: null },
    common, best: blank(dirs[0]), checks: [], reasons: [], zones: [], score: 0 };
  if (!marketTrading || !enough) {
    const sides = dirs.map((d) => ({ ...blank(d), checks: [...common], reasons: common.filter((c) => !c.pass).map(fmtReason) }));
    return pick(res, sides);
  }

  // 4h trend context
  const hc = htf.map((k) => k.c); const hp = last(hc);
  const ef = last(ema(hc, E.fast)), es = last(ema(hc, E.slow)), et = E.thirdOn ? last(ema(hc, E.third)) : null;
  const bias = trendBias(hp, ef, es, et); res.bias = bias; res.ema = { fast: ef, slow: es, third: et };
  const trendDetail = `price ${fmt(hp)}; EMA${E.fast} ${fmt(ef)} ${ef > es ? ">" : "<"} EMA${E.slow} ${fmt(es)}${et != null ? `; EMA${E.third} ${fmt(et)}` : ""} → ${bias === "neutral" ? "neutral" : bias === "bull" ? "uptrend" : "downtrend"}`;

  // 15m context shared by both sides
  const lp = pivots(ltf, 3); const br = structureBreaks(ltf, lp, 3); const lb = last(br);
  const a = last(atr(ltf, 14));
  const r = rsi(ltf.map((k) => k.c), 14); const rv = last(r), rprev = r[r.length - 2]; res.ltfRsi = rv;
  const pools = liquidityPools(lp);

  const side = (dir: Dir): SideResult => {
    const long = dir === "long"; const want = long ? "bull" : "bear";
    const alignment: Alignment = bias === "neutral" ? "neutral-trend" : bias === want ? "with-trend" : "counter-trend";
    const checks: Check[] = [...common];
    const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
    // Trend is context, not a blocker.
    add(`${HTF} trend (${emaLabel(E)})`, true, `${trendDetail} → ${alignment.toUpperCase()} ${dir}${alignment === "counter-trend" ? ` (−${CONFIDENCE_PENALTY[alignment]}% confidence, tighter target)` : alignment === "neutral-trend" ? ` (−${CONFIDENCE_PENALTY[alignment]}% confidence)` : ""}`);
    if (!R.allowCounterTrend && alignment === "counter-trend") add("Counter-trend allowed", false, "counter-trend setups are switched off in settings");
    // Structure: the latest 15m break must be in this direction and fresh.
    const fresh = !!lb && ltf.length - 1 - lb.i <= R.freshBosBars; const ok = !!lb && lb.dir === want && fresh;
    add(`${LTF} structure break (${want})`, ok, !lb ? "no break of structure found" : `last ${lb.choch ? "CHoCH" : "BOS"} ${lb.dir} at ${fmt(lb.level)}, ${ltf.length - 1 - lb.i} bars ago${fresh ? "" : " (stale)"}${lb.dir === want ? "" : ` (need a ${want} break)`}`);
    // Entry zones come from 1h/4h swings (supply above for shorts, demand below for longs), never 15m micro levels.
    const zonesH = htfZones(h1, htf, long ? "demand" : "supply", price, R.zoneMinDistAtr).filter((z) => z.score >= R.minZoneScore);
    const a1 = h1.length > 15 ? atr(h1, 14).at(-1)! : a * 2;
    const a4 = atr(htf, 14).at(-1)!;
    const evalZone = (z: HtfZone, atPrice?: number): Candidate => {
      const zAtr = z.tf === "4h" ? a4 : a1;
      const entryPx = atPrice ?? (long ? z.top : z.bottom);            // first touch of the zone
      const stop = long ? z.bottom - R.stopZoneAtr * zAtr : z.top + R.stopZoneAtr * zAtr;  // beyond the swing/OB + ATR buffer of the zone's TF
      const risk = Math.abs(entryPx - stop);
      let tl = targetLevels(h1, htf, dir, entryPx).filter((t) => Math.abs(t.price - entryPx) >= 1 * risk);
      if (alignment === "counter-trend") { // relief trade: targets capped at the 4h slow EMA
        const cap = es; tl = tl.filter((t) => long ? t.price <= Math.max(cap, entryPx) : t.price >= Math.min(cap, entryPx));
        if (long ? es > entryPx : es < entryPx) tl.push({ price: es, label: `4h EMA${E.slow}` });
        tl.sort((x, y) => long ? x.price - y.price : y.price - x.price);
      }
      const rrOf = (t: number) => (long ? t - entryPx : entryPx - t) / risk;
      const t1 = tl[0]; const t2 = tl.find((t) => rrOf(t.price) >= minRR) ?? tl.at(-1);
      const tp1 = t1?.price ?? (long ? entryPx + risk : entryPx - risk), tp2 = t2?.price ?? tp1;
      const rr = rrOf(tp2);
      return { zone: z, entryPx, stop, tp1, tp2, tp1Label: t1?.label ?? "1R", tp2Label: t2?.label ?? "1R", rr, meetsRR: rr >= minRR };
    };
    const cands = zonesH.map((z) => evalZone(z));
    // rank: meets min R:R first, then significance score, then nearer
    // significance = timeframe/confluence/touches score, discounted by distance (a zone 4% away counts half)
    const sig = (c: Candidate) => c.zone.score / (1 + c.zone.distPct / R.zoneDistHalf);
    const ranked = [...cands].sort((x, y) => Number(y.meetsRR) - Number(x.meetsRR) || sig(y) - sig(x));
    const top3: Candidate[] = [];
    for (const c of ranked) { if (top3.length >= 3) break; if (!top3.some((t) => c.zone.bottom <= t.zone.top && c.zone.top >= t.zone.bottom)) top3.push(c); }
    if (top3[0]) top3[0].best = true;
    const shown = [...top3].sort((x, y) => x.zone.distPct - y.zone.distPct);
    const pad = 0.1 * a1;
    const inZone = zonesH.find((z) => price >= z.bottom - pad && price <= z.top + pad);
    add(`Price at 1h/4h ${long ? "demand" : "supply"} zone`, !!inZone, inZone ? `${inZone.label} ${fmt(inZone.bottom)}–${fmt(inZone.top)}`
      : top3[0] ? `best zone ${fmt(top3[0].zone.bottom)}–${fmt(top3[0].zone.top)} (${top3[0].zone.label}), ${(top3[0].zone.distPct * 100).toFixed(2)}% away` : `no unmitigated 1h/4h ${long ? "demand" : "supply"} zone`);
    // RSI, direction-aware.
    const [lo, hi] = long ? R.rsiLong : R.rsiShort; const veto = long ? rv >= R.rsiVetoHi : rv <= R.rsiVetoLo;
    const momentum = long ? rv > rprev : rv < rprev;
    add(`${LTF} RSI(14) for ${dir}`, !R.useRsi || (!veto && rv >= lo && rv <= hi && momentum), `RSI ${rv.toFixed(1)} (${rv > rprev ? "rising" : "falling"})${veto ? ` – ${long ? "overbought" : "oversold"}, veto` : ""}; ${dir} wants ${lo}–${hi} & ${long ? "rising" : "falling"}`);
    const zonesOut: Zone[] = shown.map((c) => ({ top: c.zone.top, bottom: c.zone.bottom, i: 0, kind: "OB", dir: want }));
    const out: SideResult = { dir, valid: false, alignment, checks, reasons: [], confidence: 0, zones: zonesOut, lastBreak: lb };
    const note = `SL beyond zone + 0.25×ATR(${"zone TF"}); TP1 = nearest opposite 1h/4h swing, TP2 = first opposite swing/liquidity ≥ ${minRR}R${alignment === "counter-trend" ? `, capped at 4h EMA${E.slow} (counter-trend)` : ""}; R:R judged on TP2`;
    if (inZone) {
      const c = evalZone(inZone, price);
      add(`Reward : risk ≥ ${minRR}`, c.meetsRR, `entry ${fmt(price)}, stop ${fmt(c.stop)}, TP2 ${fmt(c.tp2)} (${c.tp2Label}) → ${c.rr.toFixed(2)}R`);
      Object.assign(out, { entry: { low: inZone.bottom, high: inZone.top }, entryPx: price, stop: c.stop, tp1: c.tp1, tp2: c.tp2, rr: c.rr, targetNote: note });
      if (ok && c.meetsRR) out.plan = { status: "ready", level: price, levelSource: inZone.label, entry: { low: inZone.bottom, high: inZone.top }, entryPx: price, stop: c.stop, tp1: c.tp1, tp2: c.tp2, rr: c.rr, targetNote: note, waitFor: [], candidates: shown };
    } else add(`Reward : risk ≥ ${minRR}`, false, "price not at a 1h/4h zone yet (see candidate zones)");
    if (!out.plan && top3[0]) {
      const b = top3[0]; const waitFor: string[] = [];
      if (!(price >= b.zone.bottom - pad && price <= b.zone.top + pad)) waitFor.push(`price to reach ${fmt(b.entryPx)} (${b.zone.label})`);
      waitFor.push(`a fresh ${LTF} ${want} break of structure inside the zone`);
      const rc = checks.find((c) => c.name.startsWith(`${LTF} RSI`)); if (rc && !rc.pass) waitFor.push(`RSI ${long ? "40–65 and rising" : "35–60 and falling"} (now ${rv.toFixed(1)})`);
      if (!b.meetsRR) waitFor.push(`no zone reaches ${minRR}R yet (best ${b.rr.toFixed(2)}R)`);
      out.plan = { status: "wait", level: b.entryPx, levelSource: b.zone.label, entry: { low: b.zone.bottom, high: b.zone.top }, entryPx: b.entryPx, stop: b.stop, tp1: b.tp1, tp2: b.tp2, rr: b.rr, targetNote: note, waitFor, candidates: shown };
    }
    const fails = checks.filter((c) => !c.pass);
    out.valid = fails.length === 0; out.reasons = fails.map(fmtReason);
    out.confidence = Math.max(0, Math.round((checks.filter((c) => c.pass).length / checks.length) * 100) - (alignment === "counter-trend" ? R.counterTrendPenalty : CONFIDENCE_PENALTY[alignment]));
    return out;
  };
  return pick(res, dirs.map(side));
}
const fmtReason = (c: Check) => `${c.name}: ${c.detail}`;
const blank = (dir: Dir): SideResult => ({ dir, valid: false, alignment: "neutral-trend", checks: [], reasons: [], confidence: 0, zones: [] });
/** Best = a valid side (with-trend preferred, then confidence). If none valid: NO TRADE, show the closer side first. */
export function pick(res: SetupResult, sides: SideResult[]): SetupResult {
  const rank = (s: SideResult) => (s.valid ? 1000 : 0) + (s.alignment === "with-trend" ? 100 : s.alignment === "neutral-trend" ? 50 : 0) * (s.valid ? 1 : 0) + s.confidence;
  const sorted = [...sides].sort((x, y) => rank(y) - rank(x));
  const best = sorted[0]; res.best = best; res.other = sorted[1];
  res.verdict = best.valid ? (best.dir === "long" ? "LONG" : "SHORT") : "NO TRADE";
  res.counterTrend = best.valid && best.alignment === "counter-trend";
  Object.assign(res, { checks: best.checks, reasons: best.reasons, zones: best.zones, score: best.confidence, entry: best.entry, stop: best.stop, tp1: best.tp1, tp2: best.tp2, rr: best.rr });
  return res;
}
const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n.toPrecision(5));

/** bull: fast > slow and price above both (and above third if on). bear: mirror. Otherwise neutral. */
export function trendBias(price: number, fast: number, slow: number, third: number | null): "bull" | "bear" | "neutral" {
  if ([price, fast, slow].some((x) => !Number.isFinite(x))) return "neutral";
  if (fast > slow && price > fast && price > slow && (third == null || price > third)) return "bull";
  if (fast < slow && price < fast && price < slow && (third == null || price < third)) return "bear";
  return "neutral";
}
