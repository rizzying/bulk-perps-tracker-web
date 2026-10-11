/**
 * Optional journal sync, end-to-end encrypted. Journal is local-first (this browser). To sync devices, the user picks a passphrase:
 *   id  = PBKDF2-SHA256(passphrase, "bpt-journal-id", 200k) → 64 hex   (server lookup key; reveals nothing about wallets)
 *   key = PBKDF2-SHA256(passphrase, "bpt-journal-key", 200k) → AES-GCM-256
 * Server stores only {id, iv, ciphertext}. Knowing a wallet address gives no access; losing the passphrase loses the synced copy.
 */
import type { JournalRow } from "./model";
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function derive(pass: string) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  const idBits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("bpt-journal-id"), iterations: 200_000 }, base, 256);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("bpt-journal-key"), iterations: 200_000 }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { id: [...new Uint8Array(idBits)].map((x) => x.toString(16).padStart(2, "0")).join(""), key };
}
export async function encryptRows(pass: string, rows: JournalRow[]) {
  const { id, key } = await derive(pass); const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify({ v: 1, rows })));
  return { id, iv: b64(iv), blob: b64(ct) };
}
export async function decryptRows(pass: string, iv: string, blob: string): Promise<JournalRow[]> {
  const { key } = await derive(pass); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(blob));
  return JSON.parse(new TextDecoder().decode(pt)).rows;
}
export const idFor = async (pass: string) => (await derive(pass)).id;
/** Merge: per row id, the newer `updated` wins (deletions are soft flags, so they sync too). */
export function mergeRows(local: JournalRow[], remote: JournalRow[]): JournalRow[] {
  const m = new Map(local.map((r) => [r.id, r]));
  for (const r of remote) { const l = m.get(r.id); if (!l || (r.updated ?? 0) > (l.updated ?? 0)) m.set(r.id, r); }
  return [...m.values()];
}
/** Pull → merge → push. Returns merged rows (caller writes them to the local repo). */
export async function syncNow(pass: string, local: JournalRow[]) {
  if (pass.length < 10) throw new Error("Use a passphrase of at least 10 characters");
  const id = await idFor(pass); let remote: JournalRow[] = [];
  const g = await fetch(`/api/sync?id=${id}`);
  if (g.status === 503) throw new Error("Sync isn't configured on this server");
  if (g.ok) { const d = await g.json(); try { remote = await decryptRows(pass, d.iv, d.blob); } catch { throw new Error("Couldn't decrypt: wrong passphrase?"); } }
  const merged = mergeRows(local, remote);
  const p = await fetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(await encryptRows(pass, merged)) });
  if (!p.ok) throw new Error(`Sync upload failed (${p.status})`);
  return { merged, pulled: remote.length };
}
