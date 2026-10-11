/** v1 strategy catalogue (spec §1–2). Pure functions over closed candles; last element = most recent bar. */
import type { Candle } from "../ta/indicators";
import { ema, rsi, atr, macd, bollinger, adx, supertrend, sessionVwap, anchoredVwap, highest, lowest } from "./ind";
import { pivots, structureBreaks, orderBlock, fvgs } from "../ta/smc";
import type { Ctx, Dir, Signal, Strategy, StrategyId, Family, Level } from "./types";

const FRESH = 12; // bars a trigger stays "fresh"
const neutral = (id: StrategyId, family: Family, reasons: string[], levels: Level[] = []): Signal => ({ id, family, direction: "neutral", strength: 0, entry: null, sl: null, tp: [], invalidation: "–", freshnessBars: 0, reasons, levels });
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const last = <T,>(a: T[]) => a[a.length - 1];
/** R-multiple TPs from an entry zone and a stop. */
const rTargets = (dir: Dir, entry: number, sl: number, rs = [1.5, 3]) => rs.map((r) => (dir === "long" ? entry + r * (entry - sl) : entry - r * (sl - entry)));
const mid = (z: { lo: number; hi: number }) => (z.lo + z.hi) / 2;
const sig = (id: StrategyId, family: Family, dir: Dir, strength: number, entry: { lo: number; hi: number }, sl: number, tp: number[], invalidation: string, fresh: number, reasons: string[], levels: Level[] = []): Signal =>
  ({ id, family, direction: dir, strength: clamp01(strength), entry: { lo: Math.min(entry.lo, entry.hi), hi: Math.max(entry.lo, entry.hi) }, sl, tp, invalidation, freshnessBars: fresh, reasons, levels });
const lastPivot = (c: Candle[], kind: "high" | "low", n = 5) => [...pivots(c, n)].reverse().find((p) => p.kind === kind);

// 1 SMC: BOS/CHoCH → retrace into unmitigated OB/FVG in discount/premium
const smc: Strategy = { id: "smc", name: "SMC", family: "structure", short: "BOS/CHoCH → OB/FVG retrace", evaluate(c) {
  const n = c.length, a = last(atr(c)), px = c[n - 1].c; const piv = pivots(c, 5); const brk = last(structureBreaks(c, piv, 5));
  if (!brk || !a) return neutral("smc", "structure", ["no confirmed structure break"]);
  const dir: Dir = brk.dir === "bull" ? "long" : "short"; const age = n - 1 - brk.i;
  const zone = orderBlock(c, brk) ?? fvgs(c, brk.pivot.i).filter((z) => z.dir === brk.dir).pop() ?? null;
  const hi = highest(c, n, 60), lo = lowest(c, n, 60), eq = (hi + lo) / 2;
  const levels: Level[] = zone ? [{ price: (zone.top + zone.bottom) / 2, kind: "static", label: `SMC ${zone.kind}`, side: dir }] : [];
  if (!zone) return neutral("smc", "structure", [`${brk.choch ? "CHoCH" : "BOS"} ${brk.dir} ${age} bars ago, but no OB/FVG to retrace into`]);
  const mitigated = c.slice(zone.i + 2).some((k) => (dir === "long" ? k.c < zone.bottom : k.c > zone.top));
  if (mitigated) return neutral("smc", "structure", [`${zone.kind} closed through (invalidated)`], levels);
  const inDisc = dir === "long" ? (zone.top + zone.bottom) / 2 < eq : (zone.top + zone.bottom) / 2 > eq;
  const sl = dir === "long" ? zone.bottom - 0.1 * a : zone.top + 0.1 * a;
  const opp = piv.filter((p) => (dir === "long" ? p.kind === "high" && p.price > px : p.kind === "low" && p.price < px)).map((p) => p.price).sort((x, y) => (dir === "long" ? x - y : y - x));
  const e = { lo: zone.bottom, hi: zone.top }; const tps = opp.length ? opp.slice(0, 2) : rTargets(dir, mid(e), sl);
  return sig("smc", "structure", dir, (brk.choch ? 0.8 : 0.6) * (inDisc ? 1 : 0.6) * (age < 40 ? 1 : 0.6), e, sl, tps,
    `close ${dir === "long" ? "below" : "above"} ${(dir === "long" ? zone.bottom : zone.top).toFixed(2)}`, age,
    [`${brk.choch ? "CHoCH" : "BOS"} ${brk.dir} ${age} bars ago`, `entry = unmitigated ${zone.kind}`, inDisc ? (dir === "long" ? "in discount" : "in premium") : "not in discount/premium (weaker)"], levels);
} };

