/** Side-specific planning for Find Long / Find Short: per strategy, its long (or short) zone/trigger — live if it fires now,
 *  otherwise the level where it would trigger and what still needs to happen. Then a side consensus with confluence-clustered
 *  entry, SL, TP1/TP2 and R:R, and a "wait for price at X" plan when there's no clean entry now. Agreement ≠ probability. */
import type { Candle } from "../ta/indicators";
import { ema, rsi, atr, macd, bollinger, adx, supertrend, sessionVwap, highest, lowest } from "./ind";
import { pivots, structureBreaks, orderBlock, fvgs } from "../ta/smc";
import { htfZones, targetLevels } from "../ta/zones";
import { byId, demaCfg } from "./catalog";
import { cluster, decay, correlationGroups, dirSeries, type Cluster } from "./consensus";
import type { Ctx, Signal, StrategyId, Family } from "./types";

export type Side = "long" | "short";
export type Alt = { zone: { lo: number; hi: number }; sl: number; note: string };
export type SidePlan = { id: StrategyId; family: Family; active: boolean; signal: Signal; zone: { lo: number; hi: number } | null; sl: number | null; tps: number[]; waitFor: string[]; note: string; alts: Alt[] };
const last = <T,>(a: T[]) => a[a.length - 1];
const z = (p: number, a: number, k = 0.25) => ({ lo: p - k * a, hi: p + k * a });

