import { useMemo, useState } from "react";
import { useStore } from "../store";
import { groupDaily } from "../funding";
import { fund as sgnUsd, cls } from "../fmt";
export function Funding() {
  const { funding, fundingLoading, refreshFunding } = useStore();
  const [days, setDays] = useState(30);
  const daily = useMemo(() => groupDaily(Object.values(funding).flat()), [funding]);
  const shown = daily.slice(0, days);
  const symbols = [...new Set(shown.flatMap((d) => Object.keys(d.bySymbol)))].sort();
  const max = Math.max(1e-9, ...shown.map((d) => Math.abs(d.total)));
  const total = shown.reduce((a, d) => a + d.total, 0);
  const W = 900, H = 160, bw = W / Math.max(days, 1);
  const bars = [...shown].reverse();
  return (
    <section className="card">
      <h2>Daily funding <span className="muted small">Jakarta days (UTC+7) · all wallets · + received / − paid</span>
        <select value={days} onChange={(e) => setDays(+e.target.value)} style={{ marginLeft: 12 }}>{[7, 30, 90, 365].map((d) => <option key={d} value={d}>last {d} days</option>)}</select>
        <button className="link" onClick={() => refreshFunding()}>{fundingLoading ? "loading…" : "refresh"}</button></h2>
      <div className="stats" style={{ marginBottom: 10 }}>
        <div className="stat"><div className="k">Total ({shown.length} days with funding)</div><div className={"v " + cls(total)}>{sgnUsd(total)}</div></div>
        <div className="stat"><div className="k">Avg / day</div><div className={"v " + cls(total)}>{sgnUsd(shown.length ? total / shown.length : 0)}</div></div>
      </div>
      {!shown.length ? <div className="muted">{fundingLoading ? "Loading funding history…" : "No funding payments yet."}</div> : <>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} role="img">
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#232a3a" />
          {bars.map((d, i) => { const h = (Math.abs(d.total) / max) * (H / 2 - 6); return (
            <rect key={d.day} x={i * bw + bw * 0.15} width={bw * 0.7} y={d.total >= 0 ? H / 2 - h : H / 2} height={Math.max(1, h)} fill={d.total >= 0 ? "#2ecc71" : "#ff5c5c"}><title>{d.day}: {sgnUsd(d.total)}</title></rect>); })}
        </svg>
        <table>
          <thead><tr><th>Day</th><th>Total</th>{symbols.map((s) => <th key={s}>{s}</th>)}<th>Payments</th></tr></thead>
          <tbody>{shown.map((d) => (
            <tr key={d.day}><td>{d.day}</td><td className={cls(d.total)}><b>{sgnUsd(d.total)}</b></td>
              {symbols.map((s) => <td key={s} className={cls(d.bySymbol[s] ?? 0)}>{d.bySymbol[s] != null ? sgnUsd(d.bySymbol[s]) : ""}</td>)}<td className="muted">{d.count}</td></tr>))}</tbody>
        </table></>}
    </section>
  );
}
