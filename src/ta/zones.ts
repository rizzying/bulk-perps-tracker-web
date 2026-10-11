import { Candle, atr } from "./indicators";
import { pivots, structureBreaks, orderBlock, fvgs, liquidityPools } from "./smc";

/** Higher-timeframe swing zones (1h / 4h). Shorts use supply above price, longs use demand below. */
export type TF = "1h" | "4h";
export type Member = { tf: TF; kind: "swing" | "OB" | "FVG" | "pool"; top: number; bottom: number; touches: number };
export type HtfZone = { top: number; bottom: number; mid: number; score: number; members: Member[]; tf: TF; label: string; distPct: number };
const W: Record<TF, number> = { "1h": 1, "4h": 2 };
const KW: Record<Member["kind"], number> = { swing: 1.5, OB: 1.5, FVG: 1, pool: 1 };

function membersFor(c: Candle[], tf: TF, side: "supply" | "demand", price: number): Member[] {
  if (c.length < 20) return [];
  const a = atr(c, 14).at(-1)!; const out: Member[] = [];
  const piv = pivots(c, 3);
  // unmitigated: no later close beyond the zone's far edge
  const alive = (i: number, top: number, bottom: number) => !c.slice(i + 1).some((k) => side === "supply" ? k.c > top : k.c < bottom);
  for (const p of piv) {
    if (side === "supply" && p.kind === "high") {
      const k = c[p.i]; let bottom = Math.max(k.o, k.c); if (k.h - bottom < 0.25 * a) bottom = k.h - 0.25 * a;
      if (alive(p.i, k.h, bottom)) out.push({ tf, kind: "swing", top: k.h, bottom, touches: 1 });
    }
    if (side === "demand" && p.kind === "low") {
      const k = c[p.i]; let top = Math.min(k.o, k.c); if (top - k.l < 0.25 * a) top = k.l + 0.25 * a;
      if (alive(p.i, top, k.l)) out.push({ tf, kind: "swing", top, bottom: k.l, touches: 1 });
    }
  }
  for (const b of structureBreaks(c, piv, 3)) {
    if ((side === "supply" && b.dir === "bear") || (side === "demand" && b.dir === "bull")) {
      const z = orderBlock(c, b); if (z && alive(z.i, z.top, z.bottom)) out.push({ tf, kind: "OB", top: z.top, bottom: z.bottom, touches: 1 });
    }
  }
  for (const z of fvgs(c)) if ((side === "supply" && z.dir === "bear") || (side === "demand" && z.dir === "bull")) out.push({ tf, kind: "FVG", top: z.top, bottom: z.bottom, touches: 1 });
  for (const q of liquidityPools(piv, 0.0015)) if ((side === "supply" && q.kind === "high") || (side === "demand" && q.kind === "low"))
    out.push({ tf, kind: "pool", top: q.price + 0.15 * a, bottom: q.price - 0.15 * a, touches: q.touches });
  // right side of price only, and not absurdly far (bad prints / ancient levels)
  return out.filter((m) => (side === "supply" ? m.bottom > price : m.top < price) && Math.abs((m.top + m.bottom) / 2 - price) / price < 0.12);
}

