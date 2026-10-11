import { useAlerts, playSound, raise } from "../alerts";
import { Startup } from "./Startup";
export function Alerts() {
  const { log, settings: s, setSettings } = useAlerts();
  return (
    <section className="card">
      <h2>Alerts <span className="muted small">tray notification + sound · keeps running when the window is closed (quit from the tray icon)</span></h2>
      <div className="row" style={{ flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <label>Warn when liq distance ≤ <input type="number" step="0.5" min="1" max="50" value={+(s.warn * 100).toFixed(2)} onChange={(e) => setSettings({ warn: +e.target.value / 100 })} style={{ width: 60 }} />%</label>
        <label>Danger ≤ <input type="number" step="0.5" min="0.5" max="50" value={+(s.danger * 100).toFixed(2)} onChange={(e) => setSettings({ danger: +e.target.value / 100 })} style={{ width: 60 }} />%</label>
        <label>Repeat warn after <input type="number" min="1" value={s.cooldownMin} onChange={(e) => setSettings({ cooldownMin: +e.target.value })} style={{ width: 50 }} /> min</label>
        <label><input type="checkbox" checked={s.sound} onChange={(e) => setSettings({ sound: e.target.checked })} /> Sound</label>
        <label>Volume <input type="range" min="0" max="1" step="0.1" value={s.volume} onChange={(e) => setSettings({ volume: +e.target.value })} /></label>
        <button onClick={() => playSound("danger")}>Test sound</button>
        <button onClick={() => raise("near-liq", "Test alert", "This is what an alert looks like.", undefined, "warn")}>Test notification</button>
      </div>
      <div><Startup /></div>
      <p className="muted small">Liquidation and ADL alerts are always on (live account feed + 2-minute history check as backup). Alerts only work while the app is running.</p>
      <table><thead><tr><th>Time</th><th>Alert</th><th>Detail</th></tr></thead>
        <tbody>{log.map((a) => <tr key={a.id} className={a.kind === "liquidation" || a.kind === "adl" || a.kind === "danger" ? "risk-danger" : ""}><td>{new Date(a.at).toLocaleTimeString()}</td><td><b>{a.title}</b></td><td>{a.body}</td></tr>)}
          {!log.length && <tr><td colSpan={3} className="muted">No alerts this session.</td></tr>}</tbody></table>
    </section>
  );
}
