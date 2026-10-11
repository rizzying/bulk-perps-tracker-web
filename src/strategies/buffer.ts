/** Rolling funding/OI buffer in localStorage (no DB): one sample per 10 min per symbol, 14 days. */
const K = (s: string) => `bpt.fundBuf.v1.${s}`;
type Pt = { t: number; f: number; oi: number };
export const readBuf = (s: string): Pt[] => { try { return JSON.parse(localStorage.getItem(K(s)) || "[]"); } catch { return []; } };
export function pushBuf(s: string, f: number, oi: number, now = Date.now()) {
  const b = readBuf(s); if (b.length && now - b[b.length - 1].t < 10 * 60_000) return b;
  const nb = [...b, { t: now, f, oi }].filter((p) => p.t > now - 14 * 864e5); try { localStorage.setItem(K(s), JSON.stringify(nb)); } catch { /* quota */ } return nb;
}
/** Percentile of the current funding within the buffer (null until 24 samples), OI change vs ~6h ago. */
export function fundingCtx(s: string, f: number, oi: number, now = Date.now()) {
  const b = pushBuf(s, f, oi, now); const pct = b.length >= 24 ? b.filter((p) => p.f <= f).length / b.length : null;
  const old = [...b].reverse().find((p) => p.t <= now - 6 * 36e5); const changePct = old && old.oi > 0 ? ((oi - old.oi) / old.oi) * 100 : null;
  return { funding: { rate: f, pct }, oi: { changePct }, samples: b.length };
}
