import { useState } from "react";
import { useStore } from "../store";
import { short } from "../fmt";
export function Wallets() {
  const { wallets, accounts, addWallet, removeWallet } = useStore();
  const [addr, setAddr] = useState(""); const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); const r = await addWallet(addr, label); setBusy(false); setErr(r);
    if (!r) { setAddr(""); setLabel(""); }
  };
  return (
    <section className="card">
      <h2>Wallets</h2>
      <form onSubmit={submit} className="row">
        <input placeholder="Paste a Bulk wallet address" value={addr} onChange={(e) => setAddr(e.target.value)} style={{ flex: 3 }} />
        <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1 }} />
        <button disabled={busy || !addr}>{busy ? "Checking…" : "Add"}</button>
      </form>
      {err && <div className="err">{err}</div>}
      <ul className="wallets">
        {wallets.map((w) => {
          const a = accounts[w.address];
          const subs = Object.entries(accounts).filter(([, v]) => v.parent === w.address);
          return (
            <li key={w.address}>
              <b>{w.label}</b> <code title={w.address}>{short(w.address)}</code>
              {a?.error ? <span className="err"> {a.error}</span> : !a ? <span className="muted"> loading…</span> : null}
              {subs.length > 0 && <span className="muted"> · {subs.length} sub-account{subs.length > 1 ? "s" : ""}</span>}
              <button className="link" onClick={() => removeWallet(w.address)}>remove</button>
            </li>
          );
        })}
        {!wallets.length && <li className="muted">Add a wallet address to start tracking. Read-only — no keys needed.</li>}
      </ul>
    </section>
  );
}
