import { useStore } from "../store";
import { positionView } from "../metrics";
import { usd, sgnUsd, pct, px, cls, short } from "../fmt";
export function Positions() {
  const { accounts, marks, wallets } = useStore();
  const label = (addr: string) => {
    const w = wallets.find((x) => x.address === addr); if (w) return w.label;
    const p = accounts[addr]?.parent; const pw = wallets.find((x) => x.address === p);
    return `${pw?.label ?? "?"} / ${accounts[addr]?.data?.name ?? "sub " + short(addr)}`;
  };
  const rows = Object.entries(accounts).flatMap(([addr, a]) => (a.data?.positions ?? []).map((p) => ({ addr, v: positionView(p, marks[p.symbol]) })))
    .sort((a, b) => (a.v.liqDist ?? 9) - (b.v.liqDist ?? 9));
  return (
    <section className="card">
      <h2>Positions <span className="muted small">sorted by closest to liquidation</span></h2>
      {!rows.length ? <div className="muted">No open positions.</div> : (
        <table>
          <thead><tr><th>Account</th><th>Market</th><th>Side</th><th>Size</th><th>Notional</th><th>Entry</th><th>Mark</th><th>Lev</th><th>uPnL</th><th>Liq price</th><th>Liq distance</th><th>Funding since open</th><th>TP / SL</th></tr></thead>
          <tbody>
            {rows.map(({ addr, v }) => (
              <tr key={addr + v.symbol + v.iso} className={"risk-" + v.risk}>
                <td>{label(addr)}{v.iso && <span className="tag">iso</span>}</td>
                <td><b>{v.symbol}</b></td>
                <td className={v.side === "LONG" ? "pos" : "neg"}>{v.side}</td>
                <td>{v.size}</td><td>{usd(v.notional)}</td><td>{px(v.entry)}</td><td>{px(v.mark)}</td>
                <td>{v.leverage}x</td>
                <td className={cls(v.upnl)}>{sgnUsd(v.upnl)} <span className="small">({pct(v.upnlPct, 1)})</span></td>
                <td>{v.liq ? px(v.liq) : "—"}</td>
                <td><span className={"pill " + v.risk}>{v.liqDist == null ? "—" : pct(v.liqDist)}</span></td>
                <td className={cls(v.fundingSinceOpen)}>{sgnUsd(v.fundingSinceOpen)}</td>
                <td className="small">{v.tpsl.map((o, i) => <div key={i}>{o.type}: {o.px ? px(o.px) : "—"}{o.pxHi ? ` / ${px(o.pxHi)}` : ""}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
