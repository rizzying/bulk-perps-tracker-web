import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useAlerts } from "../alerts";
/** Web replacement for "start with Windows": install as PWA, notification permission, optional server push for background alerts. */
let deferred: any = null;
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
const b64 = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
export function Startup() {
  const wallets = useStore((s) => s.wallets); const settings = useAlerts((s) => s.settings);
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [push, setPush] = useState<{ enabled: boolean; publicKey: string | null } | null>(null); const [subbed, setSubbed] = useState(false); const [msg, setMsg] = useState("");
  const standalone = typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone);
  useEffect(() => { fetch("/api/push").then((r) => r.ok ? r.json() : null).then(setPush).catch(() => setPush(null));
    navigator.serviceWorker?.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setSubbed(!!s)).catch(() => {}); }, []);
  const install = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; } else setMsg("Use your browser menu → \"Install app\" / \"Add to Home Screen\" (iPhone: Share → Add to Home Screen)."); };
  const askPerm = async () => setPerm(await Notification.requestPermission());
  const subscribe = async () => {
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(push!.publicKey!) });
      const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub, wallets: wallets.map((w) => w.address), warn: settings.warn, danger: settings.danger }) });
      setSubbed(r.ok); setMsg(r.ok ? "Background alerts on. The server checks about every 15 min." : "Server refused the subscription."); } catch (e) { setMsg(String((e as Error).message)); }
  };
  const unsubscribe = async () => { const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription(); if (s) { await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: s.endpoint }) }); await s.unsubscribe(); } setSubbed(false); };
  return <div className="webapp">
    <div>{standalone ? "✓ Installed as an app" : <button onClick={install}>Install app</button>} <span className="small muted">Works on phone and desktop, opens in its own window.</span></div>
    <div>Notifications: <b>{perm}</b> {perm === "default" && <button onClick={askPerm}>Allow</button>} <span className="small muted">Instant alerts (sound + notification) while the app is open, using live WebSocket data.</span></div>
    <div>Background alerts (app closed): {push?.enabled ? (subbed ? <><b>on</b> <button className="link" onClick={unsubscribe}>turn off</button></> : <button disabled={perm !== "granted" || !wallets.length} onClick={subscribe}>Turn on</button>) : <span className="muted">not configured on this server</span>}
      <div className="small muted">Near-liquidation and liquidation/ADL only, checked about every 15 min (so they can arrive up to ~20 min late). Your saved wallet addresses are stored on the server for this. iPhone needs iOS 16.4+ with the app on the Home Screen.</div></div>
    {msg && <div className="small">{msg}</div>}
  </div>;
}