/** Where would this strategy take a `side` trade, and what is missing? (Only used when it isn't already firing that side.) */
function pending(id: StrategyId, c: Candle[], ctx: Ctx, side: Side, a: number): Omit<SidePlan, "id" | "family" | "active" | "signal" | "alts"> {
  const L = side === "long", n = c.length, x = c.map((k) => k.c), px = x[n - 1]; const P = pivots(c, 5);
  const swing = (kind: "high" | "low", below: boolean) => [...P].reverse().find((p) => p.kind === kind && (below ? p.price < px : p.price > px))?.price;
  const sup = swing("low", true) ?? lowest(c, n, 40), res = swing("high", false) ?? highest(c, n, 40);
  switch (id) {
    case "smc": { const brk = last(structureBreaks(c, P, 5)); const want = L ? "bull" : "bear";
      const zz = fvgs(c, Math.max(0, n - 120)).filter((f) => f.dir === want && (L ? f.top < px : f.bottom > px)).pop() ?? (brk && brk.dir === want ? orderBlock(c, brk) : null);
      const zone = zz ? { lo: zz.bottom, hi: zz.top } : z(L ? sup : res, a);
      return { zone, sl: L ? zone.lo - 0.1 * a - 0.5 * a : zone.hi + 0.6 * a, tps: [L ? res : sup], waitFor: [brk?.dir !== want ? `${L ? "bullish" : "bearish"} BOS/CHoCH (close ${L ? "above" : "below"} ${(L ? res : sup).toFixed(2)})` : "", `retrace into ${zz ? "unmitigated " + zz.kind : "swing " + (L ? "low" : "high")} ${L ? "in discount" : "in premium"}`].filter(Boolean), note: zz ? `${zz.kind} ${zz.bottom.toFixed(2)}–${zz.top.toFixed(2)}` : "swing level" }; }
    case "ict": { const lvl = L ? lowest(c, n, 20) : highest(c, n, 20);
      return { zone: z(lvl, a, 0.4), sl: L ? lvl - a : lvl + a, tps: [L ? res : sup], waitFor: [`sweep of ${L ? "sell-side liquidity below" : "buy-side liquidity above"} ${lvl.toFixed(2)}`, `MSS ${L ? "up" : "down"} with a ≥1.5 ATR displacement candle`, "fill at FVG/OTE 0.62–0.79, ideally inside a killzone"], note: `liquidity at ${lvl.toFixed(2)}` }; }
    case "ema": { const E = [8, 13, 21, 34, 55].map((p) => last(ema(x, p))); const ok = E.filter((v, i) => i > 0 && (L ? E[i - 1] > v : E[i - 1] < v)).length;
      return { zone: z(E[2], a), sl: L ? Math.min(E[4], E[2]) - a : Math.max(E[4], E[2]) + a, tps: [L ? res : sup], waitFor: [`ribbon stacks ${L ? "bullish" : "bearish"} (${ok}/4 pairs now)`, "pullback to EMA21"], note: `EMA21 ${E[2].toFixed(2)}` }; }
    case "macd": { const m = macd(x); return { zone: z(L ? sup : res, a, 0.4), sl: L ? sup - a : res + a, tps: [L ? res : sup], waitFor: [`MACD crosses ${L ? "above" : "below"} signal (hist ${last(m.hist).toFixed(2)})`, `ideally from ${L ? "below" : "above"} zero`], note: `swing ${L ? "low" : "high"}` }; }
    case "rsi": { const b = bollinger(x); const lvl = L ? last(b.lo) : last(b.up); const r = last(rsi(x));
      return { zone: z(lvl, a, 0.4), sl: L ? lvl - 1.5 * a : lvl + 1.5 * a, tps: [last(b.mid)], waitFor: [`RSI ${L ? "below 30 then crossing back up" : "above 70 then crossing back down"} (now ${r.toFixed(0)})`, `or ${L ? "bullish" : "bearish"} divergence on a new swing`], note: `${L ? "lower" : "upper"} band area` }; }
    case "bb": { const b = bollinger(x); const ad = last(adx(c)); const lvl = L ? last(b.lo) : last(b.up);
      return { zone: z(lvl, a), sl: L ? lvl - a : lvl + a, tps: [last(b.mid), L ? last(b.up) : last(b.lo)], waitFor: [`close ${L ? "below the lower" : "above the upper"} band then back inside with ADX < 20 (now ${isNaN(ad) ? "–" : ad.toFixed(0)})`, `or a squeeze then close ${L ? "above upper" : "below lower"} band on volume`], note: `${L ? "lower" : "upper"} band ${lvl.toFixed(2)}` }; }
    case "supertrend": { const s = supertrend(c); const line = last(s.line);
      return { zone: z(line, a), sl: L ? line - 1.5 * a : line + 1.5 * a, tps: [L ? line + 3 * a : line - 3 * a], waitFor: [`close ${L ? "above" : "below"} ${line.toFixed(2)} (Supertrend flip)`], note: `flip level ${line.toFixed(2)}` }; }
    case "vwap": { const v = sessionVwap(c); const V = last(v.vwap), S = last(v.sd) || a;
      return { zone: z(L ? V - S : V + S, a), sl: L ? V - 2 * S : V + 2 * S, tps: [V, L ? V + S : V - S], waitFor: [`${L ? "reclaim" : "lose"} VWAP ${V.toFixed(2)} and hold 2 closes, or bounce off the ${L ? "−" : "+"}1σ band`], note: `VWAP ${V.toFixed(2)}` }; }
    case "donchian": { const H = highest(c, n, 20), Lo = lowest(c, n, 20); const lvl = L ? H : Lo;
      return { zone: z(lvl, a), sl: L ? lvl - 2 * a : lvl + 2 * a, tps: [L ? lvl + 3 * a : lvl - 3 * a], waitFor: [`close ${L ? "above the 20-bar high" : "below the 20-bar low"} ${lvl.toFixed(2)}`], note: `channel edge ${lvl.toFixed(2)}` }; }
    case "dema": { const cfg = demaCfg(ctx); const f = last(ema(x, cfg.fast)), sl2 = last(ema(x, cfg.slow)); const r = last(rsi(x));
      return { zone: z(f, a), sl: L ? Math.min(sl2 - 0.5 * a, f - a) : Math.max(sl2 + 0.5 * a, f + a), tps: [L ? res : sup], waitFor: [`EMA${cfg.fast} ${L ? "above" : "below"} EMA${cfg.slow} with price ${L ? "above" : "below"} both`, `RSI ${L ? "40–65" : "35–60"} (now ${r.toFixed(0)})`, `pullback to EMA${cfg.fast}`], note: `EMA${cfg.fast} ${f.toFixed(2)}` }; }
    case "funding": { const liq = (ctx.liq ?? []).filter((b) => (L ? b.price < px && b.long > 0 : b.price > px && b.short > 0)).sort((p, q) => (L ? q.long - p.long : q.short - p.short))[0];
      const lvl = liq?.price ?? (L ? sup : res);
      return { zone: z(lvl, a, 0.4), sl: L ? lvl - a : lvl + a, tps: [L ? res : sup], waitFor: [liq ? `flush into the ${L ? "long" : "short"}-liquidation cluster near ${lvl.toFixed(2)} (ESTIMATE)` : "", `funding ${L ? "deeply negative (crowded shorts)" : "extreme positive (crowded longs)"} with OI rising`].filter(Boolean), note: liq ? "liq cluster" : "swing" }; }
  }
}

