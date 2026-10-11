import { useEffect, useState } from "react";
/** Install as PWA + notification permission. Alerts run in the open app (live WebSocket); nothing about you is stored server-side. */
let deferred: any = null;
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
export function Startup() {
  const [perm, setPerm] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [canInstall, setCanInstall] = useState(!!deferred); const [msg, setMsg] = useState("");
  useEffect(() => { const h = () => setCanInstall(true); window.addEventListener("beforeinstallprompt", h); return () => window.removeEventListener("beforeinstallprompt", h); }, []);
  const standalone = typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone);
  const install = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; setCanInstall(false); } else setMsg("Use your browser menu → “Install app” / “Add to Home Screen” (iPhone: Share → Add to Home Screen)."); };
  return <div className="webapp">
    <div>{standalone ? <span className="pos">✓ Installed as an app</span> : <button onClick={install}>{canInstall ? "Install app" : "How to install"}</button>} <span className="small muted">Phone or desktop, opens in its own window.</span></div>
    {perm !== "unsupported" && <div>Notifications: <b>{perm === "granted" ? "allowed" : perm === "denied" ? "blocked (change in browser settings)" : "not yet allowed"}</b> {perm === "default" && <button onClick={async () => setPerm(await Notification.requestPermission())}>Allow</button>}
      <div className="small muted">Liquidation-risk alerts fire while the app is open (any tab or installed window). They can't fire when the app is fully closed.</div></div>}
    {msg && <div className="small">{msg}</div>}
  </div>;
}
