/** Mobile: copy each column's <th> text into data-label on its <td>s so CSS can render rows as label/value cards below 48rem. */
function label(t: HTMLTableElement) {
  const ths = [...t.querySelectorAll("thead th")].map((th) => (th.textContent || "").trim());
  if (!ths.length) return; t.classList.add("rt");
  for (const tr of t.querySelectorAll("tbody tr")) [...tr.children].forEach((td, i) => { if (ths[i] && (td as HTMLElement).dataset.label !== ths[i]) (td as HTMLElement).dataset.label = ths[i]; });
}
export function startResponsiveTables() {
  let q = false; const run = () => { q = false; document.querySelectorAll("table").forEach((t) => label(t as HTMLTableElement)); };
  new MutationObserver(() => { if (!q) { q = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true }); run();
}
