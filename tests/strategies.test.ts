import { describe, it, expect } from "vitest";
import { STRATEGIES, byId, killzoneOf } from "../src/strategies/catalog";
import { consensus, cluster, corr, correlationGroups, runConsensus } from "../src/strategies/consensus";
import { supertrend, adx, sessionVwap } from "../src/strategies/ind";
import type { Signal } from "../src/strategies/types";
import type { Candle } from "../src/ta/indicators";

const mk = (n: number, f: (i: number) => number, t0 = Date.UTC(2026, 9, 1)): Candle[] => Array.from({ length: n }, (_, i) => { const c = f(i), o = f(i - 1); return { t: t0 + i * 9e5, o, h: Math.max(o, c) + 0.3, l: Math.min(o, c) - 0.3, c, v: 100 + (i % 7) }; });
const up = mk(300, (i) => 100 + i * 0.5 + Math.sin(i / 3)), down = mk(300, (i) => 300 - i * 0.5 + Math.sin(i / 3));
const S = (p: Partial<Signal> & Pick<Signal, "id" | "family" | "direction">): Signal => ({ strength: 1, entry: { lo: 99, hi: 101 }, sl: 95, tp: [110, 120], invalidation: "", freshnessBars: 0, reasons: [], levels: [], ...p });
const flat = mk(100, () => 100);

describe("strategy catalogue", () => {
  it("has the 10 v1 strategies on the common interface, all pure", () => {
    expect(STRATEGIES.map((s) => s.id)).toEqual(["smc", "ict", "ema", "macd", "rsi", "bb", "supertrend", "vwap", "donchian", "funding"]);
    for (const s of STRATEGIES) { const a = s.evaluate(up, { now: up[299].t }), b = s.evaluate(up, { now: up[299].t }); expect(a).toEqual(b); expect(["long", "short", "neutral"]).toContain(a.direction); expect(a.strength).toBeGreaterThanOrEqual(0); expect(a.strength).toBeLessThanOrEqual(1); }
  });
  it("trend tools read a clean uptrend as long and a downtrend as short, with SL on the correct side", () => {
    for (const id of ["ema", "supertrend"] as const) {
      const L = byId[id].evaluate(up, { now: 0 }), D = byId[id].evaluate(down, { now: 0 });
      expect(L.direction).toBe("long"); expect(D.direction).toBe("short"); expect(L.sl!).toBeLessThan(L.entry!.lo); expect(D.sl!).toBeGreaterThan(D.entry!.hi);
    }
  });
  it("flat market → no trade from breakout/trend tools", () => { expect(byId.donchian.evaluate(flat, { now: 0 }).direction).toBe("neutral"); });
  it("funding: crowded shorts + rising OI → long; no data → neutral", () => {
    expect(byId.funding.evaluate(flat, { now: 0 }).direction).toBe("neutral");
    expect(byId.funding.evaluate(flat, { now: 0, funding: { rate: -0.00002, pct: 0.05 }, oi: { changePct: 3 } }).direction).toBe("long");
    expect(byId.funding.evaluate(flat, { now: 0, funding: { rate: 0.00005, pct: 0.95 }, oi: { changePct: 3 } }).direction).toBe("short");
  });
  it("ICT killzones are NY-time and DST-aware (WIB)", () => {
    expect(killzoneOf(Date.UTC(2026, 9, 12, 15, 0))).toBe("London close"); // 22:00 WIB = 11:00 EDT (Silver Bullet hour)
    expect(killzoneOf(Date.UTC(2026, 9, 12, 12, 30))).toBe("New York"); // 08:30 EDT
    expect(killzoneOf(Date.UTC(2026, 10, 9, 13, 30))).toBe("New York"); // 08:30 EST (after DST ends)
    expect(killzoneOf(Date.UTC(2026, 9, 12, 7, 0))).toBe("London"); // 03:00 EDT
  });
  it("indicator sanity: supertrend flips, ADX defined, VWAP resets daily", () => {
    expect(supertrend(up).dir[299]).toBe(1); expect(supertrend(down).dir[299]).toBe(-1); expect(adx(up)[299]).toBeGreaterThan(20);
    const v = sessionVwap(mk(200, (i) => 100 + i)); expect(v.vwap[100]).toBeGreaterThan(0);
  });
});

