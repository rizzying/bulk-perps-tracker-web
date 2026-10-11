import { z } from "zod"; import { client } from "../src/api/client";
const NS = 1e6;
async function pageBack(type: "fills" | "positions" | "fundingHistory", user: string, from: number, ts: (r: any) => number, max = 10) {
  const rows: any[] = []; let cursor: string | undefined;
  for (let i = 0; i < max; i++) { const p = await client.history(type, z.any(), user, { limit: 1000, cursor }); rows.push(...p.data);
    if (!p.page.hasMore || !p.page.nextCursor) return { rows, complete: true }; if (p.data.length && ts(p.data[p.data.length - 1]) < from) return { rows, complete: true }; cursor = p.page.nextCursor; }
  return { rows, complete: false };
}
export async function loadRawNode(address: string, from: number) {
  const fa: any = await client.fullAccount(address).catch(() => ({ subAccounts: [] })); const accounts = [address, ...(fa.subAccounts ?? []).map((s: any) => s.pubkey)];
  const out = { positions: [] as any[], funding: [] as any[], fills: [] as any[], own: new Set(accounts), complete: true };
  for (const a of accounts) { const p = await pageBack("positions", a, from, (r) => r.closeTime / NS), f = await pageBack("fundingHistory", a, from, (r) => r.timestamp / NS), fl = await pageBack("fills", a, from, (r) => r.timestamp / NS);
    out.positions.push(...p.rows); out.funding.push(...f.rows); out.fills.push(...fl.rows); out.complete &&= p.complete && f.complete && fl.complete; }
  return out;
}
