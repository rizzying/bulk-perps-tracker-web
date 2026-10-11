import { client } from "../../src/api/client";
import { findSide } from "../../src/strategies/side";
import { STRATEGIES } from "../../src/strategies/catalog";
(async () => { const now = Date.now();
for (const s of ["BTC-USD", "ETH-USD", "SOL-USD"]) { const l = (await client.klines(s, "15m", now - 4 * 864e5)).slice(0, -1), h = (await client.klines(s, "4h", now - 60 * 864e5)).slice(0, -1);
  for (const side of ["long", "short"] as const) { const t = performance.now(); const r = findSide(STRATEGIES.map((x) => x.id), l, h, { now }, side, 3);
    console.log(s, side, `${(performance.now() - t).toFixed(0)}ms`, r.status, r.label, `agree ${(r.agreement * 100).toFixed(0)}% ${r.breadth.agree}/${r.breadth.active}`, "px", l.at(-1)!.c, "entry", r.entry && `${r.entry.lo.toFixed(1)}-${r.entry.hi.toFixed(1)} [${r.entry.labels.join(",")}]`, "sl", r.sl?.toFixed(1), "tp", r.tp1?.toFixed(1), r.rr1.toFixed(2), r.tp2?.toFixed(1), r.rr2.toFixed(2), "\n   wait:", r.waitFor.join(" | "), "\n   opp:", r.opposing.join("; ")); } } })();
