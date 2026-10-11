import { neon } from "@neondatabase/serverless";
/** Postgres over HTTP (Neon serverless driver; works with any Neon/Supabase-pooled URL that Neon's driver accepts). */
export const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const sql = () => { const u = dbUrl(); if (!u) throw new NotConfigured(); return neon(u); };
export class NotConfigured extends Error { constructor() { super("DATABASE_URL not configured"); } }
export const json = (body: unknown, status = 200, cache = "no-store") => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });
export const fail = (e: unknown) => e instanceof NotConfigured ? json({ error: "server storage not configured" }, 503) : json({ error: String((e as Error)?.message ?? e) }, 500);
