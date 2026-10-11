import { client } from "./api/client";
import { z } from "zod";
import { FundingRow } from "./api/types";
export type TFunding = z.infer<typeof FundingRow>;

// Jakarta calendar day (Asia/Jakarta, UTC+7, no DST). Timestamps from Bulk are nanoseconds.
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
export const jakartaDay = (tsNs: number) => dayFmt.format(new Date(Math.floor(tsNs / 1e6)));

export type DayRow = { day: string; total: number; bySymbol: Record<string, number>; count: number };
export function groupDaily(rows: TFunding[]): DayRow[] {
  const m = new Map<string, DayRow>();
  for (const r of rows) {
    const d = jakartaDay(r.timestamp);
    const x = m.get(d) ?? { day: d, total: 0, bySymbol: {}, count: 0 };
    x.total += r.payment; x.count++; x.bySymbol[r.symbol] = (x.bySymbol[r.symbol] ?? 0) + r.payment;
    m.set(d, x);
  }
  return [...m.values()].sort((a, b) => b.day.localeCompare(a.day));
}

// Dedupe key: slot+sequence+symbol+owner (iso rows share slot).
const key = (r: any) => `${r.slot}:${r.sequence ?? ""}:${r.symbol}:${r.owner ?? ""}`;
export function mergeRows(old: TFunding[], fresh: TFunding[]) {
  const m = new Map(old.map((r) => [key(r), r])); fresh.forEach((r) => m.set(key(r), r));
  return [...m.values()].sort((a, b) => b.slot - a.slot);
}

const CK = (a: string) => `bpt.funding.v1.${a}`;
export const loadCache = (a: string): TFunding[] => { try { return JSON.parse(localStorage.getItem(CK(a)) || "[]"); } catch { return []; } };
const saveCache = (a: string, r: TFunding[]) => { try { localStorage.setItem(CK(a), JSON.stringify(r.slice(0, 20000))); } catch { /* quota */ } };

// Incremental: if cached, fetch only slots after newest cached; else backfill up to maxPages.
export async function syncFunding(addr: string, maxPages = 10): Promise<TFunding[]> {
  const cached = loadCache(addr);
  const since = cached.length ? cached[0].slot + 1 : undefined;
  let rows: TFunding[] = []; let cursor: string | undefined; let pages = 0;
  do {
    const r = await client.fundingHistory(addr, cursor ? { cursor, limit: 5000 } : { startSlot: since, limit: 5000 });
    rows = rows.concat(r.data); cursor = r.page.hasMore ? r.page.nextCursor ?? undefined : undefined; pages++;
  } while (cursor && pages < maxPages);
  const merged = mergeRows(cached, rows); saveCache(addr, merged); return merged;
}
