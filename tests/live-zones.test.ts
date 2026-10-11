import { it } from "vitest";
import fs from "fs";
import { evaluateSetup, DEFAULT_EMA } from "../src/ta/setup";
const L = (s: string, tf: string) => JSON.parse(fs.readFileSync(`/tmp/kl/${s}-${tf}.json`, "utf8")).map((k: any) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }));
it.runIf(fs.existsSync("/tmp/kl/BTC-USD-4h.json"))("live zones", () => {
  for (const s of ["BTC-USD", "ETH-USD", "SOL-USD"]) for (const m of ["long", "short"] as const) {
    const r = evaluateSetup(s, L(s, "4h"), L(s, "15m"), true, DEFAULT_EMA, m, { h1: L(s, "1h") });
    const p = r.best.plan;
    console.log(`${s} ${m} price ${r.price.toFixed(2)} ${r.verdict} ${r.best.alignment} conf ${r.best.confidence}`);
    p?.candidates.forEach((c) => console.log(`  ${c.best ? "*" : " "} zone ${c.zone.bottom.toFixed(2)}-${c.zone.top.toFixed(2)} [${c.zone.label}] score ${c.zone.score} dist ${(c.zone.distPct*100).toFixed(2)}% entry ${c.entryPx.toFixed(2)} SL ${c.stop.toFixed(2)} TP1 ${c.tp1.toFixed(2)} (${c.tp1Label}) TP2 ${c.tp2.toFixed(2)} (${c.tp2Label}) ${c.rr.toFixed(2)}R`));
  }
});
