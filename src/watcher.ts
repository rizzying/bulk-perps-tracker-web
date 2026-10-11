import { useStore } from "./store";
import { positionView } from "./metrics";
import { useAlerts, stepNearLiq, LiqState, raise, setTray } from "./alerts";
import { client } from "./api/client";
import { pct, px } from "./fmt";

// Runs in the main window only. Evaluates near-liq on every store change + polls riskHistory as WS backup.
const states = new Map<string, LiqState>();
function evaluate() {
  const { accounts, marks, wallets } = useStore.getState();
  const s = useAlerts.getState().settings; const now = Date.now();
  let worst: { d: number; sym: string } | null = null;
  const seen = new Set<string>();
  for (const [addr, a] of Object.entries(accounts)) for (const p of a.data?.positions ?? []) {
    const v = positionView(p, marks[p.symbol], s); if (v.liqDist == null) continue;
    const k = `${addr}|${v.symbol}|${v.iso}`; seen.add(k);
    const r = stepNearLiq(states.get(k), v.liqDist, s, now); states.set(k, r.state);
    if (r.fire) {
      const label = wallets.find((w) => w.address === addr)?.label ?? a.data?.name ?? addr.slice(0, 4);
      raise(r.fire === "danger" ? "danger" : "near-liq", `${r.fire === "danger" ? "DANGER" : "Near liquidation"}: ${v.symbol} ${v.side}`,
        `${label}: ${pct(v.liqDist)} from liq (mark ${px(v.mark)}, liq ${px(v.liq!)})`, undefined, r.fire === "danger" ? "danger" : "warn");
    }
    if (!worst || v.liqDist < worst.d) worst = { d: v.liqDist, sym: v.symbol };
  }
  for (const k of [...states.keys()]) if (!seen.has(k)) states.delete(k); // closed positions re-arm
  const level = !worst ? "safe" : worst.d <= s.danger ? "danger" : worst.d <= s.warn ? "warn" : "safe";
  void setTray(worst ? `Bulk: ${worst.sym} ${pct(worst.d, 1)} from liq` : "Bulk Perps Tracker: no open positions", level);
}

const lastRiskSlot = new Map<string, number>();
async function pollRisk() {
  for (const addr of Object.keys(useStore.getState().accounts)) {
    try {
      const r = await client.riskHistory(addr, { limit: 50 });
      const max = Math.max(0, ...r.data.map((x) => x.slot));
      const prev = lastRiskSlot.get(addr);
      if (prev !== undefined) for (const e of r.data.filter((x) => x.slot > prev && (x.eventType === "liquidation" || x.eventType === "adl")))
        raise(e.eventType as "liquidation" | "adl", `${e.eventType === "adl" ? "AUTO-DELEVERAGED" : "LIQUIDATED"}: ${e.symbol}`,
          `${addr.slice(0, 4)}…: ${e.amount} @ ${px(e.price)}${e.reason ? " (" + e.reason + ")" : ""}`, `${e.eventType === "adl" ? "adl" : "liq"}:${addr}:${e.symbol}`);
      lastRiskSlot.set(addr, Math.max(prev ?? 0, max));
    } catch { /* ignore */ }
  }
}

export function startWatcher() {
  let t: ReturnType<typeof setTimeout> | null = null;
  useStore.subscribe(() => { if (!t) t = setTimeout(() => { t = null; evaluate(); }, 250); });
  setTimeout(pollRisk, 5000); setInterval(pollRisk, 120_000);
}
