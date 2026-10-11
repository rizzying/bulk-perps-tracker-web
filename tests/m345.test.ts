import { describe, it, expect } from "vitest";
import { groupDaily, jakartaDay, mergeRows } from "../src/funding";
import { stepNearLiq, levelFor } from "../src/alerts";
import fh from "../fixtures/fundingHistory.json";

describe("daily funding (Jakarta)", () => {
  it("UTC 16:59 is same Jakarta day, 17:00 rolls over", () => {
    expect(jakartaDay(Date.UTC(2026, 9, 9, 16, 59) * 1e6)).toBe("2026-10-09");
    expect(jakartaDay(Date.UTC(2026, 9, 9, 17, 0) * 1e6)).toBe("2026-10-10");
  });
  it("groups live fixture and totals match", () => {
    const rows = (fh as any).data;
    const days = groupDaily(rows);
    const sum = days.reduce((a, d) => a + d.total, 0);
    expect(sum).toBeCloseTo(rows.reduce((a: number, r: any) => a + r.payment, 0), 9);
    expect(days[0].day >= days[days.length - 1].day).toBe(true);
    expect(days.reduce((a, d) => a + d.count, 0)).toBe(rows.length);
  });
  it("merge dedupes", () => {
    const rows = (fh as any).data.slice(0, 5);
    expect(mergeRows(rows, rows.slice(0, 3)).length).toBe(5);
  });
});
describe("near-liq alert state machine", () => {
  const s = { warn: 0.10, danger: 0.05, sound: true, volume: 1, cooldownMin: 10 };
  it("fires on worsening only, not repeatedly", () => {
    let r = stepNearLiq(undefined, 0.2, s, 0); expect(r.fire).toBeNull();
    r = stepNearLiq(r.state, 0.09, s, 1000); expect(r.fire).toBe("warn");
    r = stepNearLiq(r.state, 0.08, s, 2000); expect(r.fire).toBeNull();
    r = stepNearLiq(r.state, 0.04, s, 3000); expect(r.fire).toBe("danger");
    r = stepNearLiq(r.state, 0.045, s, 4000); expect(r.fire).toBeNull();
  });
  it("hysteresis: must recover 2pp before re-arming", () => {
    expect(levelFor(0.11, s, "warn")).toBe("warn");
    expect(levelFor(0.125, s, "warn")).toBe("safe");
    expect(levelFor(0.06, s, "danger")).toBe("danger");
    expect(levelFor(0.08, s, "danger")).toBe("warn");
  });
  it("test wallet (~1.7% from liq) fires danger immediately", () => {
    expect(stepNearLiq(undefined, 0.017, s, 0).fire).toBe("danger");
  });
});
import { onAccountEvent, useAlerts } from "../src/alerts";
describe("liquidation / ADL events", () => {
  it("WS liquidation, ADL and liquidation-fill raise alerts; duplicates suppressed", () => {
    onAccountEvent("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w", { type: "liquidation", symbol: "BTC-USD", size: 0.5, price: 95000, reason: "margin shortfall" });
    onAccountEvent("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w", { type: "fill", reasonCode: 1, symbol: "BTC-USD", size: 0.5, price: 95000 });
    onAccountEvent("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w", { type: "adl", symbol: "ETH-USD", size: 1, price: 3000 });
    onAccountEvent("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w", { type: "fill", reasonCode: 0, symbol: "ETH-USD", size: 1, price: 3000 });
    const kinds = useAlerts.getState().log.map((a) => a.kind);
    expect(kinds.sort()).toEqual(["adl", "liquidation"]);
  });
});
import { sanitizeSettings, raise } from "../src/alerts";
describe("audit fixes", () => {
  it("alert settings: danger is always closer to liq than warn; bad values clamped", () => {
    const s = sanitizeSettings({ warn: 0.05, danger: 0.1, sound: true, volume: 5, cooldownMin: -3 });
    expect(s.danger).toBeLessThan(s.warn); expect(s.volume).toBe(1); expect(s.cooldownMin).toBe(1);
    expect(sanitizeSettings({ warn: NaN, danger: NaN, sound: false, volume: 0.5, cooldownMin: 10 }).warn).toBe(0.1);
  });
  it("same liquidation from WS and the 2-min riskHistory poll alerts once (15-min window)", () => {
    const before = useAlerts.getState().log.length;
    raise("liquidation", "LIQUIDATED: SOL-USD", "x", "liq:ADDR:SOL-USD");
    raise("liquidation", "LIQUIDATED: SOL-USD", "x (from poll)", "liq:ADDR:SOL-USD");
    expect(useAlerts.getState().log.length - before).toBe(1);
  });
});
