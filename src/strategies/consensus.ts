/** Consensus scoring (spec §4). Agreement is CONFLUENCE, not probability of winning. */
import type { Candle } from "../ta/indicators";
import { atr } from "./ind";
import { byId } from "./catalog";
import type { Ctx, Dir, Family, Signal, StrategyId } from "./types";

export const decay = (bars: number) => Math.pow(0.5, Math.max(0, bars) / 24); // half-life 24 bars
const sgn = (d: Dir) => (d === "long" ? 1 : d === "short" ? -1 : 0);

/** Direction series of a strategy over the last `bars` closes (for the correlation guard). */
export function dirSeries(id: StrategyId, c: Candle[], ctx: Ctx, bars = 120, step = 2): number[] {
  const out: number[] = []; for (let k = c.length - bars; k <= c.length; k += step) if (k > 60) out.push(sgn(byId[id].evaluate(c.slice(0, k), { ...ctx, now: c[k - 1].t }).direction)); return out;
}
export function corr(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length); if (n < 10) return 0; const A = a.slice(-n), B = b.slice(-n);
  const ma = A.reduce((s, x) => s + x, 0) / n, mb = B.reduce((s, x) => s + x, 0) / n; let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (A[i] - ma) * (B[i] - mb); da += (A[i] - ma) ** 2; db += (B[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
/** Merge strategies whose direction series correlate >0.7 into one voting group (the first one's family). */
export function correlationGroups(ids: StrategyId[], series: Record<string, number[]>, fam: Record<string, Family>, thr = 0.7) {
  const group: Record<string, string> = Object.fromEntries(ids.map((i) => [i, fam[i]])); const merges: { a: StrategyId; b: StrategyId; r: number }[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j]; if (group[a] === group[b]) continue; const r = corr(series[a] ?? [], series[b] ?? []);
    if (r > thr) { group[b] = group[a]; merges.push({ a, b, r }); } // move only the correlated strategy, not its whole family
  }
  return { group, merges };
}

export type Cluster = { lo: number; hi: number; mid: number; score: number; families: string[]; labels: string[] };
/** 1-D clustering: sort; merge while the gap < tol. Score = number of distinct voting groups contributing (family-deduped). */
export function cluster(pts: { price: number; group: string; label: string; w?: number }[], tol: number): Cluster[] {
  const s = pts.filter((p) => Number.isFinite(p.price)).sort((a, b) => a.price - b.price); const out: Cluster[] = []; let cur: typeof s = [];
  const flush = () => { if (!cur.length) return; const fams = [...new Set(cur.map((p) => p.group))]; const wByFam = fams.map((f) => Math.max(...cur.filter((p) => p.group === f).map((p) => p.w ?? 1)));
    out.push({ lo: cur[0].price, hi: cur[cur.length - 1].price, mid: cur.reduce((a, p) => a + p.price, 0) / cur.length, score: wByFam.reduce((a, b) => a + b, 0), families: fams, labels: [...new Set(cur.map((p) => p.label))] }); cur = []; };
  for (const p of s) { if (cur.length && p.price - cur[cur.length - 1].price > tol) flush(); cur.push(p); } flush(); return out;
}

export type Label = "High" | "Medium" | "Mixed";
export type FamilyVote = { group: string; members: StrategyId[]; score: number; dir: Dir; correlated: boolean };
export type Consensus = {
  dir: Dir; C: number; agreement: number; breadth: { agree: number; active: number }; label: Label; votes: FamilyVote[];
  entry: Cluster | null; sl: number | null; tps: { price: number; rr: number; labels: string[]; score: number }[]; rejected: string | null;
  conflicts: string[]; biasDir: Dir | null; tfAgree: boolean | null; merges: { a: StrategyId; b: StrategyId; r: number }[]; atr: number; signals: Signal[];
};

export function consensus(signals: Signal[], c: Candle[], opts: { biasDir?: Dir | null; groups?: Record<string, string>; merges?: Consensus["merges"] } = {}): Consensus {
  const a = atr(c)[c.length - 1] || 0, px = c[c.length - 1].c; const group = opts.groups ?? Object.fromEntries(signals.map((s) => [s.id, s.family]));
  const g = (s: Signal) => group[s.id] ?? s.family;
  // Step 1–2: per-strategy score, family average (ticking 5 trend tools ≠ 5 votes)
  const fams = [...new Set(signals.map(g))];
  const votes: FamilyVote[] = fams.map((f) => { const ms = signals.filter((s) => g(s) === f); const sc = ms.reduce((acc, s) => acc + sgn(s.direction) * s.strength * decay(s.freshnessBars), 0) / ms.length;
    return { group: f, members: ms.map((s) => s.id), score: sc, dir: ms.some((s) => s.direction !== "neutral") ? (sc > 0.02 ? "long" : sc < -0.02 ? "short" : "neutral") : "neutral", correlated: ms.length > 1 }; });
  const active = votes.filter((v) => signals.some((s) => g(s) === v.group && s.direction !== "neutral"));
  const C = active.length ? active.reduce((s, v) => s + v.score, 0) / active.length : 0; const dir: Dir = C > 0.02 ? "long" : C < -0.02 ? "short" : "neutral";
  const sideW = (d: Dir) => active.filter((v) => v.dir === d).reduce((s, v) => s + Math.abs(v.score), 0); const tot = sideW("long") + sideW("short");
  const agreement = dir === "neutral" || !tot ? 0 : sideW(dir) / tot; const agreeN = active.filter((v) => v.dir === dir).length;
  // Step 4: zone confluence
  const tol = 0.25 * a; const side = signals.filter((s) => s.direction === dir);
  const entryPts = side.flatMap((s) => s.entry ? [{ price: (s.entry.lo + s.entry.hi) / 2, group: g(s), label: byId[s.id].name, w: s.strength }] : [])
    .concat(signals.flatMap((s) => s.levels.filter((l) => !l.side || l.side === dir).map((l) => ({ price: l.price, group: g(s), label: l.label, w: 0.5 }))).filter((p) => (dir === "long" ? p.price <= px + a : p.price >= px - a)));
  const entries = cluster(entryPts, tol).sort((x, y) => y.score - x.score || Math.abs(x.mid - px) - Math.abs(y.mid - px));
  const entry = dir === "neutral" ? null : entries[0] ?? null;
  let sl: number | null = null; const tps: Consensus["tps"] = []; let rejected: string | null = null;
  if (entry) {
    const sls = side.map((s) => s.sl).filter((v): v is number => v != null && (dir === "long" ? v < entry.lo : v > entry.hi));
    const far = sls.length ? (dir === "long" ? Math.min(...sls) : Math.max(...sls)) : (dir === "long" ? entry.lo - 1.5 * a : entry.hi + 1.5 * a);
    const slC = cluster(sls.map((p) => ({ price: p, group: "sl", label: "SL" })), tol); const beyond = slC.length ? (dir === "long" ? Math.min(...slC.map((z) => z.lo)) : Math.max(...slC.map((z) => z.hi))) : far;
    sl = dir === "long" ? beyond - 0.2 * a : beyond + 0.2 * a;
    const ep = entry.mid, risk = Math.abs(ep - sl);
    const tpPts = side.flatMap((s) => s.tp.map((p, i) => ({ price: p, group: g(s), label: `${byId[s.id].name} TP${i + 1}`, w: s.strength })))
      .concat(signals.flatMap((s) => s.levels.filter((l) => l.kind === "static").map((l) => ({ price: l.price, group: g(s), label: l.label, w: 0.4 }))))
      .filter((p) => (dir === "long" ? p.price > ep + 0.3 * a : p.price < ep - 0.3 * a));
    for (const z of cluster(tpPts, tol).sort((x, y) => (dir === "long" ? x.mid - y.mid : y.mid - x.mid)).slice(0, 6)) tps.push({ price: z.mid, rr: risk ? Math.abs(z.mid - ep) / risk : 0, labels: z.labels, score: z.score });
    const ladder = tps.filter((t) => t.score >= 1 || t.rr >= 1.2).slice(0, 3); tps.splice(0, tps.length, ...ladder);
    if (!tps.length || tps[0].rr < 1.2) rejected = `TP1 ${tps.length ? tps[0].rr.toFixed(2) + "R" : "missing"} < 1.2R: not worth the risk`;
  }
  // labels + conflicts
  const conflicts: string[] = [];
  const longF = active.filter((v) => v.dir === "long"), shortF = active.filter((v) => v.dir === "short");
  if (Math.abs(C) < 0.2 && longF.length >= 2 && shortF.length >= 2) conflicts.push(`${longF.map((v) => fl(v.group)).join(" + ")} say long, ${shortF.map((v) => fl(v.group)).join(" + ")} say short`);
  const strongOpp = active.filter((v) => v.dir !== dir && v.dir !== "neutral" && Math.abs(v.score) >= 0.7 * maxAbs(active)); if (dir !== "neutral" && strongOpp.length) conflicts.push(`${strongOpp.map((v) => fl(v.group)).join(", ")} strongly ${strongOpp[0].dir === "long" ? "long" : "short"}`);
  const biasDir = opts.biasDir ?? null; const tfAgree = biasDir == null || biasDir === "neutral" || dir === "neutral" ? null : biasDir === dir;
  if (tfAgree === false) conflicts.push(`4h bias is ${biasDir}, 15m consensus is ${dir}`);
  if (entry && dir !== "neutral") { const opp = cluster(signals.filter((s) => s.direction !== dir && s.direction !== "neutral" && s.entry).map((s) => ({ price: (s.entry!.lo + s.entry!.hi) / 2, group: g(s), label: byId[s.id].name })), tol).filter((z) => z.score >= 2);
    if (opp.some((z) => entry.mid >= z.lo - tol && entry.mid <= z.hi + tol)) conflicts.push("consensus entry sits inside an opposing high-score zone"); }
  let label: Label = agreement >= 0.75 && agreeN >= 3 && (entry?.families.length ?? 0) >= 3 ? "High" : agreement >= 0.6 ? "Medium" : "Mixed";
  if (dir === "neutral") label = "Mixed";
  if (tfAgree === false) label = "Mixed"; // 4h/15m disagreement caps confidence at the lowest level
  return { dir, C, agreement, breadth: { agree: agreeN, active: active.length }, label, votes, entry, sl, tps, rejected, conflicts, biasDir, tfAgree, merges: opts.merges ?? [], atr: a, signals };
}
const maxAbs = (v: FamilyVote[]) => Math.max(0.0001, ...v.map((x) => Math.abs(x.score)));
const FL: Record<string, string> = { trend: "Trend", momentum: "Momentum", structure: "Structure", volatility: "Volatility", volume: "Volume", positioning: "Positioning" };
const fl = (g: string) => FL[g] ?? g;

/** Full run: evaluate ticked strategies on the entry TF (15m) and bias TF (4h), with the correlation guard. */
export function runConsensus(ids: StrategyId[], ltf: Candle[], htf: Candle[], ctx: Ctx, opts: { correlation?: boolean } = {}) {
  const sigs = ids.map((id) => byId[id].evaluate(ltf, ctx)); const fam = Object.fromEntries(sigs.map((s) => [s.id, s.family])) as Record<string, Family>;
  let groups: Record<string, string> | undefined, merges: Consensus["merges"] = [];
  if (opts.correlation !== false && ids.length > 1) { const series = Object.fromEntries(ids.map((id) => [id, dirSeries(id, ltf, ctx)])); const r = correlationGroups(ids, series, fam); groups = r.group; merges = r.merges; }
  const biasSigs = ids.filter((id) => id !== "funding").map((id) => byId[id].evaluate(htf, ctx)); const bias = consensus(biasSigs, htf);
  return consensus(sigs, ltf, { biasDir: bias.dir, groups, merges });
}
