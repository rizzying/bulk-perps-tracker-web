import { useState } from "react";
import { useStore } from "./store";
import { Wallets } from "./components/Wallets";
import { Overview } from "./components/Overview";
import { Positions } from "./components/Positions";
import { Funding } from "./components/Funding";
import { Aura } from "./components/Aura";
import { Journal } from "./components/Journal";
import { Alerts } from "./components/Alerts";
import { Markets } from "./components/Markets";
import { useAlerts } from "./alerts";
import { togglePulse } from "./pip";
import { toggleTheme, getTheme } from "./ui/theme";
import { Startup } from "./components/Startup";
export default function App() {
  const live = useStore((s) => s.live); const refresh = useStore((s) => s.refreshAll);
  const alerts = useAlerts((s) => s.log.length);
  const hasWallets = useStore((s) => s.wallets.length > 0);
  const [theme, setTheme] = useState(getTheme());
  const [tab, setTab] = useState<"dash" | "markets" | "funding" | "journal" | "aura" | "alerts">("dash");
  const T = (k: typeof tab, l: string) => <button className={"tab " + (tab === k ? "on" : "")} onClick={() => setTab(k)}>{l}</button>;
  return (
    <div className="app">
      <header><h1>Bulk Perps</h1><span className={"dot " + (live ? "on" : "")} /> <span className="muted small">{live ? "live" : "connecting"}</span>
        <nav>{T("dash", "Dashboard")}{T("markets", "Setup")}{T("funding", "Funding")}{T("journal", "Journal")}{T("aura", "AURA")}{T("alerts", `Alerts${alerts ? ` (${alerts})` : ""}`)}</nav>
        <button className="link" onClick={() => refresh()}>refresh</button><button className="pulsebtn" onClick={togglePulse} title="Always-on-top mini widget (Picture-in-Picture where supported)">Pulse</button><button className="theme-btn" title="Toggle light/dark" onClick={() => setTheme(toggleTheme())}>{theme === "dark" ? "☾" : "☀"}</button></header>
      {tab === "dash" && (hasWallets ? <><Overview /><Positions /><Wallets /></> : <><section className="card welcome"><h2>Welcome 👋</h2><p>Paste your Bulk wallet address below. That's it — read-only, no keys, no sign-in.</p><p className="muted small">Tip: install it as an app (button below), allow notifications, and turn on background alerts.</p><Startup /></section><Wallets /></>)}
      {tab === "markets" && <Markets />}
      {tab === "funding" && <Funding />}
      {tab === "journal" && <Journal />}
      {tab === "aura" && <Aura />}
      {tab === "alerts" && <Alerts />}
      <footer className="muted small">v{__APP_VERSION__} · Read-only · public Bulk API · not financial advice</footer>
    </div>
  );
}
