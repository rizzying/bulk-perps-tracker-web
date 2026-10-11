import { useStore } from "../store";
import { accountSummary } from "../metrics";
import { usd, sgnUsd, pct, cls } from "../fmt";
export function Overview() {
  const accounts = useStore((s) => s.accounts);
  const rows = Object.values(accounts).filter((a) => a.data).map((a) => accountSummary(a.data!));
  const t = rows.reduce((x, r) => ({ equity: x.equity + r.equity, upnl: x.upnl + r.upnl, realized: x.realized + r.realized, funding: x.funding + r.funding, fees: x.fees + r.fees, notional: x.notional + r.notional, used: x.used + r.marginUsed, avail: x.avail + r.available }),
    { equity: 0, upnl: 0, realized: 0, funding: 0, fees: 0, notional: 0, used: 0, avail: 0 });
  const stat = (k: string, v: string, c = "") => <div className="stat"><div className="k">{k}</div><div className={"v " + c}>{v}</div></div>;
  return (
    <section className="card">
      <h2>Overview <span className="muted small">all wallets + sub-accounts</span></h2>
      <div className="stats">
        {stat("Equity", usd(t.equity))}
        {stat("Unrealized PnL", sgnUsd(t.upnl), cls(t.upnl))}
        {stat("Realized PnL", sgnUsd(t.realized), cls(t.realized))}
        {stat("Funding", sgnUsd(t.funding), cls(t.funding))}
        {stat("Fees", sgnUsd(t.fees), cls(t.fees))}
        {stat("Open notional", usd(t.notional))}
        {stat("Margin used", t.equity > 0 ? pct(t.used / t.equity, 1) : "—")}
        {stat("Account leverage", t.equity > 0 ? (t.notional / t.equity).toFixed(2) + "x" : "—")}
        {stat("Available", usd(t.avail))}
      </div>
    </section>
  );
}
