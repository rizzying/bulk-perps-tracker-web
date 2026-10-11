import { client } from "../../src/api/client";
import { findSide } from "../../src/strategies/side";
import { PRESETS } from "../../src/strategies/catalog";
(async () => { const now = Date.now(); const sets: Record<string, any[]> = { "dema only": ["dema"], "rsi only": ["rsi"], "funding only": ["funding"], ...PRESETS };
for (const s of ["BTC-USD", "ETH-USD", "SOL-USD"]) { const l = (await client.klines(s, "15m", now - 4 * 864e5)).slice(0, -1), h = (await client.klines(s, "4h", now - 60 * 864e5)).slice(0, -1), h1 = (await client.klines(s, "1h", now - 21 * 864e5)).slice(0, -1);
  for (const [nm, ids] of Object.entries(sets)) for (const side of ["long", "short"] as const) { const r = findSide(ids, l, h, { now, h1, h4: h }, side, 3);
    const bad = r.zones.filter((z) => (side === "long" ? !(z.sl < z.entry.lo) : !(z.sl > z.entry.hi)) || z.rr2 < z.rr1);
    console.log(s.padEnd(8), nm.padEnd(26), side.padEnd(5), `zones ${r.zones.length}`, r.zones.map((z) => `${z.structureOnly ? "S" : "C"}${z.status[0]} ${z.entry.mid.toFixed(1)} ${z.rr2.toFixed(1)}R`).join(" | "), bad.length ? "BAD" : "", r.fillNote); } } })();
