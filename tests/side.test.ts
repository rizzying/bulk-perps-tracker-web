import { describe, it, expect } from "vitest";
import { findSide, planSide } from "../src/strategies/side";
import { STRATEGIES } from "../src/strategies/catalog";
import type { Candle } from "../src/ta/indicators";
const mk = (n: number, f: (i: number) => number): Candle[] => Array.from({ length: n }, (_, i) => { const c = f(i), o = f(i - 1); return { t: Date.UTC(2026, 9, 1) + i * 9e5, o, h: Math.max(o, c) + 0.3, l: Math.min(o, c) - 0.3, c, v: 100 + (i % 7) }; });
const up = mk(300, (i) => 100 + i * 0.5 + 2 * Math.sin(i / 3));
const ids = STRATEGIES.map((s) => s.id);

describe("Find Long / Find Short", () => {
  it("every strategy returns a side plan: live trigger, or a pending zone + what still needs to happen", () => {
    for (const side of ["long", "short"] as const) for (const id of ids) {
      const p = planSide(id, up, { now: up[299].t }, side, 1);
      expect(p.zone).not.toBeNull(); expect(p.zone!.lo).toBeLessThanOrEqual(p.zone!.hi);
      if (!p.active) expect(p.waitFor.length).toBeGreaterThan(0); else expect(p.signal.direction).toBe(side);
      if (p.sl != null) expect(side === "long" ? p.sl < p.zone!.hi : p.sl > p.zone!.lo).toBe(true);
    }
  });
  it("uptrend: long side has trend agreement; short side lists the opposing trend and a wait plan", () => {
    const L = findSide(ids, up, up, { now: up[299].t }, "long", 2), S = findSide(ids, up, up, { now: up[299].t }, "short", 2);
    expect(L.agreement).toBeGreaterThan(S.agreement); expect(L.breadth.agree).toBeGreaterThan(0);
    expect(S.status).not.toBe("ready"); expect(S.opposing.join()).toMatch(/Trend points long/);
    for (const r of [L, S]) if (r.entry) {
      const isL = r.side === "long"; expect(isL ? r.sl! < r.entry.lo : r.sl! > r.entry.hi).toBe(true);
      expect(isL ? r.tp2! >= r.tp1! : r.tp2! <= r.tp1!).toBe(true); expect(r.rr2).toBeGreaterThanOrEqual(r.rr1);
      expect(r.meetsRR).toBe(r.rr2 >= 2);
    }
    if (S.status === "wait") { expect(S.waitFor[0]).toMatch(/price reaches|better R:R/); }
  });
  it("min R:R is enforced on TP2", () => {
    const r = findSide(ids, up, up, { now: up[299].t }, "long", 50); if (r.entry) { expect(r.meetsRR).toBe(r.rr2 >= 50); expect(r.status).not.toBe("ready"); }
  });
  it("only the ticked strategies are used", () => {
    const r = findSide(["ema", "supertrend"], up, up, { now: up[299].t }, "long", 2); expect(r.plans.map((p) => p.id)).toEqual(["ema", "supertrend"]);
  });
});

describe("Double EMA + RSI (classic) and ranked zones", () => {
  const down = mk(300, (i) => 300 - i * 0.5 + 2 * Math.sin(i / 3));
  it("double EMA: trend from fast/slow + price, RSI filter can veto, lengths configurable", async () => {
    const { byId, PRESETS } = await import("../src/strategies/catalog");
    const L = byId.dema.evaluate(up, { now: 0 }), D = byId.dema.evaluate(down, { now: 0 });
    for (const s of [L, D]) { if (s.direction !== "neutral") expect(s.reasons.join()).toMatch(/RSI \d+ inside/); else expect(s.reasons.join()).toMatch(/RSI/); }
    expect(L.direction).not.toBe("short"); expect(D.direction).not.toBe("long");
    const custom = byId.dema.evaluate(up, { now: 0, emaCfg: { fast: 9, slow: 30, thirdOn: false, third: 200 } }); expect(custom.reasons[0]).toMatch(/EMA 9\/30/);
    expect(PRESETS["Double EMA + RSI (classic)"]).toEqual(["dema"]);
  });
  it("Find Long/Short return up to 3 ranked zones, best first and starred, each with its own SL/TP/R:R/breadth", () => {
    for (const side of ["long", "short"] as const) {
      const r = findSide(ids, up, up, { now: up[299].t }, side, 2);
      expect(r.zones.length).toBeGreaterThan(0); expect(r.zones.length).toBeLessThanOrEqual(3);
      expect(r.zones.filter((z) => z.best).length).toBe(1); expect(r.zones[0].best).toBe(true);
      for (const z of r.zones) { expect(side === "long" ? z.sl < z.entry.lo : z.sl > z.entry.hi).toBe(true); expect(z.rr2).toBeGreaterThanOrEqual(z.rr1); expect(z.families).toBeLessThanOrEqual(z.famTotal); if (z.status === "wait") expect(z.waitFor.length).toBeGreaterThan(0); }
      if (r.zones.some((z) => z.status === "ready")) expect(r.zones[0].status).toBe("ready");
    }
  });
});

describe("3 zones per side with structure fill", () => {
  // choppy range so both sides have unmitigated 1h/4h swings
  const zig = (n: number, step: number) => mk(n, (i) => 100 + 8 * Math.sin(i / (6 * step)) + 3 * Math.sin(i / (1.7 * step)));
  const l = zig(300, 1), h1 = zig(400, 1).map((k, i) => ({ ...k, t: k.t * 1 + i })), h4 = zig(240, 1);
  it("a single ticked strategy still gets up to 3 distinct zones, filling with 'structure only' swing zones", () => {
    for (const side of ["long", "short"] as const) for (const ids of [["dema"], ["rsi"], ["funding"]] as const) {
      const r = findSide([...ids], l, h4, { now: l[299].t, h1, h4 }, side, 1.5);
      expect(r.zones.length === 3 || r.fillNote.length > 0).toBe(true);
      for (let i = 0; i < r.zones.length; i++) for (let j = i + 1; j < r.zones.length; j++) { const a = r.zones[i].entry, b = r.zones[j].entry; expect(a.lo > b.hi || b.lo > a.hi).toBe(true); }
      for (const z of r.zones) { if (z.structureOnly) { expect(z.contributors.join()).toMatch(/structure only/); expect(z.waitFor.join()).toMatch(/structure only/); } expect(side === "long" ? z.sl < z.entry.lo : z.sl > z.entry.hi).toBe(true); }
    }
  });
  it("Double EMA + RSI proposes 1h/4h swing zones itself (not just one EMA level)", async () => {
    const { planSide } = await import("../src/strategies/side");
    const p = planSide("dema", l, { now: 0, h1, h4 }, "short", 1); expect(p.alts.length).toBeGreaterThan(0);
  });
  it("header data: pending families are counted when nothing fires; explains when no structure is available", () => {
    const r = findSide(["dema"], l, h4, { now: l[299].t, h1, h4 }, "short", 1.5);
    if (r.breadth.active === 0) expect(r.pendingFams).toBeGreaterThan(0);
    const n = findSide(["funding"], flat300, flat300, { now: 0 }, "short", 1.5);
    if (n.zones.length < 3) expect(n.fillNote).toMatch(/1h\/4h|Only/);
  });
});
const flat300 = mk(300, (i) => 100 + 0.01 * Math.sin(i));
