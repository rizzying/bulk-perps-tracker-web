import type { JournalRow } from "./model";
/** Storage: SQLite (tauri-plugin-sql, file journal.db in the app data dir) in the app; localStorage in the browser/dev. */
export interface Repo { all(): Promise<JournalRow[]>; get(id: string): Promise<JournalRow | undefined>; put(rows: JournalRow[]): Promise<void>; remove(id: string): Promise<void> }

const COLS = "id, source, wallet, date, market, side, entry, leverage, close, pnl, notes, lev_derived, edited, deleted, extra, updated";
const toRow = (r: any): JournalRow => ({ id: r.id, source: r.source, wallet: r.wallet, date: r.date, market: r.market, side: r.side, entry: r.entry, leverage: r.leverage, close: r.close, pnl: r.pnl,
  notes: r.notes ?? "", levDerived: r.lev_derived ?? "", edited: JSON.parse(r.edited || "[]"), deleted: !!r.deleted, extra: JSON.parse(r.extra || "{}"), updated: r.updated });
const vals = (r: JournalRow) => [r.id, r.source, r.wallet, r.date, r.market, r.side, r.entry, r.leverage, r.close, r.pnl, r.notes, r.levDerived, JSON.stringify(r.edited), r.deleted ? 1 : 0, JSON.stringify(r.extra), r.updated];

export class LocalRepo implements Repo {
  constructor(private key = "bpt.journal.v1", private ls: Pick<Storage, "getItem" | "setItem"> = localStorage) {}
  private load(): Record<string, JournalRow> { try { return JSON.parse(this.ls.getItem(this.key) || "{}"); } catch { return {}; } }
  async all() { return Object.values(this.load()).sort((a, b) => b.date - a.date); }
  async get(id: string) { return this.load()[id]; }
  async put(rows: JournalRow[]) { const m = this.load(); for (const r of rows) m[r.id] = r; this.ls.setItem(this.key, JSON.stringify(m)); }
  async remove(id: string) { const m = this.load(); delete m[id]; this.ls.setItem(this.key, JSON.stringify(m)); }
}

let repo: Promise<Repo> | null = null;
export const getRepo = () => (repo ??= Promise.resolve(new LocalRepo()));
