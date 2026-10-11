import ReactDOM from "react-dom/client"; import { Pulse } from "./components/Pulse";
/** Pulse widget: Document Picture-in-Picture (always on top, Chrome/Edge desktop) → fallback small popup window. */
export async function togglePulse() {
  const dpip = (window as any).documentPictureInPicture;
  if (dpip) {
    if (dpip.window) { dpip.window.close(); return; }
    const w: Window = await dpip.requestWindow({ width: 320, height: 170 });
    for (const s of [...document.styleSheets]) { try { const st = w.document.createElement("style"); st.textContent = [...s.cssRules].map((r) => r.cssText).join("\n"); w.document.head.appendChild(st); } catch { if ((s as any).href) { const l = w.document.createElement("link"); l.rel = "stylesheet"; l.href = (s as any).href; w.document.head.appendChild(l); } } }
    w.document.body.className = "pulse-body"; const root = w.document.createElement("div"); w.document.body.appendChild(root);
    ReactDOM.createRoot(root).render(<Pulse onClose={() => w.close()} />); return;
  }
  window.open("?view=pulse", "pulse", "width=320,height=170");
}
