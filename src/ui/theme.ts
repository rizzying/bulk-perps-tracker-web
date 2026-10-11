const K = "bpt.theme"; // dark default for trading
export const getTheme = () => (localStorage.getItem(K) === "light" ? "light" : "dark");
export const applyTheme = (t = getTheme()) => { document.documentElement.classList.toggle("dark", t === "dark"); document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#08080a" : "#ffffff"); };
export const toggleTheme = () => { const t = getTheme() === "dark" ? "light" : "dark"; localStorage.setItem(K, t); applyTheme(t); window.dispatchEvent(new Event("bpt-theme")); return t; };
import { useEffect, useState } from "react";
export const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
/** Resolve a token to a concrete rgb() string (charts can't use color-mix()). */
export const tokenColor = (n: string) => { const el = document.createElement("span"); el.style.color = `var(${n})`; document.body.appendChild(el); const c = getComputedStyle(el).color; el.remove();
  const m = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/.exec(c); // color-mix() resolves to color(srgb …); charts need rgba
  return m ? `rgba(${Math.round(+m[1] * 255)}, ${Math.round(+m[2] * 255)}, ${Math.round(+m[3] * 255)}, ${m[4] ?? 1})` : c; };
export function useThemeName() { const [t, setT] = useState(getTheme()); useEffect(() => { const h = () => setT(getTheme()); window.addEventListener("bpt-theme", h); return () => window.removeEventListener("bpt-theme", h); }, []); return t; }
