import { it, expect } from "vitest";
import { BulkClient } from "../src/api/client";
import { accountSummary, positionView } from "../src/metrics";
it.runIf(process.env.LIVE)("live wallet", async () => {
  const c = new BulkClient();
  const a = await c.fullAccount("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w");
  const f = await c.fundingHistory("B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w", { limit: 5 });
  const t = await c.ticker("BTC-USD");
  console.log(JSON.stringify({ summary: accountSummary(a), positions: a.positions.map((p) => positionView(p, t.markPrice)), subs: a.subAccounts, funding5: f.data.length }, null, 1));
  for (const s of a.subAccounts) { try { const sa = await c.fullAccount(s.pubkey); console.log(s.pubkey, sa.kind, sa.name, accountSummary(sa).equity, sa.positions.length); } catch (e: any) { console.log(s.pubkey, e.code); } }
  expect(a.kind).toBe("MasterEOA");
}, 30000);
