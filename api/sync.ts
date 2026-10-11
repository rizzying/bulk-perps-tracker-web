import { sql, json, fail } from "../server/db";
// Encrypted journal sync. Server sees only {id, iv, blob}; id = PBKDF2(passphrase) hex, blob = AES-GCM ciphertext.
const okId = (s: string | null) => !!s && /^[0-9a-f]{64}$/.test(s);
export async function GET(req: Request) {
  try { const id = new URL(req.url).searchParams.get("id"); if (!okId(id)) return json({ error: "bad id" }, 400);
    const r = await sql()`select iv, blob, updated from journal_sync where id = ${id}`; return r.length ? json(r[0]) : json({ error: "not found" }, 404);
  } catch (e) { return fail(e); }
}
export async function PUT(req: Request) {
  try { const b = await req.json(); if (!okId(b?.id) || typeof b.iv !== "string" || typeof b.blob !== "string") return json({ error: "bad body" }, 400);
    if (b.blob.length > 3_000_000) return json({ error: "too large" }, 413);
    await sql()`insert into journal_sync (id, iv, blob, updated) values (${b.id}, ${b.iv}, ${b.blob}, now()) on conflict (id) do update set iv = excluded.iv, blob = excluded.blob, updated = now()`;
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
