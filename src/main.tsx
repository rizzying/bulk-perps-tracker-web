import React from "react"; import ReactDOM from "react-dom/client"; import App from "./App"; import { Pulse } from "./components/Pulse"; import "@fontsource-variable/geist"; import "@fontsource-variable/geist-mono"; import "./styles.css"; import "./ui/design.css"; import { applyTheme } from "./ui/theme"; import { startResponsiveTables } from "./ui/responsiveTables"; import { startOiRecorder } from "./aura/data";
const isPulse = new URLSearchParams(location.search).get("view") === "pulse";
if (isPulse) document.body.classList.add("pulse-body");
else { import("./watcher").then((m) => m.startWatcher()); startOiRecorder(); }
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode>{isPulse ? <Pulse /> : <App />}</React.StrictMode>);

if ("serviceWorker" in navigator && !isPulse) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

applyTheme(); if (!isPulse) startResponsiveTables();
