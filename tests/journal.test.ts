import { describe, it, expect } from "vitest";
import { fromPosition, mergeImport, applyEdit, importKey, newManual, BulkClosedPosition } from "../src/journal/model";
import { LocalRepo } from "../src/journal/repo";
import { importWallets } from "../src/journal/importer";

const mem = () => { const m: Record<string, string> = {}; return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; } }; };
const P: BulkClosedPosition = { symbol: "PUMP-USD", quantity: -10413.36712068, maxQuantity: -10413.36712068, totalVolume: 20826.73, avgOpenPrice: 0.006291, avgClosePrice: 0.005727,
  realizedPnl: 5.873139, fees: -0.043802, funding: 0.0078, openTime: 1791428067367630148, closeTime: 1791461608263592879, closeSlot: 402246946, closeReason: "normal", iso: false };

describe("journal model", () => {
  it("maps a Bulk closed position; short from negative qty; leverage derived from current setting and marked", () => {
    const r = fromPosition("W", P, { "PUMP-USD": 10 });
    expect(r.id).toBe(importKey("W", P)); expect(r.side).toBe("short"); expect(r.entry).toBe(0.006291); expect(r.close).toBe(0.005727); expect(r.pnl).toBe(5.873139);
    expect(r.leverage).toBe(10); expect(r.levDerived).toBe("setting"); expect(r.date).toBe(Math.round(P.closeTime / 1e6));
    expect(fromPosition("W", P).leverage).toBeNull();
    expect(fromPosition("W", { ...P, leverage: 7 }, { "PUMP-USD": 10 })).toMatchObject({ leverage: 7, levDerived: "" });
  });
  it("re-import keeps notes and user-edited fields, refreshes the rest", () => {
    let r = fromPosition("W", P, { "PUMP-USD": 10 });
    r = applyEdit(r, "notes", "faded the pump"); r = applyEdit(r, "leverage", "5");
    expect(r.edited).toEqual(["leverage"]); expect(r.levDerived).toBe("");
    const inc = fromPosition("W", { ...P, realizedPnl: 6, leverage: undefined }, { "PUMP-USD": 20 });
    const m = mergeImport(r, inc);
    expect(m.notes).toBe("faded the pump"); expect(m.leverage).toBe(5); expect(m.pnl).toBe(6); expect(m.id).toBe(r.id);
  });
  it("deleted imported rows stay deleted (tombstone) and manual rows are free-form", () => {
    const r = { ...fromPosition("W", P), deleted: true };
    expect(mergeImport(r, fromPosition("W", P)).deleted).toBe(true);
    const m = applyEdit(applyEdit(newManual(), "entry", "100"), "side", "short");
    expect(m.entry).toBe(100); expect(m.side).toBe("short"); expect(m.edited).toEqual([]);
    expect(applyEdit(m, "close", "abc").close).toBeNull();
  });
  it("LocalRepo round-trips", async () => {
    const repo = new LocalRepo("k", mem()); const r = fromPosition("W", P); await repo.put([r]);
    expect((await repo.get(r.id))?.pnl).toBe(P.realizedPnl); await repo.remove(r.id); expect(await repo.all()).toHaveLength(0);
  });
});

describe.skipIf(!process.env.LIVE)("live import (test wallet)", () => {
  it("imports B63A9… closed positions, re-import is idempotent and keeps notes", async () => {
    const W = "B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w"; const repo = new LocalRepo("j", mem());
    const [a] = await importWallets(repo, [W]); console.log("first import", a);
    expect(a.error).toBeUndefined(); expect(a.added).toBe(a.fetched); expect(a.fetched).toBeGreaterThan(0);
    const all = await repo.all(); const r0 = all[0]; await repo.put([applyEdit(r0, "notes", "test note")]);
    const [b] = await importWallets(repo, [W]); console.log("re-import", b);
    expect(b.added).toBe(0); expect(new Set((await repo.all()).map((r) => r.id)).size).toBe(a.fetched); // no key collisions expect((await repo.all()).length).toBe(a.fetched); expect((await repo.get(r0.id))?.notes).toBe("test note");
    const rows = await repo.all(); const by = (k: (r: any) => string) => rows.reduce((m: any, r) => ((m[k(r)] = (m[k(r)] ?? 0) + 1), m), {});
    console.log("by market", by((r) => r.market), "by side", by((r) => r.side), "pnl sum", rows.reduce((s, r) => s + (r.pnl ?? 0), 0).toFixed(2),
      "range", new Date(rows.at(-1)!.date).toISOString(), "→", new Date(rows[0].date).toISOString(), "lev derived", rows.filter((r) => r.levDerived === "setting").length, "iso", rows.filter((r) => r.extra.iso).length);
    console.log("sample", JSON.stringify(rows[0]));
  }, 300_000);
});
