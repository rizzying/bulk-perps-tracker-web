import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { short, usd, cls } from "../fmt";
import { applyEdit, Field, JournalRow, newManual } from "../journal/model";
import { getRepo } from "../journal/repo";
import { syncNow } from "../journal/sync";
import { importWallets, ImportResult } from "../journal/importer";

const PAGE = 100;
const toLocalInput = (t: number) => { const d = new Date(t - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const levTitle = (r: JournalRow) => r.levDerived === "setting" ? "Derived: this market's CURRENT leverage setting on the account (closed positions don't record leverage). Edit to correct." : "";

function Cell({ r, f, type = "number", onSave }: { r: JournalRow; f: Field; type?: string; onSave: (r: JournalRow, f: Field, v: unknown) => void }) {
  const val = (r as any)[f];
  const [v, setV] = useState<string>(f === "date" ? toLocalInput(val) : val == null ? "" : String(val));
  useEffect(() => { setV(f === "date" ? toLocalInput(val) : val == null ? "" : String(val)); }, [val, f]);
  const commit = () => { const cur = f === "date" ? toLocalInput(val) : val == null ? "" : String(val); if (v !== cur) onSave(r, f, f === "date" ? new Date(v).getTime() : v); };
  const edited = r.edited.includes(f);
  return <input className={`jcell ${edited ? "edited" : ""} ${f === "leverage" && r.levDerived ? "derived" : ""}`} type={type} step="any" value={v}
    title={edited ? "You edited this; re-import won't overwrite it" : f === "leverage" ? levTitle(r) : ""} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
}

export function Journal() {
  const wallets = useStore((s) => s.wallets); const accounts = useStore((s) => s.accounts);
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [busy, setBusy] = useState(""); const [result, setResult] = useState<ImportResult[] | null>(null); const [err, setErr] = useState("");
  const [market, setMarket] = useState(""); const [q, setQ] = useState(""); const [showDeleted, setShowDeleted] = useState(false); const [hideDust, setHideDust] = useState(true); const [page, setPage] = useState(0);
  const reload = async () => setRows(await (await getRepo()).all());
  useEffect(() => { reload().catch((e) => setErr(String(e))); }, []);
  const save = async (r: JournalRow, f: Field, v: unknown) => { const n = applyEdit(r, f, v); await (await getRepo()).put([n]); setRows((rs) => rs.map((x) => (x.id === n.id ? n : x))); };
  const add = async () => { const m = newManual(); await (await getRepo()).put([m]); setRows((rs) => [m, ...rs]); setPage(0); };
  const del = async (r: JournalRow) => {
    if (!confirm(`Delete this ${r.market} ${r.side} row${r.notes ? " and its notes" : ""}?`)) return;
    const repo = await getRepo();
    { const t = { ...r, deleted: true, updated: Date.now() }; await repo.put([t]); setRows((rs) => rs.map((x) => (x.id === r.id ? t : x))); } // tombstone: re-import won't bring it back
  };
  const restore = async (r: JournalRow) => { const t = { ...r, deleted: false, updated: Date.now() }; await (await getRepo()).put([t]); setRows((rs) => rs.map((x) => (x.id === r.id ? t : x))); };
  const doImport = async () => {
    setErr(""); setResult(null);
    const addrs = Object.keys(accounts).length ? Object.keys(accounts) : wallets.map((w) => w.address); // saved wallets + their sub-accounts
    try { const res = await importWallets(await getRepo(), addrs, setBusy); setResult(res); await reload(); } catch (e) { setErr(String((e as Error).message)); }
    setBusy("");
  };
  const visible = useMemo(() => rows.filter((r) => (showDeleted ? r.deleted : !r.deleted) && (!hideDust || r.source === "manual" || (r.extra.size ?? 0) * (r.entry ?? 0) >= 25) && (!market || r.market === market) && (!q || (r.notes + " " + r.market).toLowerCase().includes(q.toLowerCase()))), [rows, market, q, showDeleted, hideDust]);
  const markets = useMemo(() => [...new Set(rows.map((r) => r.market))].sort(), [rows]);
  const tot = visible.reduce((s, r) => s + (r.pnl ?? 0), 0); const wins = visible.filter((r) => (r.pnl ?? 0) > 0).length;
  const label = (w: string) => wallets.find((x) => x.address === w)?.label || (w ? short(w) : "manual");
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));

  const [pass, setPass] = useState(() => sessionStorage.getItem("bpt.syncPass") ?? ""); const [syncMsg, setSyncMsg] = useState(""); const [syncing, setSyncing] = useState(false);
  const doSync = async () => { setSyncing(true); setSyncMsg("");
    try { const repo = await getRepo(); const { merged, pulled } = await syncNow(pass, await repo.all()); await repo.put(merged); sessionStorage.setItem("bpt.syncPass", pass); await reload(); setSyncMsg(`Synced: ${merged.length} rows (${pulled} were on the server).`); }
    catch (e) { setSyncMsg(String((e as Error).message)); } setSyncing(false); };
  return <section className="card">
    <div className="row between"><h2>Journal</h2>
      <div className="row"><button onClick={doImport} disabled={!!busy || !wallets.length} title="Pull closed positions for your saved wallets (and sub-accounts). Safe to repeat: no duplicates, your notes/edits are kept.">⤓ Import from wallet</button>
        <button onClick={add}>＋ Manual entry</button></div></div>
    {busy && <div className="muted small">{busy}</div>}{err && <div className="neg small">{err}</div>}
    {result && <div className="small">{result.map((r) => <div key={r.wallet}>{label(r.wallet)}: {r.error ? <span className="neg">{r.error}</span> : `${r.fetched} closed positions → ${r.added} new, ${r.updated} updated, ${r.unchanged} unchanged${r.skippedDeleted ? `, ${r.skippedDeleted} previously deleted (kept deleted)` : ""}`}</div>)}</div>}
    <div className="row small" style={{ gap: 12, margin: "8px 0" }}>
      <select value={market} onChange={(e) => { setMarket(e.target.value); setPage(0); }}><option value="">All markets</option>{markets.map((m) => <option key={m}>{m}</option>)}</select>
      <input placeholder="search notes…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      <label title="Hide imported positions under $25 notional (micro / bot fills)"><input type="checkbox" checked={hideDust} onChange={(e) => { setHideDust(e.target.checked); setPage(0); }} /> hide dust (&lt;$25)</label>
      <label><input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setPage(0); }} /> show deleted</label>
      <span>{visible.length} rows · PnL <b className={cls(tot)}>{usd(tot)}</b> · win {visible.length ? Math.round((wins / visible.length) * 100) : 0}%</span>
    </div>
    <table className="journal"><thead><tr><th>Date (local)</th><th>Market</th><th>Position</th><th>Entry</th><th>Leverage</th><th>Close</th><th>PnL ($)</th><th>Notes</th><th>Source</th><th></th></tr></thead>
      <tbody>{visible.slice(page * PAGE, (page + 1) * PAGE).map((r) => <tr key={r.id} className={r.deleted ? "muted" : ""}>
        <td><Cell r={r} f="date" type="datetime-local" onSave={save} /></td>
        <td><Cell r={r} f="market" type="text" onSave={save} /></td>
        <td><select className={`jcell ${r.side === "long" ? "pos" : "neg"} ${r.edited.includes("side") ? "edited" : ""}`} value={r.side} onChange={(e) => save(r, "side", e.target.value)}><option value="long">long</option><option value="short">short</option></select></td>
        <td><Cell r={r} f="entry" onSave={save} /></td>
        <td className="levcell"><Cell r={r} f="leverage" onSave={save} />{r.levDerived && <span className="derivedtag" title={levTitle(r)}>derived</span>}</td>
        <td><Cell r={r} f="close" onSave={save} /></td>
        <td className={cls(r.pnl ?? 0)}><Cell r={r} f="pnl" onSave={save} /></td>
        <td><Cell r={r} f="notes" type="text" onSave={save} /></td>
        <td className="small muted" title={r.source === "import" ? `size ${r.extra.size} · fees ${r.extra.fees} · funding ${r.extra.funding} · ${r.extra.margin} · close: ${r.extra.closeReason} · opened ${r.extra.openTime ? new Date(r.extra.openTime).toLocaleString() : "?"}` : ""}>{r.source === "import" ? label(r.wallet) : "manual"}</td>
        <td>{r.deleted ? <button className="link" onClick={() => restore(r)}>restore</button> : <button className="link neg" onClick={() => del(r)} title="Delete row">✕</button>}</td>
      </tr>)}</tbody></table>
    {pages > 1 && <div className="row small" style={{ gap: 8, marginTop: 8 }}><button disabled={page === 0} onClick={() => setPage(page - 1)}>‹ prev</button><span>page {page + 1} / {pages}</span><button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>next ›</button></div>}
    <div className="small muted" style={{ marginTop: 8 }}>Imported from Bulk closed positions: PnL = realized PnL (before fees &amp; funding; hover "Source" for fees/funding/size). <span className="derivedtag">derived</span> leverage = the market's current leverage setting, because Bulk doesn't record leverage on closed positions. Edited cells are outlined and are never overwritten by re-import. Stored locally (SQLite).</div>
  <details className="sync small"><summary>Sync across devices (optional, end-to-end encrypted)</summary>
      <p className="muted">Your journal lives on this device. To use it on your phone too, pick a sync passphrase and enter the same one on each device. It's encrypted in your browser before upload; the server can't read it, and knowing your wallet address isn't enough to see or edit it. If you forget the passphrase, the synced copy can't be recovered (this device's copy stays).</p>
      <div className="row"><input type="password" placeholder="sync passphrase (10+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} /><button onClick={doSync} disabled={syncing || pass.length < 10}>{syncing ? "Syncing…" : "Sync now"}</button>{syncMsg && <span>{syncMsg}</span>}</div>
    </details>
  </section>;
}
