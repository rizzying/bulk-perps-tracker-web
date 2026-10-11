import { describe, it, expect } from "vitest";
import fs from "fs";
import { BUNDLED, TRAIN, weekOf, weekEnd, weekFeatures, pointTrading, refit, monteCarlo, maker, isBulkAddress, ols } from "../src/aura/estimator";
import { TIERED, tierOf, xrow } from "../src/aura/estimator";
import V2 from "../src/aura/model_v2.json";
const V2COEF = V2.coef;

const RAW2 = "/workspace/aura/raw2";
const csv = (p: string) => { const l = fs.readFileSync(p, "utf8").trim().split("\n"); const h = l[0].split(","); return l.slice(1).map((x) => Object.fromEntries(x.split(",").map((v, i) => [h[i], v]))); };
const loadRaw2 = (w: string) => { const d = JSON.parse(fs.readFileSync(`${RAW2}/${w}.json`, "utf8")); return { positions: d.positions, funding: d.fundingHistory, fills: d.fills, own: new Set<string>([w, ...(d.subs ?? [])]) }; };

describe("AURA v2 week window", () => {
  it("weeks run Sat 06:00 UTC (13:00 WIB) → next Sat", () => {
    expect(weekOf(Date.parse("2026-09-05T06:00:00Z"))).toBe(1);
    expect(weekOf(Date.parse("2026-10-10T05:59:59Z"))).toBe(5);
    expect(weekOf(Date.parse("2026-10-10T06:00:00Z"))).toBe(6);
    expect(new Date(weekEnd(6)).toISOString()).toBe("2026-10-17T06:00:00.000Z");
  });
});

describe.skipIf(!fs.existsSync(RAW2))("AURA v2 features match the offline pipeline (master + subs)", () => {
  it("volume, |fees|, OI-hours and hours-open equal dataset_weekly_v3 / oi_features", () => {
    const D = csv("/workspace/aura/dataset_weekly_v3.csv"); const O = new Map(csv("/workspace/aura/oi_features.csv").map((r) => [r.wallet + ":" + r.week, r]));
    const rows = D.filter((r) => +r.volume > 0 && +r.n_subs > 0).slice(0, 15).concat(D.filter((r) => +r.volume > 0 && +r.n_subs === 0).slice(0, 25));
    for (const r of rows) {
      const f = weekFeatures(loadRaw2(r.wallet), +r.week);
      expect(f.vol).toBeCloseTo(+r.volume, 0); expect(f.fees).toBeCloseTo(+r.fees_abs, 3); expect(f.oih).toBeCloseTo(+r.oi_hours, -1);
      expect(f.hoursOpen).toBe(+O.get(r.wallet + ":" + r.week)!.oi_presence_h);
    }
  });
  it("test wallet per-week estimates = exp(x · tiered mean weights) × 1.2 calibration", () => {
    const raw = loadRaw2("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w");
    for (const w of [1, 2, 3, 4, 5]) { const p = BUNDLED.platform[w]; const f = weekFeatures(raw, w);
      const x = xrow(f, p.vol, p.oih); const manual = Math.exp(x.reduce((s, v, i) => s + v * TIERED.mean[i], 0)) * 1.2;
      expect(pointTrading(BUNDLED, f, p.vol, p.oih).mid).toBeCloseTo(manual, 6);
      // same features under the old v2 weights: the tiered model stays within ×2.5 of it
      const old = Math.exp(x.reduce((s, v, i) => s + v * V2COEF[i], 0)); expect(Math.abs(Math.log(manual / old))).toBeLessThan(Math.log(2.5)); }
  });
});

describe("AURA v2 model", () => {
  it("point weights = mean of weekly weights; per-week OLS refit reproduces each stored week", () => {
    // tiered calibration: coef = mean of the 5 tier-weighted weekly vectors (aura/weekly_weights_tiered.json)
    BUNDLED.coef.forEach((c, i) => expect(c).toBeCloseTo(BUNDLED.weekly.reduce((s, w) => s + w.w[i], 0) / BUNDLED.weekly.length, 9));
    expect(BUNDLED.coef[0]).toBeCloseTo(16.892, 2); expect(BUNDLED.weekly.length).toBe(5);
    expect([100, 148, 149, 512, 513, 1900, 5300, 30000, 30001].map(tierOf)).toEqual(["Bronze", "Bronze", "Silver", "Silver", "Gold", "Gold", "Platinum", "Diamond", "Challenger"]);
    expect(Object.fromEntries(Object.entries(TIERED.residByTier).map(([t, r]) => [t, r.length]))).toEqual({ Bronze: 544, Silver: 473, Gold: 468, Platinum: 323, Diamond: 413, Challenger: 151 });
    expect(TIERED.calib).toBe(1.2); expect(TIERED.widen).toEqual({ Silver: 1.12, Challenger: 1.12 });
    // the old unweighted refit path still runs (used for in-app weeks 6+)
    const { coef } = refit(TRAIN.filter((r) => r[0] === 3), BUNDLED.platform); expect(coef.length).toBe(5);
    expect(ols([[1, 0], [1, 1], [1, 2]], [1, 3, 5])).toEqual([expect.closeTo(1, 9), expect.closeTo(2, 9)]);
  });
  it("Monte Carlo: ordered quantiles, seeded/deterministic, more volume → more AURA, full week ≈ point × residual noise", () => {
    const obs = { vol: 50_000, fees: 15, oih: 200_000, hoursOpen: 40, makerVol: 0, positions: 5 };
    const pool = Array.from({ length: 14 }, () => ({ vol: 10_000, fees: 3, oih: 50_000, hoursOpen: 8 }));
    const prev = BUNDLED.platform[5];
    const a = monteCarlo(BUNDLED, obs, 3, pool, prev, { N: 1500, seed: 1 }), b = monteCarlo(BUNDLED, obs, 3, pool, prev, { N: 1500, seed: 1 });
    expect(a.p50).toBe(b.p50); expect(a.p10).toBeLessThanOrEqual(a.p50); expect(a.p50).toBeLessThanOrEqual(a.p90);
    expect(monteCarlo(BUNDLED, obs, 3, pool, prev, { N: 1500, seed: 1, extraVol: 1e6 }).p50).toBeGreaterThan(a.p50);
    const full = monteCarlo(BUNDLED, obs, 7, pool, prev, { N: 3000, seed: 2 }); const pt = pointTrading(BUNDLED, obs, prev.vol, prev.oih).mid;
    expect(full.p50 / pt).toBeGreaterThan(0.6); expect(full.p50 / pt).toBeLessThan(1.6);
    expect(a.pAbove(0)).toBeGreaterThan(0.99); expect(a.pAbove(1e12)).toBe(0);
  });
  it("maker line and address validation", () => {
    expect(maker(1e6)).toBeCloseTo(Math.exp(-6.946) * 1e6 ** 0.89, 6); expect(maker(0)).toBe(0);
    expect(isBulkAddress("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w")).toBe(true);
    expect(isBulkAddress("0xabc")).toBe(false); expect(isBulkAddress("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3O")).toBe(false); // 'O' not base58
  });
});

