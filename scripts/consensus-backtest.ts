/** Backtest of the Strategy Picker consensus on Hyperliquid candles (history only; the app's live data stays Bulk).
 *  usage: tsx scripts/consensus-backtest.ts <dataDir> <entryTf 15m|1h> [stride]  — no parameters are fitted, so no walk-forward split is needed. */
import fs from "fs";
import { runConsensus } from "../src/strategies/consensus";
import { STRATEGIES } from "../src/strategies/catalog";
import type { Candle } from "../src/ta/indicators";
const [dir, tf = "15m", strideArg = "4"] = process.argv.slice(2); const stride = +strideArg;
const load = (s: string, i: string): Candle[] => JSON.parse(fs.readFileSync(`${dir}/${s}-${i}.json`, "utf8")).map((k: any) => ({ t: +k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }));
const ids = STRATEGIES.map((s) => s.id).filter((id) => id !== "funding"); // no funding/OI history to replay
const FEE = 0.00035, WIN = tf === "15m" ? 384 : 400, PENDING = 16, MAXHOLD = 96;
type T = { sym: string; label: string; agree: number; dir: string; r: number; win: boolean; outcome: string; t: number };
const trades: T[] = []; let signals = 0, rejected = 0, neutral = 0, unfilled = 0;
for (const sym of ["BTC-USD", "ETH-USD", "SOL-USD"]) {
  const c = load(sym, tf), h4 = load(sym, "4h"); let busyUntil = 0; const t0 = Date.now();
  for (let i = WIN; i < c.length - 1; i += stride) {
    if (i < busyUntil) continue;
    const win = c.slice(i - WIN, i); const tNow = win[win.length - 1].t; const hh = h4.filter((k) => k.t + 4 * 36e5 <= tNow + (tf === "15m" ? 9e5 : 36e5)).slice(-240);
    if (hh.length < 120) continue;
    const r = runConsensus(ids, win, hh, { now: tNow });
    if (r.dir === "neutral" || !r.entry) { neutral++; continue; } if (r.rejected || !r.tps.length || r.sl == null) { rejected++; continue; } signals++;
    const long = r.dir === "long", e = r.entry.mid, sl = r.sl, tp = r.tps[0].price, risk = Math.abs(e - sl); if (!(risk > 0)) continue;
    let fill = -1; for (let j = i; j < Math.min(c.length, i + PENDING); j++) if (c[j].l <= e && c[j].h >= e) { fill = j; break; }
    if (fill < 0) { unfilled++; continue; }
    let out = "timeout", R = 0, exitJ = Math.min(c.length - 1, fill + MAXHOLD);
    for (let j = fill; j <= exitJ; j++) { const hitSL = long ? c[j].l <= sl : c[j].h >= sl, hitTP = long ? c[j].h >= tp : c[j].l <= tp;
      if (hitSL) { out = "sl"; R = -1; exitJ = j; break; } if (hitTP) { out = "tp"; R = Math.abs(tp - e) / risk; exitJ = j; break; } }
    if (out === "timeout") R = ((long ? 1 : -1) * (c[exitJ].c - e)) / risk;
    R -= (2 * FEE * e) / risk; busyUntil = exitJ + 1;
    trades.push({ sym, label: r.label, agree: r.agreement, dir: r.dir, r: R, win: out === "tp", outcome: out, t: tNow });
  }
  console.error(sym, "done", ((Date.now() - t0) / 1000).toFixed(0) + "s", trades.filter((x) => x.sym === sym).length, "trades");
}
const agg = (xs: T[]) => ({ n: xs.length, win: xs.length ? xs.filter((x) => x.win).length / xs.length : 0, avgR: xs.length ? xs.reduce((s, x) => s + x.r, 0) / xs.length : 0, timeouts: xs.filter((x) => x.outcome === "timeout").length });
const fmt = (k: string, a: ReturnType<typeof agg>) => `${k.padEnd(18)} n=${String(a.n).padStart(4)}  TP1 hit ${(a.win * 100).toFixed(1).padStart(5)}%  avg ${(a.avgR >= 0 ? "+" : "") + a.avgR.toFixed(3)}R  (timeouts ${a.timeouts})`;
const span = `${new Date(trades[0]?.t ?? 0).toISOString().slice(0, 10)} → ${new Date(trades.at(-1)?.t ?? 0).toISOString().slice(0, 10)}`;
const lines = [`Consensus backtest · Hyperliquid ${tf} entry / 4h bias · BTC+ETH+SOL · ${span} · stride ${stride} bars · fee ${FEE * 100}%/side`, `signals ${signals}, rejected (TP1<1.2R etc.) ${rejected}, no-direction ${neutral}, unfilled ${unfilled}`,
  fmt("ALL", agg(trades)), ...(["High", "Medium", "Mixed"] as const).map((l) => fmt(l, agg(trades.filter((x) => x.label === l)))),
  ...[[0, 0.6], [0.6, 0.75], [0.75, 1.01]].map(([a, b]) => fmt(`agree ${a * 100}-${Math.min(100, b * 100)}%`, agg(trades.filter((x) => x.agree >= a && x.agree < b)))),
  fmt("long", agg(trades.filter((x) => x.dir === "long"))), fmt("short", agg(trades.filter((x) => x.dir === "short"))),
  ...["BTC-USD", "ETH-USD", "SOL-USD"].map((s) => fmt(s, agg(trades.filter((x) => x.sym === s))))];
console.log(lines.join("\n"));
fs.writeFileSync(`docs/consensus-backtest-${tf}.txt`, lines.join("\n") + "\n");
fs.writeFileSync(`docs/consensus-backtest-${tf}.json`, JSON.stringify({ tf, span, byLabel: Object.fromEntries((["High", "Medium", "Mixed"] as const).map((l) => [l, agg(trades.filter((x) => x.label === l))])), all: agg(trades) }));
