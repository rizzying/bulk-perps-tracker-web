import { useStore } from "../store";
import { accountSummary, positionView } from "../metrics";
import { useAlerts } from "../alerts";
import { usd, sgnUsd, pct, cls, px } from "../fmt";
// Compact always-on-top widget. Whole surface is a drag region (Tauri).
export function Pulse({ onClose }: { onClose?: () => void } = {}) {
  const { accounts, marks } = useStore(); const s = useAlerts((x) => x.settings);
  const sums = Object.values(accounts).filter((a) => a.data).map((a) => accountSummary(a.data!));
  const views = Object.values(accounts).flatMap((a) => (a.data?.positions ?? []).map((p) => positionView(p, marks[p.symbol], s)));
  const upnl = views.reduce((x, v) => x + v.upnl, 0);
  const equity = sums.reduce((x, r) => x + r.balance, 0) + upnl;
  const worst = views.filter((v) => v.liqDist != null).sort((a, b) => a.liqDist! - b.liqDist!)[0];
  const btc = marks["BTC-USD"];
  const close = () => (onClose ? onClose() : window.close());
  return (
    <div className="pulse">
      <div className="prow"><span className="muted">PULSE</span>{btc && <span>BTC {px(btc)}</span>}<button className="x" onClick={close} title="Hide">×</button></div>
      <div className="prow"><span className="big">{usd(equity)}</span><span className={"big " + cls(upnl)}>{sgnUsd(upnl)}</span></div>
      {worst ? <div>
        <div className="prow small"><span>{worst.symbol} {worst.side} {worst.leverage}x</span><span className={"pill " + worst.risk}>{pct(worst.liqDist!)} to liq</span></div>
        <div className="bar"><div className={"fill " + worst.risk} style={{ width: Math.min(100, (worst.liqDist! / 0.25) * 100) + "%" }} /></div>
        <div className="small muted">{views.length} open · liq {px(worst.liq!)}</div>
      </div> : <div className="small muted">{sums.length ? "No open positions" : "Add a wallet in the main window"}</div>}
    </div>
  );
}
