import type { Candle } from "./indicators";
export type Pivot = { i: number; price: number; kind: "high" | "low" };
/** Fractal swing pivots: a high/low that is the extreme of n bars on each side (confirmed only). */
export function pivots(c: Candle[], n = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = n; i < c.length - n; i++) {
    let hi = true, lo = true;
    for (let j = i - n; j <= i + n; j++) { if (j === i) continue; if (c[j].h >= c[i].h) hi = false; if (c[j].l <= c[i].l) lo = false; }
    if (hi) out.push({ i, price: c[i].h, kind: "high" }); if (lo) out.push({ i, price: c[i].l, kind: "low" });
  }
  return out;
}
export type Break = { i: number; dir: "bull" | "bear"; level: number; pivot: Pivot; choch: boolean };
/** Break of structure: candle close beyond the most recent confirmed swing (pivot must be confirmed before the break). */
export function structureBreaks(c: Candle[], piv: Pivot[], n = 3): Break[] {
  const out: Break[] = []; let trend: "bull" | "bear" | null = null;
  const usedHi = new Set<number>(), usedLo = new Set<number>();
  for (let i = 0; i < c.length; i++) {
    const known = piv.filter((p) => p.i + n < i);
    const lastHi = [...known].reverse().find((p) => p.kind === "high");
    const lastLo = [...known].reverse().find((p) => p.kind === "low");
    if (lastHi && !usedHi.has(lastHi.i) && c[i].c > lastHi.price) { usedHi.add(lastHi.i); out.push({ i, dir: "bull", level: lastHi.price, pivot: lastHi, choch: trend === "bear" }); trend = "bull"; }
    else if (lastLo && !usedLo.has(lastLo.i) && c[i].c < lastLo.price) { usedLo.add(lastLo.i); out.push({ i, dir: "bear", level: lastLo.price, pivot: lastLo, choch: trend === "bull" }); trend = "bear"; }
  }
  return out;
}
export type Zone = { top: number; bottom: number; i: number; kind: "OB" | "FVG"; dir: "bull" | "bear" };
/** Order block: last opposite-colour candle before the impulse that produced the break. */
export function orderBlock(c: Candle[], b: Break): Zone | null {
  for (let j = b.i; j >= Math.max(0, b.pivot.i - 1); j--) {
    const bearish = c[j].c < c[j].o, bullish = c[j].c > c[j].o;
    if (b.dir === "bull" && bearish) return { top: c[j].h, bottom: c[j].l, i: j, kind: "OB", dir: "bull" };
    if (b.dir === "bear" && bullish) return { top: c[j].h, bottom: c[j].l, i: j, kind: "OB", dir: "bear" };
  }
  return null;
}
/** Fair value gaps (3-candle imbalance), unfilled as of the last candle. */
export function fvgs(c: Candle[], from = 0): Zone[] {
  const out: Zone[] = [];
  for (let i = Math.max(2, from); i < c.length; i++) {
    if (c[i].l > c[i - 2].h) out.push({ bottom: c[i - 2].h, top: c[i].l, i: i - 1, kind: "FVG", dir: "bull" });
    if (c[i].h < c[i - 2].l) out.push({ top: c[i - 2].l, bottom: c[i].h, i: i - 1, kind: "FVG", dir: "bear" });
  }
  return out.filter((z) => !c.slice(z.i + 2).some((k) => z.dir === "bull" ? k.l <= z.bottom : k.h >= z.top));
}
/** Liquidity pools: clusters of >=2 swing highs (or lows) within tol. */
export function liquidityPools(piv: Pivot[], tol = 0.001) {
  const pools: { price: number; kind: "high" | "low"; touches: number }[] = [];
  for (const kind of ["high", "low"] as const) {
    const ps = piv.filter((p) => p.kind === kind).map((p) => p.price).sort((a, b) => a - b);
    let grp: number[] = [];
    const flush = () => { if (grp.length >= 2) pools.push({ price: grp.reduce((a, b) => a + b) / grp.length, kind, touches: grp.length }); grp = []; };
    for (const p of ps) { if (grp.length && Math.abs(p - grp[0]) / grp[0] > tol) flush(); grp.push(p); }
    flush();
  }
  return pools;
}