// 2 ICT: killzone + liquidity sweep + MSS with displacement → OTE 0.62–0.79
const nyHour = (t: number) => +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(t) % 24;
export const killzoneOf = (t: number) => { const h = nyHour(t); return h >= 20 ? "Asia" : h >= 2 && h < 5 ? "London" : h >= 7 && h < 10 ? "New York" : h >= 10 && h < 12 ? "London close" : null; };
const ict: Strategy = { id: "ict", name: "ICT", family: "structure", short: "sweep → MSS → FVG/OTE, killzones", evaluate(c, ctx) {
  const n = c.length, A = atr(c), a = A[n - 1]; if (!a || n < 60) return neutral("ict", "structure", ["not enough bars"]);
  for (let s = n - 2; s >= n - 30 && s > 25; s--) { // look for the most recent sweep
    const prevLo = lowest(c, s, 20), prevHi = highest(c, s, 20);
    const bull = c[s].l < prevLo && c[s].c > prevLo, bear = c[s].h > prevHi && c[s].c < prevHi;
    if (!bull && !bear) continue;
    const dir: Dir = bull ? "long" : "short";
    const lh = bull ? Math.max(...c.slice(Math.max(0, s - 10), s).map((k) => k.h)) : Math.min(...c.slice(Math.max(0, s - 10), s).map((k) => k.l));
    for (let m = s + 1; m < n; m++) {
      const disp = Math.abs(c[m].c - c[m].o) >= 1.5 * A[m];
      if ((bull && c[m].c > lh) || (bear && c[m].c < lh)) {
        if (!disp) break;
        const ext = bull ? Math.max(...c.slice(s, n).map((k) => k.h)) : Math.min(...c.slice(s, n).map((k) => k.l)); const sw = bull ? c[s].l : c[s].h; const rng = ext - sw;
        const ote = { lo: ext - 0.79 * rng, hi: ext - 0.62 * rng }; const sl = bull ? sw - 0.1 * a : sw + 0.1 * a;
        if ((bull && c[n - 1].l < sw) || (bear && c[n - 1].h > sw)) return neutral("ict", "structure", ["sweep wick broken (invalidated)"]);
        const kz = killzoneOf(c[s].t); const tps = [ext, bull ? ext + 0.27 * rng : ext - 0.27 * rng, bull ? ext + 0.62 * rng : ext - 0.62 * rng];
        return sig("ict", "structure", dir, (kz ? 0.85 : 0.55) * (m - s <= 8 ? 1 : 0.7), ote, sl, tps, `${bull ? "below" : "above"} sweep wick ${sw.toFixed(2)}`, n - 1 - s,
          [`${bull ? "sell-side" : "buy-side"} liquidity swept ${n - 1 - s} bars ago`, `MSS with displacement (≥1.5 ATR body)`, `entry = OTE 0.62–0.79`, kz ? `inside ${kz} killzone` : "outside killzones (weighted down)"],
          [{ price: (ote.lo + ote.hi) / 2, kind: "static", label: "ICT OTE 0.705", side: dir }]);
      }
    }
  }
  return neutral("ict", "structure", ["no sweep + MSS in the last 30 bars", killzoneOf(ctx.now) ? `now: ${killzoneOf(ctx.now)} killzone` : "now: outside killzones"]);
} };

