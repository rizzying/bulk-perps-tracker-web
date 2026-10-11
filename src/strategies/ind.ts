import type { Candle } from "../ta/indicators";
export { ema, rsi, atr } from "../ta/indicators";
import { ema, atr } from "../ta/indicators";
export const sma = (x: number[], n: number) => x.map((_, i) => { if (i < n - 1) return NaN; let s = 0; for (let j = i - n + 1; j <= i; j++) s += x[j]; return s / n; });
export const stdev = (x: number[], n: number) => { const m = sma(x, n); return x.map((_, i) => { if (i < n - 1) return NaN; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (x[j] - m[i]) ** 2; return Math.sqrt(s / n); }); };
export function macd(x: number[], f = 12, s = 26, sig = 9) { const a = ema(x, f), b = ema(x, s); const m = x.map((_, i) => a[i] - b[i]); const valid = m.map((v) => (isNaN(v) ? 0 : v)); const sg = ema(valid, sig); return { macd: m, signal: sg, hist: m.map((v, i) => v - sg[i]) }; }
export function bollinger(x: number[], n = 20, k = 2) { const m = sma(x, n), sd = stdev(x, n); return { mid: m, up: m.map((v, i) => v + k * sd[i]), lo: m.map((v, i) => v - k * sd[i]), bw: m.map((v, i) => (2 * k * sd[i]) / v) }; }
/** Wilder ADX */
export function adx(c: Candle[], n = 14): number[] {
  const out = new Array(c.length).fill(NaN); if (c.length < 2 * n + 1) return out;
  let tr = 0, pdm = 0, ndm = 0; const dx: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l; const t = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    if (i <= n) { tr += t; pdm += p; ndm += m; if (i < n) continue; } else { tr = tr - tr / n + t; pdm = pdm - pdm / n + p; ndm = ndm - ndm / n + m; }
    const pdi = (100 * pdm) / tr, ndi = (100 * ndm) / tr; dx.push((100 * Math.abs(pdi - ndi)) / (pdi + ndi || 1));
    if (dx.length === n) out[i] = dx.reduce((a, b) => a + b, 0) / n; else if (dx.length > n) out[i] = (out[i - 1] * (n - 1) + dx[dx.length - 1]) / n;
  }
  return out;
}
/** Supertrend: returns line and direction (+1 bull, -1 bear) */
export function supertrend(c: Candle[], n = 10, mult = 3) {
  const a = atr(c, n); const line = new Array(c.length).fill(NaN), dir = new Array(c.length).fill(0);
  let fu = NaN, fl = NaN, d = 1;
  for (let i = 0; i < c.length; i++) {
    if (isNaN(a[i])) continue; const hl2 = (c[i].h + c[i].l) / 2; const bu = hl2 + mult * a[i], bl = hl2 - mult * a[i];
    fu = isNaN(fu) || bu < fu || c[i - 1]?.c > fu ? bu : fu; fl = isNaN(fl) || bl > fl || c[i - 1]?.c < fl ? bl : fl;
    if (d === 1 && c[i].c < fl) d = -1; else if (d === -1 && c[i].c > fu) d = 1;
    dir[i] = d; line[i] = d === 1 ? fl : fu;
  }
  return { line, dir };
}
/** Session VWAP (reset 00:00 UTC) with 1σ/2σ bands (volume-weighted stdev of typical price). */
export function sessionVwap(c: Candle[]) {
  const v = new Array(c.length).fill(NaN), sd = new Array(c.length).fill(NaN); let pv = 0, vv = 0, p2 = 0, day = -1;
  for (let i = 0; i < c.length; i++) { const d = Math.floor(c[i].t / 864e5); if (d !== day) { day = d; pv = vv = p2 = 0; } const tp = (c[i].h + c[i].l + c[i].c) / 3, w = Math.max(c[i].v, 1e-12); pv += tp * w; vv += w; p2 += tp * tp * w; v[i] = pv / vv; sd[i] = Math.sqrt(Math.max(0, p2 / vv - v[i] ** 2)); }
  return { vwap: v, sd };
}
export function anchoredVwap(c: Candle[], from: number) { let pv = 0, vv = 0; for (let i = Math.max(0, from); i < c.length; i++) { const tp = (c[i].h + c[i].l + c[i].c) / 3; pv += tp * c[i].v; vv += c[i].v; } return vv > 0 ? pv / vv : NaN; }
export const highest = (c: Candle[], end: number, n: number) => { let m = -Infinity; for (let i = Math.max(0, end - n); i < end; i++) m = Math.max(m, c[i].h); return m; };
export const lowest = (c: Candle[], end: number, n: number) => { let m = Infinity; for (let i = Math.max(0, end - n); i < end; i++) m = Math.min(m, c[i].l); return m; };
