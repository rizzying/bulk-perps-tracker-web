import { create } from "zustand";
import { DEFAULT_THRESHOLDS, Risk } from "./metrics";

export type AlertKind = "near-liq" | "danger" | "liquidation" | "adl" | "recovered";
export type Alert = { id: string; kind: AlertKind; title: string; body: string; at: number };
export type Settings = { warn: number; danger: number; sound: boolean; volume: number; cooldownMin: number };
const SK = "bpt.alertSettings.v1";
const defaults: Settings = { ...DEFAULT_THRESHOLDS, sound: true, volume: 0.8, cooldownMin: 10 };
export function sanitizeSettings(s: Settings): Settings {
  const clamp = (x: number, lo: number, hi: number, d: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  let warn = clamp(s.warn, 0.005, 0.5, defaults.warn), danger = clamp(s.danger, 0.002, 0.5, defaults.danger);
  if (danger >= warn) danger = warn / 2; // danger must be closer to liquidation than warn
  return { ...s, warn, danger, volume: clamp(s.volume, 0, 1, defaults.volume), cooldownMin: clamp(s.cooldownMin, 1, 1440, defaults.cooldownMin), sound: !!s.sound };
}
const loadS = (): Settings => { try { return sanitizeSettings({ ...defaults, ...JSON.parse(localStorage.getItem(SK) || "{}") }); } catch { return defaults; } };

export const useAlerts = create<{ log: Alert[]; settings: Settings; setSettings: (p: Partial<Settings>) => void }>((set, get) => ({
  log: [], settings: loadS(),
  setSettings: (p) => { const s = sanitizeSettings({ ...get().settings, ...p }); localStorage.setItem(SK, JSON.stringify(s)); set({ settings: s }); },
}));

// ---------- pure near-liq state machine (unit-tested) ----------
export type LiqState = { level: Risk; lastAlert: number };
const rank: Record<Risk, number> = { safe: 0, warn: 1, danger: 2 };
const HYST = 0.02; // must recover 2 percentage points past a threshold before re-arming
export function levelFor(dist: number, s: { warn: number; danger: number }, prev: Risk): Risk {
  if (dist <= s.danger) return "danger";
  if (dist <= s.warn) return prev === "danger" && dist <= s.danger + HYST ? "danger" : "warn";
  if (prev !== "safe" && dist <= s.warn + HYST) return prev === "danger" ? "warn" : prev;
  return "safe";
}
/** Returns new state and whether to alert. Alerts only on worsening, with cooldown for same level. */
export function stepNearLiq(prev: LiqState | undefined, dist: number, s: Settings, now: number): { state: LiqState; fire: Risk | null } {
  const p = prev ?? { level: "safe" as Risk, lastAlert: -Infinity };
  const level = levelFor(dist, s, p.level);
  const worse = rank[level] > rank[p.level];
  if (worse && (now - p.lastAlert > s.cooldownMin * 60_000 || rank[level] === 2)) return { state: { level, lastAlert: now }, fire: level };
  return { state: { level, lastAlert: p.lastAlert }, fire: null };
}

// ---------- side effects ----------
const sounds: Record<string, string> = { warn: "/sounds/warn.wav", danger: "/sounds/danger.wav", liquidation: "/sounds/liq.wav", adl: "/sounds/liq.wav" };
export function playSound(kind: string) {
  const s = useAlerts.getState().settings; if (!s.sound) return;
  try { const a = new Audio(sounds[kind] ?? sounds.warn); a.volume = s.volume; a.play().catch(() => { /* autoplay blocked until first click */ }); } catch { /* ignore */ }
}
async function notifyOS(title: string, body: string) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration(); // works on Android/desktop PWAs; iOS needs the app added to Home Screen
    if (reg) await reg.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: title });
    else new Notification(title, { body });
  } catch { /* ignore */ }
}
const recent = new Map<string, number>();
export function raise(kind: AlertKind, title: string, body: string, dedupeKey?: string, soundKind?: string) {
  const now = Date.now();
  if (dedupeKey) { const win = /^(liq|adl):/.test(dedupeKey) ? 15 * 60_000 : 90_000; const t = recent.get(dedupeKey); if (t && now - t < win) return; recent.set(dedupeKey, now); }
  const a: Alert = { id: now + Math.random().toString(36).slice(2), kind, title, body, at: now };
  useAlerts.setState((s) => ({ log: [a, ...s.log].slice(0, 200) }));
  void notifyOS(title, body); playSound(soundKind ?? kind);
}

// WS account events (liquidation / adl / non-normal fills)
export function onAccountEvent(addr: string, d: any) {
  const who = addr.slice(0, 4) + "…" + addr.slice(-4);
  const t = d.type === "fill" ? (d.reasonCode === 2 ? "adl" : d.reasonCode === 1 || d.reasonCode === 3 ? "liquidation" : null) : d.type;
  if (t === "liquidation") raise("liquidation", `LIQUIDATED: ${d.symbol}`, `${who}: ${d.size} @ ${d.price}${d.reason ? " (" + d.reason + ")" : ""}`, `liq:${addr}:${d.symbol}`);
  else if (t === "adl") raise("adl", `AUTO-DELEVERAGED: ${d.symbol}`, `${who}: ${d.size} @ ${d.price}`, `adl:${addr}:${d.symbol}`);
}

// Web: no tray, so reflect risk in the tab/PWA title.
let lastTray = "";
export async function setTray(tooltip: string, level: Risk) {
  const k = tooltip + level; if (k === lastTray || typeof document === "undefined") return; lastTray = k;
  document.title = (level === "danger" ? "🔴 " : level === "warn" ? "🟠 " : "") + "Bulk Perps Tracker";
}