// 3 EMA ribbon 8/13/21/34/55, pullback to EMA21
const emaRibbon: Strategy = { id: "ema", name: "EMA ribbon", family: "trend", short: "8/13/21/34/55 stacked, pullback to 21", evaluate(c) {
  const x = c.map((k) => k.c), n = c.length, a = last(atr(c)); const L = [8, 13, 21, 34, 55].map((p) => last(ema(x, p)));
  if (L.some(isNaN) || !a) return neutral("ema", "trend", ["not enough bars"]);
  const up = L.every((v, i) => i === 0 || L[i - 1] > v), dn = L.every((v, i) => i === 0 || L[i - 1] < v);
  const levels: Level[] = [{ price: L[2], kind: "static", label: "EMA21" }, { price: L[4], kind: "static", label: "EMA55" }];
  if (!up && !dn) { const bull = L.filter((v, i) => i > 0 && L[i - 1] > v).length; return neutral("ema", "trend", [`ribbon not stacked (${bull}/4 pairs bullish)`], levels); }
  const dir: Dir = up ? "long" : "short"; const e = { lo: L[2] - 0.25 * a, hi: L[2] + 0.25 * a }; const sl = up ? Math.min(L[4] - 0.5 * a, L[2] - 1.5 * a) : Math.max(L[4] + 0.5 * a, L[2] + 1.5 * a);
  const dist = Math.abs(x[n - 1] - L[2]) / a;
  let fresh = 0; for (let i = n - 1; i > n - 60; i--) { const P = [8, 13, 21, 34, 55].map((p) => ema(x.slice(0, i), p).pop()!); if (!P.every((v, j) => j === 0 || (up ? P[j - 1] > v : P[j - 1] < v))) break; fresh++; }
  return sig("ema", "trend", dir, 0.75 * (dist < 1.5 ? 1 : 0.6), e, sl, rTargets(dir, mid(e), sl, [2, 3]), `ribbon un-stacks`, fresh, [`ribbon fully stacked ${up ? "bullish" : "bearish"} (${fresh}+ bars)`, `entry = pullback to EMA21 ±0.25 ATR`, `price ${dist.toFixed(1)} ATR from EMA21`], levels);
} };

// 4 MACD 12/26/9
const macdS: Strategy = { id: "macd", name: "MACD", family: "trend", short: "12/26/9 signal cross + histogram", evaluate(c) {
  const x = c.map((k) => k.c), n = c.length, a = last(atr(c)); const m = macd(x); if (isNaN(m.hist[n - 1]) || !a) return neutral("macd", "trend", ["not enough bars"]);
  let k = -1; for (let i = n - 1; i > n - 40 && i > 0; i--) if (Math.sign(m.hist[i]) !== Math.sign(m.hist[i - 1])) { k = i; break; }
  const dir: Dir = m.hist[n - 1] > 0 ? "long" : "short"; const rising = dir === "long" ? m.hist[n - 1] > m.hist[n - 2] : m.hist[n - 1] < m.hist[n - 2];
  const age = k < 0 ? 40 : n - 1 - k; const below0 = dir === "long" ? m.macd[n - 1] < 0 : m.macd[n - 1] > 0;
  const sw = dir === "long" ? lastPivot(c, "low")?.price ?? x[n - 1] - 1.5 * a : lastPivot(c, "high")?.price ?? x[n - 1] + 1.5 * a;
  const sl = dir === "long" ? Math.min(sw, x[n - 1] - a) : Math.max(sw, x[n - 1] + a); const e = { lo: x[n - 1] - 0.25 * a, hi: x[n - 1] + 0.25 * a };
  return sig("macd", "trend", dir, (age <= FRESH ? 0.7 : 0.4) * (rising ? 1 : 0.6) * (below0 ? 1.15 : 1), e, sl, rTargets(dir, mid(e), sl, [2, 3]), "opposite signal cross", age,
    [`MACD ${dir === "long" ? "above" : "below"} signal${k >= 0 ? ` (crossed ${age} bars ago)` : ""}`, rising ? "histogram expanding" : "histogram fading", below0 ? `cross ${dir === "long" ? "below" : "above"} zero (stronger)` : ""].filter(Boolean));
} };

