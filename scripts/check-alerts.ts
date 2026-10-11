// GitHub Actions, every 15 min: server-side near-liq / liquidation check for push subscribers. ~1-3 Bulk requests per wallet, paced at 4/s.
import { neon } from "@neondatabase/serverless"; import webpush from "web-push";
import { client } from "../src/api/client"; import { positionView } from "../src/metrics";
const db = neon(process.env.DATABASE_URL!);
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
const subs = await db`select * from push_subs`; let sent = 0;
for (const s of subs as any[]) {
  const last: Record<string, number> = s.last_alert ?? {}; const msgs: { key: string; title: string; body: string }[] = [];
  for (const w of s.wallets as string[]) {
    try {
      const fa = await client.fullAccount(w); const accts = [fa, ...await Promise.all((fa.subAccounts ?? []).map((x: any) => client.fullAccount(x.pubkey)))];
      for (const a of accts) for (const p of a.positions) { const v: any = positionView(p, undefined, { warn: s.warn, danger: s.danger });
        if (v.risk !== "safe" && v.liqDist != null) msgs.push({ key: `${w}:${p.symbol}:${v.risk}`, title: `${v.risk === "danger" ? "DANGER" : "Near liquidation"}: ${p.symbol}`, body: `${w.slice(0, 4)}…${w.slice(-4)} ${p.size > 0 ? "long" : "short"} ${(v.liqDist * 100).toFixed(1)}% from liq (${v.liq})` }); }
      // liquidations / ADL in the last 20 min
      const since = Date.now() - 20 * 60_000;
      for (const a of [w, ...(fa.subAccounts ?? []).map((x: any) => x.pubkey)]) { const fl = await client.history("fills", (await import("zod")).z.any(), a, { limit: 50 });
        for (const f of fl.data) if (f.timestamp / 1e6 > since && [1, 2, 3].includes(f.reasonCode)) msgs.push({ key: `${w}:${f.symbol}:ev:${f.timestamp}`, title: `${f.reasonCode === 2 ? "AUTO-DELEVERAGED" : "LIQUIDATED"}: ${f.symbol}`, body: `${w.slice(0, 4)}…${w.slice(-4)} ${f.amount} @ ${f.price}` }); }
    } catch (e) { console.error(w, (e as Error).message); }
  }
  const now = Date.now(); const fresh = msgs.filter((m) => !(last[m.key] && now - last[m.key] < 60 * 60_000)); // re-notify same condition at most hourly
  for (const m of fresh) { try { await webpush.sendNotification(s.sub, JSON.stringify({ title: m.title, body: m.body, tag: m.key })); sent++; last[m.key] = now; }
    catch (e: any) { if (e.statusCode === 404 || e.statusCode === 410) { await db`delete from push_subs where endpoint = ${s.endpoint}`; break; } } }
  for (const k of Object.keys(last)) if (now - last[k] > 864e5) delete last[k];
  await db`update push_subs set last_alert = ${JSON.stringify(last)} where endpoint = ${s.endpoint}`;
}
console.log(`checked ${subs.length} subscriptions, sent ${sent}`);