/** 1h/4h swing-structure zones for a side (classic v1.0.3 engine): swings, OBs, liquidity pools; SL beyond the zone + 0.5 × 1h ATR. */
export function structureZones(ctx: Ctx, side: Side, px: number): Alt[] {
  const h1 = ctx.h1 ?? [], h4 = ctx.h4 ?? []; if (h1.length < 20 && h4.length < 20) return [];
  const a1 = h1.length > 15 ? last(atr(h1)) : last(atr(h4)) / 2; const L = side === "long";
  return htfZones(h1, h4, L ? "demand" : "supply", px, 0.3).sort((x, y) => y.score - x.score || x.distPct - y.distPct).slice(0, 6)
    .map((zz) => ({ zone: { lo: zz.bottom, hi: zz.top }, sl: L ? zz.bottom - 0.5 * a1 : zz.top + 0.5 * a1, note: zz.label }));
}
function altsFor(id: StrategyId, c: Candle[], ctx: Ctx, side: Side, a: number): Alt[] {
  if (id !== "dema") return [];
  // Double EMA + RSI: like the classic engine, candidate entries at 1h/4h swings / OB / liquidity, plus the slow EMA
  const cfg = demaCfg(ctx), x = c.map((k) => k.c), L = side === "long"; const sEma = last(ema(x, cfg.slow)), px = x[x.length - 1];
  const out = structureZones(ctx, side, px).slice(0, 4);
  if (Number.isFinite(sEma) && (L ? sEma < px : sEma > px)) out.push({ zone: z(sEma, a), sl: L ? sEma - 1.5 * a : sEma + 1.5 * a, note: `EMA${cfg.slow}` });
  return out;
}
export function planSide(id: StrategyId, c: Candle[], ctx: Ctx, side: Side, a: number): SidePlan {
  const s = byId[id].evaluate(c, ctx); const alts = altsFor(id, c, ctx, side, a);
  if (s.direction === side && s.entry && s.sl != null) return { id, family: s.family, active: true, signal: s, zone: s.entry, sl: s.sl, tps: s.tp, waitFor: [], note: s.reasons[0] ?? "", alts };
  return { id, family: s.family, active: false, signal: s, ...pending(id, c, ctx, side, a), alts };
}

export type Zone = { entry: Cluster; entryPx: number; sl: number; tp1: number; tp2: number; rr1: number; rr2: number; meetsRR: boolean; status: "ready" | "wait"; families: number; famTotal: number; liveCount: number; contributors: string[]; waitFor: string[]; distAtr: number; label: "High" | "Medium" | "Mixed"; best: boolean; structureOnly: boolean };
export type SideResult = {
  zones: Zone[]; fillNote: string; pendingFams: number;
  side: Side; status: "ready" | "wait" | "none"; agreement: number; breadth: { agree: number; active: number; families: number };
  entry: Cluster | null; entryPx: number | null; sl: number | null; tp1: number | null; tp2: number | null; rr1: number; rr2: number; meetsRR: boolean; minRR: number;
  waitFor: string[]; opposing: string[]; plans: SidePlan[]; biasDir: string | null; label: "High" | "Medium" | "Mixed"; atr: number; distAtr: number;
};
const FAM: Record<string, string> = { trend: "Trend", momentum: "Momentum", structure: "Structure", volatility: "Volatility", volume: "Volume", positioning: "Positioning" };