// 5 RSI 14: 30/70 crosses + regular divergence on pivots
const rsiS: Strategy = { id: "rsi", name: "RSI", family: "momentum", short: "30/70 cross + divergence", evaluate(c) {
  const x = c.map((k) => k.c), n = c.length, r = rsi(x, 14), a = last(atr(c)); if (isNaN(r[n - 1]) || !a) return neutral("rsi", "momentum", ["not enough bars"]);
  let dir: Dir = "neutral", age = 0, why = "";
  for (let i = n - 1; i > n - 1 - FRESH && i > 0; i--) { if (r[i - 1] < 30 && r[i] >= 30) { dir = "long"; age = n - 1 - i; why = `RSI crossed up through 30 ${age} bars ago`; break; } if (r[i - 1] > 70 && r[i] <= 70) { dir = "short"; age = n - 1 - i; why = `RSI crossed down through 70 ${age} bars ago`; break; } }
  const P = pivots(c, 5); const lows = P.filter((p) => p.kind === "low").slice(-2), highs = P.filter((p) => p.kind === "high").slice(-2); let div = "";
  if (lows.length === 2 && lows[1].price < lows[0].price && r[lows[1].i] > r[lows[0].i] && n - 1 - lows[1].i <= 20) { if (dir !== "short") { dir = "long"; age = n - 1 - lows[1].i; } div = "bullish divergence (lower low, higher RSI low)"; }
  if (highs.length === 2 && highs[1].price > highs[0].price && r[highs[1].i] < r[highs[0].i] && n - 1 - highs[1].i <= 20) { if (dir !== "long") { dir = "short"; age = n - 1 - highs[1].i; } div = "bearish divergence (higher high, lower RSI high)"; }
  if (dir === "neutral") return neutral("rsi", "momentum", [`RSI ${r[n - 1].toFixed(0)}: no 30/70 cross or divergence`]);
  const pv = dir === "long" ? (lows[1]?.price ?? x[n - 1] - 1.5 * a) : (highs[1]?.price ?? x[n - 1] + 1.5 * a); const sl = dir === "long" ? Math.min(pv, x[n - 1] - a) - 0.1 * a : Math.max(pv, x[n - 1] + a) + 0.1 * a;
  const e = { lo: x[n - 1] - 0.25 * a, hi: x[n - 1] + 0.25 * a };
  return sig("rsi", "momentum", dir, (why && div ? 0.85 : 0.6), e, sl, rTargets(dir, mid(e), sl), `new price ${dir === "long" ? "low" : "high"} with new RSI ${dir === "long" ? "low" : "high"}`, age, [why, div, `RSI now ${r[n - 1].toFixed(0)}`].filter(Boolean));
} };

// 6 Bollinger 20/2σ: squeeze breakout (volatility) or mean reversion (momentum), auto by regime
const bb: Strategy = { id: "bb", name: "Bollinger", family: "volatility", short: "squeeze breakout / mean reversion (by ADX)", evaluate(c) {
  const x = c.map((k) => k.c), n = c.length, b = bollinger(x), A = adx(c), a = last(atr(c)); if (isNaN(b.mid[n - 1]) || !a) return neutral("bb", "volatility", ["not enough bars"]);
  const levels: Level[] = [{ price: b.mid[n - 1], kind: "static", label: "BB mid" }];
  // (a) squeeze breakout within FRESH bars
  for (let i = n - 1; i > n - 1 - FRESH; i--) {
    const win = b.bw.slice(Math.max(0, i - 120), i).filter((v) => !isNaN(v)); const sq = win.length > 60 && Math.min(...win.slice(-10)) <= Math.min(...win) * 1.001;
    const avgV = c.slice(Math.max(0, i - 20), i).reduce((s, k) => s + k.v, 0) / 20;
    if (sq && c[i].v > 1.5 * avgV && (c[i].c > b.up[i] || c[i].c < b.lo[i])) {
      const dir: Dir = c[i].c > b.up[i] ? "long" : "short"; const w = b.up[i] - b.lo[i]; const e = { lo: x[n - 1] - 0.25 * a, hi: x[n - 1] + 0.25 * a };
      return sig("bb", "volatility", dir, 0.75, e, b.mid[n - 1], [dir === "long" ? c[i].c + w : c[i].c - w, dir === "long" ? c[i].c + 2 * w : c[i].c - 2 * w], "close back across the middle band", n - 1 - i, [`squeeze (BBW at 120-bar low) then close ${dir === "long" ? "above upper" : "below lower"} band`, "volume > 1.5× average"], levels);
    }
  }
  // (b) mean reversion in a range
  const ad = A[n - 1];
  for (let i = n - 1; i > n - 1 - 6; i--) {
    if (ad < 20 && c[i - 1].c < b.lo[i - 1] && c[i].c > b.lo[i]) { const sl = Math.min(c[i - 1].l, c[i].l) - 0.5 * a; const e = { lo: x[n - 1] - 0.25 * a, hi: x[n - 1] + 0.25 * a }; return { ...sig("bb", "momentum", "long", 0.6, e, sl, [b.mid[n - 1], b.up[n - 1]], "ADX rises above 25", n - 1 - i, [`closed below lower band then back inside`, `ADX ${ad.toFixed(0)} < 20 (range)`, "mode: mean reversion"], levels) }; }
    if (ad < 20 && c[i - 1].c > b.up[i - 1] && c[i].c < b.up[i]) { const sl = Math.max(c[i - 1].h, c[i].h) + 0.5 * a; const e = { lo: x[n - 1] - 0.25 * a, hi: x[n - 1] + 0.25 * a }; return { ...sig("bb", "momentum", "short", 0.6, e, sl, [b.mid[n - 1], b.lo[n - 1]], "ADX rises above 25", n - 1 - i, [`closed above upper band then back inside`, `ADX ${ad.toFixed(0)} < 20 (range)`, "mode: mean reversion"], levels) }; }
  }
  return neutral(ad < 20 ? "bb" : "bb", ad < 20 ? "momentum" : "volatility", [`no squeeze breakout or band re-entry; ADX ${isNaN(ad) ? "–" : ad.toFixed(0)}`], levels);
} };