/** Cluster overlapping members into zones and score them by timeframe, confluence and touches. */
export function htfZones(h1: Candle[], h4: Candle[], side: "supply" | "demand", price: number, minDistAtr = 1): HtfZone[] {
  const a1 = h1.length > 15 ? atr(h1, 14).at(-1)! : h4.length > 15 ? atr(h4, 14).at(-1)! / 2 : price * 0.003;
  const a4 = h4.length > 15 ? atr(h4, 14).at(-1)! : a1 * 2;
  const ms = [...membersFor(h1, "1h", side, price), ...membersFor(h4, "4h", side, price)].sort((x, y) => W[y.tf] - W[x.tf] || (x.top + x.bottom) - (y.top + y.bottom)); // 4h members seed clusters first
  // Seed-centred clustering on member midpoints (no chaining): a member joins a cluster if its mid is
  // within tol of the cluster's running weighted centre.
  const clusters: Member[][] = []; const centres: number[] = [];
  const tol = 0.35 * a4; const mid = (m: Member) => (m.top + m.bottom) / 2;
  for (const m of ms) {
    let bi = -1, bd = Infinity;
    centres.forEach((c, i) => { const d = Math.abs(mid(m) - c); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0 && bd <= tol) { clusters[bi].push(m); const w = clusters[bi].reduce((s, x) => s + W[x.tf], 0); centres[bi] = clusters[bi].reduce((s, x) => s + W[x.tf] * mid(x), 0) / w; }
    else { clusters.push([m]); centres.push(mid(m)); }
  }
  // entries must be at swing positions: a zone needs a swing, OB or liquidity pool (pure FVG clusters are dropped)
  return clusters.filter((cl) => cl.some((m) => m.kind !== "FVG")).map((cl) => {
    const score = cl.reduce((s, m) => s + W[m.tf] * KW[m.kind] * Math.min(3, m.touches), 0);
    // weighted centre, width capped to ~1 × 4h ATR so a zone stays tradable
    const wsum = cl.reduce((s, m) => s + W[m.tf], 0);
    const zmid = cl.reduce((s, m) => s + W[m.tf] * (m.top + m.bottom) / 2, 0) / wsum;
    let top = Math.min(Math.max(...cl.map((m) => m.top)), zmid + 0.4 * a4), bottom = Math.max(Math.min(...cl.map((m) => m.bottom)), zmid - 0.4 * a4);
    if (top - bottom < 0.2 * a1) { top = zmid + 0.1 * a1; bottom = zmid - 0.1 * a1; }
    const tf: TF = cl.some((m) => m.tf === "4h") ? "4h" : "1h";
    const kinds = [...new Set(cl.map((m) => `${m.tf} ${m.kind}`))];
    const touches = cl.reduce((s, m) => s + m.touches, 0);
    return { top, bottom, mid: zmid, score: Math.round(score * 10) / 10, members: cl, tf, label: `${kinds.join(" + ")} (${touches} touch${touches > 1 ? "es" : ""})`, distPct: Math.abs(zmid - price) / price };
  }).filter((z) => (side === "supply" ? z.bottom - price : price - z.top) >= -0.0 || (price >= z.bottom && price <= z.top))
    .filter((z) => Math.abs(z.mid - price) >= minDistAtr * a1 || (price >= z.bottom && price <= z.top));
}

/** Opposite-side swing/liquidity levels for targets (unbroken 1h/4h swing lows for shorts, highs for longs). */
export function targetLevels(h1: Candle[], h4: Candle[], dir: "long" | "short", from: number): { price: number; label: string }[] {
  const out: { price: number; label: string }[] = [];
  for (const [c, tf] of [[h1, "1h"], [h4, "4h"]] as const) {
    if (c.length < 10) continue;
    for (const p of pivots(c, 3)) {
      if (dir === "short" && p.kind === "low" && p.price < from && !c.slice(p.i + 1).some((k) => k.c < p.price)) out.push({ price: p.price, label: `${tf} swing low` });
      if (dir === "long" && p.kind === "high" && p.price > from && !c.slice(p.i + 1).some((k) => k.c > p.price)) out.push({ price: p.price, label: `${tf} swing high` });
    }
    for (const q of liquidityPools(pivots(c, 3), 0.0015)) {
      if (dir === "short" && q.kind === "low" && q.price < from) out.push({ price: q.price, label: `${tf} equal lows (${q.touches})` });
      if (dir === "long" && q.kind === "high" && q.price > from) out.push({ price: q.price, label: `${tf} equal highs (${q.touches})` });
    }
  }
  return out.filter((t) => Math.abs(t.price - from) / from < 0.15).sort((x, y) => dir === "short" ? y.price - x.price : x.price - y.price);
}
