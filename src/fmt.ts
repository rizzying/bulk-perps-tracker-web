export const usd = (n: number, d = 2) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const sgnUsd = (n: number) => (n > 0 ? "+" : "") + usd(n);
export const pct = (n: number, d = 2) => (n * 100).toFixed(d) + "%";
export const px = (n: number) => n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(4) : n.toPrecision(5);
export const short = (a: string) => a.slice(0, 4) + "…" + a.slice(-4);
export const cls = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
export const fund = (n: number) => (n > 0 ? "+" : "") + usd(n, Math.abs(n) < 1 ? 4 : 2);