// 7 Supertrend 10/3
const st: Strategy = { id: "supertrend", name: "Supertrend", family: "trend", short: "ATR 10 × 3 flip", evaluate(c) {
  const s = supertrend(c, 10, 3), n = c.length, a = last(atr(c)), x = c[n - 1].c; if (!s.dir[n - 1] || !a) return neutral("supertrend", "trend", ["not enough bars"]);
  const dir: Dir = s.dir[n - 1] > 0 ? "long" : "short"; let age = 0; for (let i = n - 1; i > 0 && s.dir[i] === s.dir[i - 1]; i--) age++;
  const e = { lo: x - 0.25 * a, hi: x + 0.25 * a }; const sl = s.line[n - 1];
  return sig("supertrend", "trend", dir, age <= FRESH ? 0.8 : 0.5, e, sl, rTargets(dir, mid(e), sl, [2, 3]), `flip ${dir === "long" ? "bearish" : "bullish"} (close ${dir === "long" ? "below" : "above"} ${sl.toFixed(2)})`, age, [`Supertrend ${dir === "long" ? "bullish" : "bearish"} for ${age} bars`, `line at ${sl.toFixed(2)}`], [{ price: sl, kind: "static", label: "Supertrend" }]);
} };

// 8 VWAP: session (00:00 UTC) + σ bands; auto-anchored VWAP from the last major swing
const vwapS: Strategy = { id: "vwap", name: "VWAP", family: "volume", short: "session VWAP reclaim + anchored VWAP", evaluate(c) {
  const { vwap, sd } = sessionVwap(c), n = c.length, x = c.map((k) => k.c), a = last(atr(c)); if (!a) return neutral("vwap", "volume", ["not enough bars"]);
  const piv = pivots(c, 10); const anchor = piv.length ? piv[piv.length - 1].i : n - 100; const av = anchoredVwap(c, anchor);
  const V = vwap[n - 1], S = sd[n - 1] || a; const levels: Level[] = [{ price: V, kind: "static", label: "VWAP" }, { price: av, kind: "static", label: "anchored VWAP" }];
  const above2 = x[n - 1] > vwap[n - 1] && x[n - 2] > vwap[n - 2], below2 = x[n - 1] < vwap[n - 1] && x[n - 2] < vwap[n - 2];
  let k = -1; for (let i = n - 1; i > n - FRESH; i--) if (Math.sign(x[i] - vwap[i]) !== Math.sign(x[i - 1] - vwap[i - 1])) { k = i; break; }
  if (!(above2 || below2) || k < 0) return neutral("vwap", "volume", [`no fresh VWAP reclaim/loss held for 2 closes (price ${x[n - 1] > V ? "above" : "below"} VWAP)`], levels);
  const dir: Dir = above2 ? "long" : "short"; const e = { lo: Math.min(V, x[n - 1]), hi: Math.max(V, x[n - 1]) };
  const sl = dir === "long" ? V - S : V + S; const tps = dir === "long" ? [V + S, V + 2 * S] : [V - S, V - 2 * S];
  const agree = dir === "long" ? x[n - 1] > av : x[n - 1] < av;
  return sig("vwap", "volume", dir, agree ? 0.75 : 0.5, e, sl, tps, `close back ${dir === "long" ? "below" : "above"} VWAP`, n - 1 - k, [`${dir === "long" ? "reclaimed" : "lost"} session VWAP ${n - 1 - k} bars ago, held 2 closes`, agree ? "anchored VWAP agrees" : "anchored VWAP disagrees (weaker)"], levels);
} };

