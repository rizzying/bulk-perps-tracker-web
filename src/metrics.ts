import type { TFullAccount, TPosition } from "./api/types";
// Verified 2026-10-10: margin.totalMargin excludes uPnL -> equity = totalMargin + unrealizedPnl.
export function accountSummary(a: TFullAccount) {
  const m = a.margin;
  const equity = m.totalMargin + m.unrealizedPnl;
  return {
    equity, balance: m.totalMargin, upnl: m.unrealizedPnl, realized: m.realizedPnl, fees: m.fees, funding: m.funding,
    notional: m.notional, available: m.availableMargin, marginUsed: m.marginUsed,
    marginUsedPct: equity > 0 ? m.marginUsed / equity : 0,
    leverage: equity > 0 ? m.notional / equity : 0,
  };
}
export type Risk = "safe" | "warn" | "danger";
export const DEFAULT_THRESHOLDS = { warn: 0.10, danger: 0.05 };
export function positionView(p: TPosition, markOverride?: number, th = DEFAULT_THRESHOLDS) {
  const mark = markOverride ?? p.fairPrice;
  const side = p.size >= 0 ? "LONG" : "SHORT";
  const liq = p.liquidationPrice && p.liquidationPrice > 0 ? p.liquidationPrice : null;
  // Signed distance: positive = still room before liq.
  const liqDist = liq == null ? null : (side === "LONG" ? (mark - liq) / mark : (liq - mark) / mark);
  const upnl = (mark - p.price) * p.size; // recomputed with live mark
  const margin = p.notional / (p.leverage || 1);
  const risk: Risk = liqDist == null ? "safe" : liqDist <= th.danger ? "danger" : liqDist <= th.warn ? "warn" : "safe";
  const tpsl = (p.protection?.orders ?? []).map((o) => ({ type: o.orderType, px: o.trigger?.px ?? null, pxHi: o.trigger?.pxHi ?? null }));
  return { symbol: p.symbol, side, size: Math.abs(p.size), entry: p.price, mark, notional: Math.abs(p.size) * mark,
    leverage: p.leverage, liq, liqDist, upnl, upnlPct: margin ? upnl / margin : 0,
    fundingSinceOpen: p.funding, fees: p.fees, iso: !!p.iso, risk, tpsl };
}
