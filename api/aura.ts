// Proxy for aurabulk.xyz (no CORS). Only wallet/leaderboard reads; cached at Vercel's edge for 5 min.
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") || "";
  if (!/^(wallet\?address=[1-9A-HJ-NP-Za-km-z]{32,44}|leaderboard\?tab=(aura|volume|pnl)&limit=\d{1,3})$/.test(u)) return new Response("bad path", { status: 400 });
  const r = await fetch(`https://www.aurabulk.xyz/api/${u}`, { headers: { accept: "application/json" } });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