// 9 Donchian 20/10 (Turtle S1)
const don: Strategy = { id: "donchian", name: "Donchian", family: "trend", short: "20-bar breakout, 10-bar exit", evaluate(c) {
  const n = c.length, A = atr(c, 20), a = A[n - 1]; if (!a || n < 30) return neutral("donchian", "trend", ["not enough bars"]);
  for (let i = n - 1; i > n - 1 - FRESH; i--) {
    const H = highest(c, i, 20), L = lowest(c, i, 20);
    if (c[i].c > H || c[i].c < L) {
      const dir: Dir = c[i].c > H ? "long" : "short"; const failed = dir === "long" ? c[n - 1].c < H : c[n - 1].c > L;
      if (failed) return neutral("donchian", "trend", [`20-bar breakout ${n - 1 - i} bars ago failed (back inside)`]);
      const x = c[n - 1].c, e = { lo: x - 0.25 * a, hi: x + 0.25 * a }, sl = dir === "long" ? x - 2 * a : x + 2 * a; const exit = dir === "long" ? lowest(c, n, 10) : highest(c, n, 10);
      return sig("donchian", "trend", dir, 0.7, e, sl, rTargets(dir, mid(e), sl, [1.5, 3]), `exit on 10-bar ${dir === "long" ? "low" : "high"} ${exit.toFixed(2)}`, n - 1 - i, [`close ${dir === "long" ? "above 20-bar high" : "below 20-bar low"} ${n - 1 - i} bars ago`], [{ price: dir === "long" ? H : L, kind: "static", label: "Donchian edge" }]);
    }
  }
  return neutral("donchian", "trend", ["inside the 20-bar channel"]);
} };

// 10 Funding/OI + liquidation heatmap (perp-native, current values + rolling browser buffer)
const funding: Strategy = { id: "funding", name: "Funding / OI", family: "positioning", short: "crowding + liq clusters", evaluate(c, ctx) {
  const n = c.length, a = last(atr(c)), x = c[n - 1].c; const f = ctx.funding, oi = ctx.oi?.changePct ?? null;
  if (!f || !a) return neutral("funding", "positioning", ["no funding/OI data yet"]);
  const f8 = f.rate * 8 * 100; // % per 8h (Bulk rate is hourly)
  const pchg = (x - c[Math.max(0, n - 16)].c) / x * 100; const pct = f.pct;
  const liq = (ctx.liq ?? []).filter((b) => b.long + b.short > 0); const levels: Level[] = liq.sort((p, q) => q.long + q.short - (p.long + p.short)).slice(0, 4).map((b) => ({ price: b.price, kind: "static" as const, label: "liq cluster" }));
  let dir: Dir = "neutral", strength = 0; const why: string[] = [`funding ${f8.toFixed(4)}%/8h${pct != null ? ` (${Math.round(pct * 100)}th pct of buffer)` : ""}`, oi != null ? `OI ${oi >= 0 ? "+" : ""}${oi.toFixed(1)}% (buffer)` : "OI change: building buffer"];
  const lowF = pct != null ? pct <= 0.1 : f8 < -0.01, highF = pct != null ? pct >= 0.9 : f8 > 0.03;
  if (lowF && (oi ?? 0) > 0 && pchg <= 0.3) { dir = "long"; strength = 0.7; why.push("crowded shorts + OI rising while price flat/down → squeeze risk up"); }
  else if (highF && (oi ?? 0) > 0 && pchg >= -0.3) { dir = "short"; strength = 0.7; why.push("crowded longs + OI rising with stalling price → long-squeeze risk"); }
  else if (oi != null && oi > 1 && Math.abs(pchg) > 0.5) { dir = pchg > 0 ? "long" : "short"; strength = 0.4; why.push(`price ${pchg > 0 ? "↑" : "↓"} with OI ↑ (trend confirmation)`); }
  if (dir === "neutral") return neutral("funding", "positioning", [...why, "no crowding signal"], levels);
  const swing = dir === "long" ? lastPivot(c, "low")?.price ?? x - 1.5 * a : lastPivot(c, "high")?.price ?? x + 1.5 * a; const sl = dir === "long" ? Math.min(swing, x - a) : Math.max(swing, x + a);
  const tgt = liq.filter((b) => (dir === "long" ? b.price > x && b.short > 0 : b.price < x && b.long > 0)).sort((p, q) => Math.abs(p.price - x) - Math.abs(q.price - x)).slice(0, 2).map((b) => b.price);
  const e = { lo: x - 0.25 * a, hi: x + 0.25 * a };
  return sig("funding", "positioning", dir, strength, e, sl, tgt.length ? tgt : rTargets(dir, x, sl), "funding normalises", 0, [...why, tgt.length ? "TP at nearest estimated liq cluster" : "TP by R (no liq cluster)"], levels);
} };