export function findSide(ids: StrategyId[], c: Candle[], htf: Candle[], ctx: Ctx, side: Side, minRR = 2): SideResult {
  const a = last(atr(c)) || 0, px = c[c.length - 1].c, L = side === "long";
  const plans = ids.map((id) => planSide(id, c, ctx, side, a));
  let group: Record<string, string> = Object.fromEntries(plans.map((p) => [p.id, p.family]));
  if (ids.length > 1) { const series = Object.fromEntries(ids.map((id) => [id, dirSeries(id, c, ctx)])); group = correlationGroups(ids, series, group as Record<string, Family>).group; }
  const g = (p: SidePlan) => group[p.id];
  // agreement for this side: weight of families pointing this way vs the other way (active, non-neutral signals only)
  const fams = [...new Set(plans.map(g))]; const score = (f: string) => { const ms = plans.filter((p) => g(p) === f); return ms.reduce((s, p) => s + (p.signal.direction === "long" ? 1 : p.signal.direction === "short" ? -1 : 0) * p.signal.strength * decay(p.signal.freshnessBars), 0) / ms.length; };
  const fs = fams.map((f) => ({ f, s: score(f), active: plans.some((p) => g(p) === f && p.signal.direction !== "neutral") })).filter((x) => x.active);
  const pro = fs.filter((x) => (L ? x.s > 0.02 : x.s < -0.02)), con = fs.filter((x) => (L ? x.s < -0.02 : x.s > 0.02));
  const tot = fs.reduce((s, x) => s + Math.abs(x.s), 0); const agreement = tot ? pro.reduce((s, x) => s + Math.abs(x.s), 0) / tot : 0;
  // entry zone: cluster every plan's zone (live ones weighted fully, pending at 0.5) on the correct side of price (or at it)
  type Cand = { p: SidePlan; zone: { lo: number; hi: number }; sl: number | null; label: string; w: number; live: boolean };
  const cands: Cand[] = plans.flatMap((p) => [...(p.zone ? [{ p, zone: p.zone, sl: p.sl, label: byId[p.id].name + (p.active ? "" : " (pending)"), w: p.active ? 1 : 0.5, live: p.active }] : []),
    ...p.alts.map((al) => ({ p, zone: al.zone, sl: al.sl, label: `${byId[p.id].name} · ${al.note} (pending)`, w: 0.4, live: false }))]);
  const cm = (k: Cand) => (k.zone.lo + k.zone.hi) / 2;
  const pts = cands.map((k) => ({ price: cm(k), group: g(k.p), label: k.label, w: k.w }));
  const tol = 0.25 * a; const cl = cluster(pts, tol);
  const live = cl.filter((k) => k.labels.some((l) => !l.includes("pending")) && px >= k.lo - 0.5 * a && px <= k.hi + 0.5 * a).sort((x, y) => y.score - x.score)[0];
  // waiting zone: best-scored cluster within 6 ATR, preferring pullback side (below price for long, above for short); ties → nearer
  const cand = cl.filter((k) => Math.abs(k.mid - px) <= 6 * a).map((k) => ({ k, rank: k.score + ((L ? k.mid <= px : k.mid >= px) ? 0.5 : 0) - Math.abs(k.mid - px) / a / 12 })).sort((x, y) => y.rank - x.rank);
  const htfT = (from: number) => targetLevels(ctx.h1 ?? [], ctx.h4 ?? [], side, from).map((t) => ({ price: t.price, group: "swing", label: t.label }));
  const tgtPts = (entryPx: number) => cluster([...htfT(entryPx), ...plans.flatMap((p) => p.tps.map((t) => ({ price: t, group: g(p), label: byId[p.id].name }))), ...pivots(c, 5).filter((p) => p.kind === (L ? "high" : "low")).slice(-8).map((p) => ({ price: p.price, group: "swing", label: `swing ${p.kind}` }))]
    .filter((p) => (L ? p.price > entryPx + 0.5 * a : p.price < entryPx - 0.5 * a)), tol).sort((x, y) => (L ? x.mid - y.mid : y.mid - x.mid));
  const famCount = new Set(plans.map(g)).size;
  const build = (k: Cluster, isReady: boolean, slHint?: number, structureOnly = false): Zone => {
    const inK = cands.filter((q) => cm(q) >= k.lo - 1e-9 && cm(q) <= k.hi + 1e-9); const contrib = [...new Set(inK.map((q) => q.p))];
    const entry = inK.length ? { ...k, lo: Math.min(...inK.map((q) => q.zone.lo)), hi: Math.max(...inK.map((q) => q.zone.hi)) } : k; // span the contributors' zones
    const entryPx = isReady ? px : entry.mid;
    const sls = (inK.length ? inK.map((q) => q.sl) : [slHint ?? null]).filter((v): v is number => v != null && (L ? v < entry.lo : v > entry.hi));
    const far = sls.length ? (L ? Math.min(...sls) : Math.max(...sls)) : (L ? entry.lo - a : entry.hi + a);
    const sl = L ? Math.max(far, entry.lo - 2.5 * a) - 0.2 * a : Math.min(far, entry.hi + 2.5 * a) + 0.2 * a; const risk = Math.abs(entryPx - sl);
    const tgt = tgtPts(entryPx); const rr = (p: number) => (risk ? Math.abs(p - entryPx) / risk : 0);
    const t1 = tgt.find((t) => rr(t.mid) >= 1.2) ?? tgt[0]; const tp1 = t1?.mid ?? (L ? entryPx + 1.5 * risk : entryPx - 1.5 * risk);
    const t2 = tgt.find((t) => rr(t.mid) >= Math.max(minRR, rr(tp1) + 0.5)); const tp2 = t2?.mid ?? (tgt.length ? tgt[tgt.length - 1].mid : L ? entryPx + 2 * risk : entryPx - 2 * risk); // no synthetic target that just equals the minimum
    const rr1 = rr(tp1), rr2 = rr(tp2), meetsRR = rr2 >= minRR;
    const fams = [...new Set(contrib.map(g))], live = [...new Set(inK.filter((q) => q.live).map((q) => q.p))];
    const waitFor: string[] = [];
    if (!isReady) { waitFor.push(`price reaches ${entry.lo.toFixed(2)}–${entry.hi.toFixed(2)} (${(Math.abs(entry.mid - px) / a).toFixed(1)} ATR ${entry.mid < px ? "below" : "above"})`);
      waitFor.push(...new Set(contrib.filter((p) => !p.active).flatMap((p) => p.waitFor.map((w) => `${byId[p.id].name}: ${w}`))));
      if (structureOnly) waitFor.push("structure only: no selected strategy has a level here; confirm with your own trigger");
      if (agreement < 0.5) waitFor.push(`more families agree ${side} (now ${Math.round(agreement * 100)}% of active family weight)`); }
    else if (!meetsRR) waitFor.push(`better R:R: TP2 is ${rr2.toFixed(2)}R, minimum ${minRR}R`);
    const zl: Zone["label"] = agreement >= 0.75 && pro.length >= 3 && fams.length >= 3 ? "High" : agreement >= 0.6 ? "Medium" : "Mixed";
    return { entry, entryPx, sl, tp1, tp2, rr1, rr2, meetsRR, status: isReady && meetsRR ? "ready" : "wait", families: fams.length, famTotal: famCount, liveCount: live.length, contributors: structureOnly ? k.labels : [...new Set(inK.map((q) => q.label.replace(" (pending)", "*")))], structureOnly, waitFor: waitFor.slice(0, 7), distAtr: Math.abs(entry.mid - px) / a, label: structureOnly ? "Mixed" : zl, best: false };
  };
  const isLive = (k: Cluster) => k.labels.some((l) => !l.includes("pending")) && px >= k.lo - 0.5 * a && px <= k.hi + 0.5 * a;
  const reach = Math.max(6 * a, 0.03 * px); const ranked = cl.filter((k) => Math.abs(k.mid - px) <= reach).map((k) => ({ k, ready: isLive(k) && pro.length >= 1 && agreement >= 0.5, rank: k.score + ((L ? k.mid <= px : k.mid >= px) ? 0.5 : 0) - Math.abs(k.mid - px) / a / 12 }))
    .sort((x, y) => Number(y.ready) - Number(x.ready) || y.rank - x.rank);
  const zones: Zone[] = []; const overlapsAny = (lo: number, hi: number) => zones.some((q) => lo <= q.entry.hi + tol && hi >= q.entry.lo - tol);
  for (const r of ranked) { if (zones.length >= 3) break; const zn = build(r.k, r.ready); if (overlapsAny(zn.entry.lo, zn.entry.hi)) continue; zones.push(zn); } // distinct zones only
  zones.sort((x, y) => Number(y.status === "ready") - Number(x.status === "ready"));
  // fewer than 3? fill with the next-best 1h/4h swing-structure zones for this side ("structure only")
  let fillNote = "";
  if (zones.length < 3) { const overl = overlapsAny;
    for (const al of structureZones(ctx, side, px)) { if (zones.length >= 3) break; if (overl(al.zone.lo, al.zone.hi)) continue;
      const zn = build({ lo: al.zone.lo, hi: al.zone.hi, mid: (al.zone.lo + al.zone.hi) / 2, score: 0, families: [], labels: [`${al.note} (structure only)`] }, false, al.sl, true);
      if (zn.rr1 > 0) zones.push(zn); }
    if (zones.length < 3) fillNote = !(ctx.h1?.length || ctx.h4?.length) ? "1h/4h candles not loaded yet, so no structure zones to fill with." : `Only ${zones.length} valid ${side} zone${zones.length === 1 ? "" : "s"}: no other unmitigated 1h/4h swing, order block or liquidity pool ${L ? "below" : "above"} price within 12%.`; }
  if (zones[0]) zones[0].best = true;
  const z0 = zones[0];
  const entry = z0?.entry ?? null, entryPx = z0?.entryPx ?? null, sl = z0?.sl ?? null, tp1 = z0?.tp1 ?? null, tp2 = z0?.tp2 ?? null, rr1 = z0?.rr1 ?? 0, rr2 = z0?.rr2 ?? 0, waitFor = z0?.waitFor ?? [];
  const opposing = con.map((x) => `${FAM[x.f] ?? x.f} points ${L ? "short" : "long"}`);
  const hb = ids.filter((id) => id !== "funding").map((id) => byId[id].evaluate(htf, ctx)); const hs = hb.reduce((s, x) => s + (x.direction === "long" ? 1 : x.direction === "short" ? -1 : 0) * x.strength, 0);
  const biasDir = hb.length ? (hs > 0.1 ? "long" : hs < -0.1 ? "short" : "neutral") : null;
  if (biasDir && biasDir !== "neutral" && biasDir !== side) opposing.push(`4h bias is ${biasDir} (confidence capped)`);
  let label: SideResult["label"] = agreement >= 0.75 && pro.length >= 3 && (entry?.families.length ?? 0) >= 3 ? "High" : agreement >= 0.6 ? "Medium" : "Mixed";
  if (biasDir && biasDir !== "neutral" && biasDir !== side) { label = "Mixed"; zones.forEach((z) => (z.label = "Mixed")); }
  const meetsRR = rr2 >= minRR;
  const pendingFams = [...new Set(plans.filter((p) => !p.active && (p.zone || p.alts.length)).map(g))].filter((f) => !pro.some((x) => x.f === f)).length;
  return { zones, fillNote, pendingFams, side, status: z0 ? z0.status : "none", agreement, breadth: { agree: pro.length, active: fs.length, families: fams.length }, entry, entryPx, sl, tp1, tp2, rr1, rr2, meetsRR, minRR,
    waitFor, opposing, plans, biasDir, label, atr: a, distAtr: entry ? Math.abs(entry.mid - px) / a : 0 };
}
