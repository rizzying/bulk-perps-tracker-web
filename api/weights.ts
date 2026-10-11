import { sql, json, fail, NotConfigured } from "../server/db.js";
// Weekly AURA weight vectors + residuals appended by the Saturday refit job.
export async function GET() {
  try { const rows = await sql()`select week, w, resid, platform, n from weekly_weights order by week`; return json({ weekly: rows }, 200, "public, s-maxage=1800"); }
  catch (e) { return e instanceof NotConfigured ? json({ weekly: [] }, 200, "public, s-maxage=600") : fail(e); }
}