// 11 rizzy's classic: Double EMA (default 21/50, configurable; optional third) + RSI filter (long 40–65, short 35–60, veto ≥75 / ≤25)
export const demaCfg = (ctx: Ctx) => ctx.emaCfg ?? { fast: 21, slow: 50, thirdOn: false, third: 200 };
const dema: Strategy = { id: "dema", name: "Double EMA + RSI", family: "trend", short: "EMA 21/50 trend + RSI filter (classic)", evaluate(c, ctx) {
  const cfg = demaCfg(ctx), x = c.map((k) => k.c), n = c.length, a = last(atr(c)); const F = ema(x, cfg.fast), Sl = ema(x, cfg.slow), T = cfg.thirdOn ? last(ema(x, cfg.third)) : null;
  const f = F[n - 1], s = Sl[n - 1], px = x[n - 1], r = last(rsi(x, 14)); const nm = `EMA ${cfg.fast}/${cfg.slow}${cfg.thirdOn ? "/" + cfg.third : ""}`;
  const levels: Level[] = [{ price: f, kind: "static", label: `EMA${cfg.fast}` }, { price: s, kind: "static", label: `EMA${cfg.slow}` }];
  if ([f, s, r, a].some((v) => !Number.isFinite(v))) return neutral("dema", "trend", ["not enough bars for the EMAs"]);
  const bull = f > s && px > f && px > s && (T == null || px > T), bear = f < s && px < f && px < s && (T == null || px < T);
  if (!bull && !bear) return neutral("dema", "trend", [`${nm}: no clean trend (fast ${f > s ? ">" : "<"} slow, price between/through EMAs)`, `RSI ${r.toFixed(0)}`], levels);
  const dir: Dir = bull ? "long" : "short"; const [lo, hi] = bull ? [40, 65] : [35, 60]; const veto = bull ? r >= 75 : r <= 25;
  if (veto || r < lo || r > hi) return neutral("dema", "trend", [`${nm} ${bull ? "uptrend" : "downtrend"}`, `RSI filter fails: ${r.toFixed(0)} not in ${lo}–${hi}${veto ? " (veto)" : ""}`], levels);
  let age = 0; for (let i = n - 1; i > 0 && (bull ? F[i] > Sl[i] : F[i] < Sl[i]); i--) age++;
  const e = { lo: f - 0.25 * a, hi: f + 0.25 * a }; const sl = bull ? Math.min(s - 0.5 * a, f - a) : Math.max(s + 0.5 * a, f + a);
  return sig("dema", "trend", dir, age < 48 ? 0.75 : 0.6, e, sl, rTargets(dir, mid(e), sl, [2, 3]), `close back through EMA${cfg.slow}`, age, [`${nm} ${bull ? "uptrend" : "downtrend"}: fast ${bull ? "above" : "below"} slow, price ${bull ? "above" : "below"} both (${age} bars)`, `RSI ${r.toFixed(0)} inside ${lo}–${hi}`, `entry = pullback to EMA${cfg.fast}`], levels);
} };

export const STRATEGIES: Strategy[] = [smc, ict, emaRibbon, macdS, rsiS, bb, st, vwapS, don, funding, dema];
export const byId = Object.fromEntries(STRATEGIES.map((s) => [s.id, s])) as Record<StrategyId, Strategy>;
export const PRESETS: Record<string, StrategyId[]> = {
  "All v1": STRATEGIES.map((s) => s.id).filter((id) => id !== "dema"), "Double EMA + RSI (classic)": ["dema"], "Trend follower": ["ema", "macd", "supertrend", "donchian", "vwap"], "SMC / ICT": ["smc", "ict", "vwap", "funding"], "Mean reversion": ["rsi", "bb", "vwap", "funding"],
};
