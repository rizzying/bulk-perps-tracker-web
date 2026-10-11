import { client } from "../../src/api/client";
import { runConsensus } from "../../src/strategies/consensus";
import { STRATEGIES } from "../../src/strategies/catalog";
const now = Date.now();
for (const s of ["BTC-USD", "ETH-USD", "SOL-USD"]) {
  const ltf = await client.klines(s, "15m", now - 4 * 864e5), htf = await client.klines(s, "4h", now - 60 * 864e5);
  const t0 = performance.now(); const r = runConsensus(STRATEGIES.map((x) => x.id), ltf.slice(0, -1), htf.slice(0, -1), { now });
  console.log(s, `bars ${ltf.length}/${htf.length}`, `${(performance.now() - t0).toFixed(0)}ms`, r.dir, r.label, `agree ${(r.agreement * 100).toFixed(0)}% breadth ${r.breadth.agree}/${r.breadth.active}`, "bias", r.biasDir, "entry", r.entry && `${r.entry.lo.toFixed(1)}-${r.entry.hi.toFixed(1)} [${r.entry.labels.join(",")}]`, "sl", r.sl?.toFixed(1), "tps", r.tps.map((t) => `${t.price.toFixed(1)}(${t.rr.toFixed(1)}R)`).join(" "), r.rejected ?? "", "| conflicts:", r.conflicts.join("; "), "| merges:", r.merges.map((m) => `${m.a}~${m.b} ${m.r.toFixed(2)}`).join(" "));
  console.log("   ", r.signals.map((x) => `${x.id}:${x.direction}${x.direction !== "neutral" ? "/" + x.strength.toFixed(2) : ""}`).join(" "));
}
