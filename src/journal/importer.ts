import { z } from "zod";
import { client } from "../api/client";
import { fromPosition, mergeImport, BulkClosedPosition, JournalRow } from "./model";
import type { Repo } from "./repo";

export async function closedPositions(user: string, onPage?: (n: number) => void): Promise<BulkClosedPosition[]> {
  const out: BulkClosedPosition[] = []; let cursor: string | undefined;
  for (let i = 0; i < 200; i++) { // up to 200k positions
    const p = await client.history("positions", z.any(), user, { limit: 1000, cursor });
    out.push(...p.data); onPage?.(out.length);
    if (!p.page.hasMore || !p.page.nextCursor) break; cursor = p.page.nextCursor;
  }
  return out;
}

export type ImportResult = { wallet: string; fetched: number; added: number; updated: number; unchanged: number; skippedDeleted: number; error?: string };
/** Import closed positions of the given wallets (incl. sub-accounts the caller passes). Idempotent: stable key + merge. */
export async function importWallets(repo: Repo, wallets: string[], onProgress?: (msg: string) => void): Promise<ImportResult[]> {
  const res: ImportResult[] = [];
  const existing = new Map((await repo.all()).map((r) => [r.id, r]));
  for (const w of wallets) {
    const r: ImportResult = { wallet: w, fetched: 0, added: 0, updated: 0, unchanged: 0, skippedDeleted: 0 };
    try {
      let lev: Record<string, number> = {};
      try { const fa: any = await client.fullAccount(w); lev = Object.fromEntries((fa.leverageSettings ?? []).map((x: any) => [x.symbol, x.leverage])); } catch { /* no account / settings */ }
      const ps = await closedPositions(w, (n) => onProgress?.(`${w.slice(0, 4)}…: ${n} closed positions`));
      r.fetched = ps.length; const batch: JournalRow[] = [];
      for (const p of ps) {
        const inc = fromPosition(w, p, lev); const ex = existing.get(inc.id);
        if (ex?.deleted) { r.skippedDeleted++; continue; }
        const m = mergeImport(ex, inc);
        if (!ex) r.added++;
        else if (["date", "market", "side", "entry", "close", "pnl", "leverage"].some((f) => (ex as any)[f] !== (m as any)[f]) || JSON.stringify(ex.extra) !== JSON.stringify(m.extra)) r.updated++;
        else { r.unchanged++; continue; }
        batch.push(m); existing.set(m.id, m);
      }
      await repo.put(batch);
    } catch (e) { r.error = String((e as Error).message); }
    res.push(r);
  }
  return res;
}
