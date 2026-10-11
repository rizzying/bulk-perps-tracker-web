import { sql, json, fail } from "../server/db";
// Recorded platform OI samples (GitHub Actions every 15 min) for a time range, ms.
export async function GET(req: Request) {
  try { const q = new URL(req.url).searchParams; const from = new Date(+(q.get("from") ?? 0)), to = new Date(+(q.get("to") ?? Date.now()));
    const rows = await sql()`select extract(epoch from t)*1000 as t, oi_usd as oi from oi_samples where t >= ${from.toISOString()} and t < ${to.toISOString()} order by t`;
    return json({ points: rows.map((r: any) => ({ t: +r.t, oi: +r.oi })) }, 200, "public, s-maxage=600");
  } catch (e) { return fail(e); }
}