describe("consensus", () => {
  const c = mk(100, () => 100);
  it("families vote once: 3 trend longs vs 1 momentum short → breadth counts families, not tools", () => {
    const r = consensus([S({ id: "ema", family: "trend", direction: "long" }), S({ id: "macd", family: "trend", direction: "long" }), S({ id: "supertrend", family: "trend", direction: "long" }), S({ id: "rsi", family: "momentum", direction: "short", strength: 0.5, entry: { lo: 100, hi: 100 }, sl: 105, tp: [90] })], c);
    // trend family averages to +1 (one vote), momentum −0.5 → C = +0.25, agreement 1/1.5
    expect(r.dir).toBe("long"); expect(r.breadth).toEqual({ agree: 1, active: 2 }); expect(r.agreement).toBeCloseTo(2 / 3, 5); expect(r.label).toBe("Medium");
  });
  it("High needs ≥75% agreement, ≥3 agreeing families and a ≥3-family entry zone", () => {
    const sigs = [S({ id: "ema", family: "trend", direction: "long" }), S({ id: "rsi", family: "momentum", direction: "long" }), S({ id: "smc", family: "structure", direction: "long" }), S({ id: "vwap", family: "volume", direction: "long" })];
    const r = consensus(sigs, c); expect(r.label).toBe("High"); expect(r.entry!.families.length).toBeGreaterThanOrEqual(3); expect(r.tps[0].rr).toBeGreaterThanOrEqual(1.2); expect(r.rejected).toBeNull();
  });
  it("4h/15m disagreement caps the label and raises a conflict", () => {
    const sigs = [S({ id: "ema", family: "trend", direction: "long" }), S({ id: "rsi", family: "momentum", direction: "long" }), S({ id: "smc", family: "structure", direction: "long" })];
    const r = consensus(sigs, c, { biasDir: "short" }); expect(r.label).toBe("Mixed"); expect(r.tfAgree).toBe(false); expect(r.conflicts.join()).toMatch(/4h bias is short/);
  });
  it("rejects setups whose TP1 is below 1.2R", () => {
    const r = consensus([S({ id: "ema", family: "trend", direction: "long", entry: { lo: 100, hi: 100 }, sl: 90, tp: [105] })], c);
    expect(r.rejected).toMatch(/1\.2R/);
  });
  it("conflict banner when ≥2 families on each side and |C| small", () => {
    const r = consensus([S({ id: "ema", family: "trend", direction: "long" }), S({ id: "smc", family: "structure", direction: "long" }), S({ id: "rsi", family: "momentum", direction: "short" }), S({ id: "vwap", family: "volume", direction: "short" })], c);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });
  it("zone clustering merges within tolerance and dedupes by family", () => {
    const z = cluster([{ price: 100, group: "trend", label: "a" }, { price: 100.1, group: "trend", label: "b" }, { price: 100.2, group: "volume", label: "c" }, { price: 105, group: "trend", label: "d" }], 0.25);
    expect(z.length).toBe(2); expect(z[0].score).toBe(2); expect(z[0].labels).toEqual(["a", "b", "c"]);
  });
  it("correlation guard merges strategies with r > 0.7 into one voting group (single strategy, not whole family)", () => {
    const a = [1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1, -1], b = [...a], d = a.map((x, i) => (i % 3 ? x : -x));
    expect(corr(a, b)).toBeCloseTo(1, 5);
    const g = correlationGroups(["ema", "smc", "rsi"], { ema: a, smc: b, rsi: d }, { ema: "trend", smc: "structure", rsi: "momentum" });
    expect(g.group.smc).toBe("trend"); expect(g.group.rsi).toBe("momentum"); expect(g.merges[0].r).toBeGreaterThan(0.7);
  });
  it("runConsensus end-to-end on synthetic data is deterministic", () => {
    const a = runConsensus(STRATEGIES.map((s) => s.id), up, up.filter((_, i) => i % 16 === 0).length > 50 ? up : up, { now: up[299].t });
    const b = runConsensus(STRATEGIES.map((s) => s.id), up, up, { now: up[299].t });
    expect(a.dir).toBe(b.dir); expect(a.dir).toBe("long");
  });
});
