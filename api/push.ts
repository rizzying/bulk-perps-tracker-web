import { sql, json, fail } from "../server/db";
// Web-push subscription for server-side near-liq alerts (checked by GitHub Actions every ~15 min).
export async function GET() { return json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, enabled: !!(process.env.VAPID_PUBLIC_KEY && process.env.DATABASE_URL) }); }
export async function POST(req: Request) {
  try { const b = await req.json(); const s = b?.subscription; const ws = (b?.wallets ?? []).filter((w: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)).slice(0, 10);
    if (!s?.endpoint?.startsWith("https://") || !ws.length) return json({ error: "bad body" }, 400);
    const warn = Math.min(0.5, Math.max(0.01, +b.warn || 0.15)), danger = Math.min(warn, Math.max(0.005, +b.danger || 0.07));
    await sql()`insert into push_subs (endpoint, sub, wallets, warn, danger) values (${s.endpoint}, ${JSON.stringify(s)}, ${JSON.stringify(ws)}, ${warn}, ${danger})
      on conflict (endpoint) do update set sub = excluded.sub, wallets = excluded.wallets, warn = excluded.warn, danger = excluded.danger`;
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  try { const b = await req.json(); await sql()`delete from push_subs where endpoint = ${b?.endpoint ?? ""}`; return json({ ok: true }); } catch (e) { return fail(e); }
}