import { liveScenarios, weekStart as ws2 } from "../src/aura/estimator";
describe("AURA live strip scenarios", () => {
  const w = 6, now = ws2(6) + 24 * 36e5; // 1 day into week 6 → 144 h left
  const obs = { vol: 10_000, fees: 3, oih: 5_000, hoursOpen: 10, makerVol: 0, positions: 2, oiC: 2_000, oiF: 5_000 };
  const pos = [{ size: 0.1, entry: 80_000, mark: 82_000, fees: 2.8, entryMs: now - 10 * 36e5 }];
  it("close now adds open+close volume and fees, and OI-hours since entry", () => {
    const L = liveScenarios(obs, pos, now, w);
    expect(L.openCount).toBe(1); expect(L.closeNow.vol).toBeCloseTo(10_000 + 0.1 * 162_000, 6);
    expect(L.closeNow.fees).toBeCloseTo(3 + 2.8 + 0.1 * 82_000 * 0.00035, 6);
    expect(L.closeNow.oih).toBeCloseTo(Math.max(2_000 + 8_000 * 10, 5_000), 3);
  });
  it("hold to cutoff = close AT cutoff (close volume + fees) plus accrued OI-hours and hours-open", () => {
    const L = liveScenarios(obs, pos, now, w);
    expect(L.hoursLeft).toBeCloseTo(144, 6); expect(L.hold.vol).toBeCloseTo(L.closeNow.vol, 6); expect(L.hold.fees).toBeCloseTo(L.closeNow.fees, 6); expect(L.hold.hoursOpen).toBe(154);
    expect(L.hold.oih).toBeCloseTo(Math.max(2_000 + 8_000 * 154, 5_000 + 8_200 * 144), 3);
  });
  it("no open positions → both scenarios equal realized", () => {
    const L = liveScenarios(obs, [], now, w); expect(L.closeNow.vol).toBe(10_000); expect(L.hold.hoursOpen).toBe(10);
  });
});

import { BUNDLED as B2, pointTrading as pt2, monteCarlo as mc2 } from "../src/aura/estimator";
describe("v1.5.1 regressions: zero realized volume + an open position (rizzy week 6)", () => {
  const w = 6, now = ws2(6) + 23 * 36e5;
  const obs = { vol: 0, fees: 0, oih: 34_516, hoursOpen: 23, makerVol: 0, positions: 0, oiC: 0, oiF: 34_516 };
  const pos = [{ size: 0.0181, entry: 82_000, mark: 82_800, fees: 0.52, entryMs: null }];
  const prev = B2.platform[5];
  it("hold to cutoff is no longer 0", () => {
    const L = liveScenarios(obs, pos, now, w);
    expect(L.hold.vol).toBeGreaterThan(0); expect(pt2(B2, L.hold, prev.vol, prev.oih).mid).toBeGreaterThan(1);
    expect(pt2(B2, L.closeNow, prev.vol, prev.oih).mid).toBeGreaterThan(1);
  });
  it("MC low end reflects the forced close of open positions (P10 > 0 and above the no-floor P10)", () => {
    const L = liveScenarios(obs, pos, now, w); const pool = Array.from({ length: 14 }, () => ({ vol: 0, fees: 0, oih: 1500, hoursOpen: 24 }));
    const a = mc2(B2, obs, 23 / 24, pool, prev, { N: 2000, seed: 3 }), b = mc2(B2, obs, 23 / 24, pool, prev, { N: 2000, seed: 3, forced: L.forced });
    expect(a.p10).toBe(0); expect(b.p10).toBeGreaterThan(0); expect(b.pAbove(0)).toBe(1);
    const hold = pt2(B2, L.hold, prev.vol, prev.oih).mid; expect(b.p10).toBeGreaterThan(hold / 6); // floor, still under weight/residual uncertainty
  });
});
