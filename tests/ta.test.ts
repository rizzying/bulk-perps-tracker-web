import { describe, it, expect } from "vitest";
import { ema, rsi } from "../src/ta/indicators";
import { pivots, structureBreaks, fvgs } from "../src/ta/smc";
import { evaluateSetup } from "../src/ta/setup";
import { estimateLiqMap } from "../src/ta/liqmap";
const mk = (cs: number[]) => cs.map((c, i) => ({ t: i, o: cs[i - 1] ?? c, h: c + 0.5, l: c - 0.5, c, v: 10 }));
describe("indicators", () => {
  it("ema of constant = constant; rsi of rising = 100", () => {
    expect(ema(Array(30).fill(5), 10).at(-1)).toBeCloseTo(5);
    expect(rsi([...Array(30)].map((_, i) => i), 14).at(-1)).toBe(100);
  });
});
describe("smc", () => {
  it("detects a bullish BOS above a swing high", () => {
    const s = [10, 11, 12, 13, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15, 16, 17];
    const c = mk(s); const p = pivots(c, 3);
    expect(p.some((x) => x.kind === "high" && x.i === 4)).toBe(true);
    const b = structureBreaks(c, p, 3); expect(b.at(-1)?.dir).toBe("bull");
  });
  it("finds an unfilled bullish FVG", () => {
    const c = [{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 1 }, { t: 1, o: 2, h: 5, l: 2, c: 5, v: 1 }, { t: 2, o: 5, h: 6, l: 3, c: 6, v: 1 }];
    expect(fvgs(c)[0]).toMatchObject({ dir: "bull", bottom: 2, top: 3 });
  });
});
describe("setup engine", () => {
  it("returns NO TRADE with reasons when suspended / thin history", () => {
    const r = evaluateSetup("BTC-USD", mk([1, 2, 3]), mk([1, 2, 3]), false);
    expect(r.verdict).toBe("NO TRADE"); expect(r.reasons.join(" ")).toMatch(/suspended/);
  });
  it("choppy flat market is NO TRADE (neutral bias)", () => {
    const flat = [...Array(300)].map((_, i) => 100 + Math.sin(i / 3));
    const r = evaluateSetup("ETH-USD", mk(flat), mk(flat));
    expect(r.verdict).toBe("NO TRADE");
  });
});
describe("liq map", () => {
  it("puts long liqs below and short liqs above price, scaled to OI", () => {
    const c = mk([...Array(50)].map(() => 100));
    const { bins } = estimateLiqMap(c, { maxLev: 40, oiUsd: 1e6 });
    const below = bins.filter((b) => b.price < 100), above = bins.filter((b) => b.price > 100);
    expect(below.reduce((a, b) => a + b.short, 0)).toBe(0);
    expect(above.reduce((a, b) => a + b.long, 0)).toBe(0);
    expect(bins.reduce((a, b) => a + b.long + b.short, 0)).toBeCloseTo(1e6, 0);
  });
});
import { trendBias, sanitizeEma, DEFAULT_EMA } from "../src/ta/setup";
describe("configurable EMA trend", () => {
  it("defaults to double EMA 21/50 with third off", () => {
    expect(DEFAULT_EMA).toMatchObject({ fast: 21, slow: 50, thirdOn: false });
  });
  it("bull needs fast>slow and price above both; bear mirrors; else neutral", () => {
    expect(trendBias(110, 105, 100, null)).toBe("bull");
    expect(trendBias(103, 105, 100, null)).toBe("neutral"); // price between EMAs
    expect(trendBias(90, 95, 100, null)).toBe("bear");
    expect(trendBias(110, 100, 105, null)).toBe("neutral"); // EMAs bearish, price above
  });
  it("optional third EMA must agree when on", () => {
    expect(trendBias(110, 105, 100, 120)).toBe("neutral");
    expect(trendBias(110, 105, 100, 90)).toBe("bull");
  });
  it("sanitizes bad input: swaps fast/slow, clamps, falls back", () => {
    expect(sanitizeEma({ fast: 50, slow: 21 })).toMatchObject({ fast: 21, slow: 50 });
    expect(sanitizeEma({ fast: 21, slow: 21 })).toMatchObject({ fast: 21, slow: 50 });
    expect(sanitizeEma({ fast: 1, slow: 9999 })).toMatchObject({ fast: 21, slow: 50 });
  });
  it("uses the configured lengths in the engine and history requirement", () => {
    const up = [...Array(240)].map((_, i) => 100 + i);
    const c = up.map((v, i) => ({ t: i, o: v - 0.5, h: v + 1, l: v - 1, c: v, v: 10 }));
    const r = evaluateSetup("BTC-USD", c, c.slice(-100), true, { fast: 21, slow: 50, thirdOn: false, third: 200 });
    expect(r.bias).toBe("bull");
    expect(r.checks.find((x) => x.name.includes("trend"))!.name).toContain("EMA 21/50");
    const r2 = evaluateSetup("BTC-USD", c.slice(0, 100), c.slice(-100), true, { fast: 21, slow: 50, thirdOn: true, third: 200 });
    expect(r2.checks.find((x) => x.name === "Enough history")!.pass).toBe(false);
  });
});
import { pick } from "../src/ta/setup";
// 4h downtrend + 15m relief rally (bull BOS) with shallow pullback: classic counter-trend bounce long.
function bounce(shift = 0) {
  const down = [...Array(240)].map((_, i) => 1000 - i * 2);
  const htf = down.map((v, i) => ({ t: i, o: v + 1, h: v + 3, l: v - 3, c: v, v: 10 }));
  const p: number[] = [];
  for (let i = 0; i < 60; i++) p.push(560 - i * 0.5);
  for (let i = 0; i < 6; i++) p.push(530 + i * 1.5);
  for (let i = 0; i < 6; i++) p.push(536.3 - i * 1.2);
  for (let i = 0; i < 6; i++) p.push(530.3 + (i + 1) * 2);
  p.push(540.0, 539.0, 539.8, 540.5);
  const ltf = p.map((c0, i) => { const c = c0 + shift; return { t: i, o: i ? p[i - 1] + shift : c, h: c + 0.3, l: c - 0.3, c, v: 5 }; });
  return { htf, ltf };
}
describe("two-sided engine", () => {

  it("counter-trend target right overhead fails R:R → NO TRADE (closest side still shown)", () => {
    const { htf, ltf } = bounce(0); // price ~540.5, EMA21 ~542 just above
    const r = evaluateSetup("BTC-USD", htf, ltf);
    expect(r.verdict).toBe("NO TRADE");
    expect(r.best.dir).toBe("long");
    expect(r.best.reasons.join()).toMatch(/Reward : risk/);
  });

  it("RSI is direction-aware", () => {
    const { htf, ltf } = bounce(-20);
    const r = evaluateSetup("BTC-USD", htf, ltf);
    expect(r.best.checks.find((c) => c.name.includes("RSI"))!.detail).toMatch(/long wants 40–65 & rising/);
    expect(r.other!.checks.find((c) => c.name.includes("RSI"))!.detail).toMatch(/short wants 35–60 & falling/);
  });
  it("with-trend valid beats counter-trend valid even at lower confidence", () => {
    const mk = (dir: "long" | "short", alignment: any, confidence: number) => ({ dir, valid: true, alignment, checks: [], reasons: [], confidence, zones: [] });
    const base: any = { common: [], checks: [], reasons: [], zones: [] };
    const r = pick(base, [mk("long", "counter-trend", 75), mk("short", "with-trend", 70)]);
    expect(r.verdict).toBe("SHORT"); expect(r.counterTrend).toBe(false);
  });
});
// Synthetic 1h/4h: flat base 100, rally to a swing high ~110, sell-off to a swing low ~95, recovery to ~100 (current).
function swings() {
  const p: number[] = [];
  for (let i = 0; i < 60; i++) p.push(100 + (i % 2) * 0.01);
  for (let i = 1; i <= 20; i++) p.push(100 + i * 0.5);   // -> 110 swing high
  for (let i = 1; i <= 30; i++) p.push(110 - i * 0.5);   // -> 95 swing low
  for (let i = 1; i <= 10; i++) p.push(95 + i * 0.5);    // -> 100 now
  const c = p.map((x, i) => ({ t: i, o: i ? p[i - 1] : x, h: x + 0.3, l: x - 0.3, c: x, v: 10 }));
  return { h4: c, h1: c, ltf: c.slice(-80) };
}
describe("swing-zone entry search (v1.0.3)", () => {
  it("Find Short proposes the 1h/4h swing-high supply zone, SL beyond it, TP at the opposite swing low, R:R ≥ 3", () => {
    const { h4, h1, ltf } = swings();
    const r = evaluateSetup("BTC-USD", h4, ltf, true, DEFAULT_EMA, "short", { h1 });
    const p = r.best.plan!;
    expect(p.status).toBe("wait");
    expect(p.entry.high).toBeCloseTo(110.3, 1);           // zone at the swing high, not a micro level
    expect(p.stop).toBeGreaterThan(p.entry.high);         // stop beyond the swing + ATR buffer
    expect(p.tp2).toBeCloseTo(94.7, 1);                   // opposite swing low
    expect(p.rr).toBeGreaterThanOrEqual(3);
    expect(p.candidates.filter((c) => c.best).length).toBe(1);
    expect(p.candidates.every((c) => c.zone.members.every((m) => m.tf === "1h" || m.tf === "4h"))).toBe(true);
    const d = p.candidates.map((c) => c.zone.distPct); expect([...d].sort((a, b) => a - b)).toEqual(d); // nearest → farthest
  });
  it("Find Long proposes the swing-low demand zone with stop below it", () => {
    const { h4, h1, ltf } = swings();
    const r = evaluateSetup("BTC-USD", h4, ltf, true, DEFAULT_EMA, "long", { h1 });
    const p = r.best.plan!;
    expect(p.entry.low).toBeCloseTo(94.7, 1);
    expect(p.stop).toBeLessThan(p.entry.low);
    expect(p.tp2).toBeGreaterThan(p.entryPx);
    expect(r.other).toBeUndefined();
  });
  it("minimum R:R is configurable and enforced on TP2", () => {
    const { h4, h1, ltf } = swings();
    const r = evaluateSetup("BTC-USD", h4, ltf, true, DEFAULT_EMA, "short", { h1, minRR: 1000 });
    expect(r.best.plan!.candidates.every((c) => !c.meetsRR)).toBe(true);
    expect(r.best.plan!.waitFor.join(" ")).toMatch(/no zone reaches 1000R/);
    expect(r.best.checks.find((c) => c.name.startsWith("Reward"))!.name).toContain("1000");
  });
  it("defaults to min R:R 3", () => {
    const { h4, h1, ltf } = swings();
    const r = evaluateSetup("BTC-USD", h4, ltf, true, DEFAULT_EMA, "short", { h1 });
    expect(r.best.checks.find((c) => c.name.startsWith("Reward"))!.name).toBe("Reward : risk ≥ 3");
  });
});
