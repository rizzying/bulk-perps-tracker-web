/** Trade journal: rows imported from Bulk closed positions or entered manually. Pure logic (no I/O) for testing. */
export type Side = "long" | "short";
export const EDITABLE = ["date", "market", "side", "entry", "leverage", "close", "pnl", "notes"] as const;
export type Field = (typeof EDITABLE)[number];
export type JournalRow = {
  id: string;                 // stable key: imported "imp:<wallet>:<symbol>:<openMs>:<closeMs>:<closeSlot>", manual "man:<uuid>"
  source: "import" | "manual";
  wallet: string;             // "" for manual
  date: number;               // close time (ms); manual = trade date
  market: string; side: Side;
  entry: number | null; leverage: number | null; close: number | null; pnl: number | null;
  notes: string;
  levDerived: "" | "setting" | "estimate"; // "" = exact/user-entered
  edited: Field[];            // fields the user changed: re-import never overwrites these (notes are never overwritten)
  deleted: boolean;           // tombstone so a re-import doesn't resurrect deleted imported rows
  extra: { size?: number; openTime?: number; fees?: number; funding?: number; closeReason?: string; iso?: boolean; volume?: number; margin?: string };
  updated: number;
};

/** Bulk POST /account {type:"positions"} row (closed positions). Timestamps are ns. quantity < 0 = short. */
export type BulkClosedPosition = { owner?: string; symbol: string; quantity: number; maxQuantity?: number; totalVolume?: number; avgOpenPrice: number; avgClosePrice: number;
  realizedPnl: number; fees?: number; funding?: number; openTime: number; closeTime: number; closeSlot?: number; closeReason?: string; iso?: boolean; leverage?: number };

// ns timestamps exceed 2^53 and lose precision in JS, so key on ms times + the (exact, small) close slot.
export const importKey = (wallet: string, p: BulkClosedPosition) => `imp:${wallet}:${p.symbol}:${Math.round(p.openTime / 1e6)}:${Math.round(p.closeTime / 1e6)}:${p.closeSlot ?? 0}`;

/**
 * Leverage is not in closed-position history. Derivation order:
 * 1) row has leverage (future API) → exact;
 * 2) the account's current per-market leverage setting → "setting" (may differ from what was used back then);
 * 3) none → null.
 */
export function fromPosition(wallet: string, p: BulkClosedPosition, levSettings: Record<string, number> = {}): JournalRow {
  const lev = p.leverage ?? levSettings[p.symbol] ?? null;
  return {
    id: importKey(wallet, p), source: "import", wallet, date: Math.round(p.closeTime / 1e6), market: p.symbol,
    side: (p.maxQuantity ?? p.quantity) < 0 ? "short" : "long",
    entry: p.avgOpenPrice, close: p.avgClosePrice, pnl: p.realizedPnl, leverage: lev,
    levDerived: p.leverage != null ? "" : lev != null ? "setting" : "",
    notes: "", edited: [], deleted: false, updated: Date.now(),
    extra: { size: Math.abs(p.maxQuantity ?? p.quantity), openTime: Math.round(p.openTime / 1e6), fees: p.fees, funding: p.funding, closeReason: p.closeReason, iso: p.iso, volume: p.totalVolume, margin: p.iso ? "isolated" : "cross" },
  };
}

/** Re-import: refresh exchange data, keep user notes/edits and tombstones. */
export function mergeImport(existing: JournalRow | undefined, incoming: JournalRow): JournalRow {
  if (!existing) return incoming;
  const out: JournalRow = { ...existing, extra: { ...existing.extra, ...incoming.extra }, updated: Date.now() };
  for (const f of ["date", "market", "side", "entry", "close", "pnl", "leverage"] as const) {
    if (existing.edited.includes(f)) continue;
    (out as any)[f] = incoming[f];
    if (f === "leverage") out.levDerived = incoming.levDerived;
  }
  return out; // notes, edited, deleted always kept
}

export function applyEdit(row: JournalRow, field: Field, value: unknown): JournalRow {
  const out: JournalRow = { ...row, updated: Date.now() };
  if (field === "notes" || field === "market") (out as any)[field] = String(value ?? "");
  else if (field === "side") out.side = value === "short" ? "short" : "long";
  else if (field === "date") { const t = typeof value === "number" ? value : Date.parse(String(value)); if (Number.isFinite(t)) out.date = t; }
  else { const n = value === "" || value == null ? null : Number(value); (out as any)[field] = n != null && Number.isFinite(n) ? n : null; if (field === "leverage") out.levDerived = ""; }
  if (row.source === "import" && field !== "notes" && !out.edited.includes(field)) out.edited = [...out.edited, field];
  return out;
}

export function newManual(now = Date.now()): JournalRow {
  const id = "man:" + (globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`);
  return { id, source: "manual", wallet: "", date: now, market: "BTC-USD", side: "long", entry: null, leverage: null, close: null, pnl: null, notes: "", levDerived: "", edited: [], deleted: false, extra: {}, updated: now };
}

/** If PnL is blank on a manual row, compute it when size is unknown? We can't: show "–". Return % move as a helper instead. */
export const movePct = (r: JournalRow) => r.entry && r.close ? ((r.close - r.entry) / r.entry) * (r.side === "short" ? -1 : 1) : null;
