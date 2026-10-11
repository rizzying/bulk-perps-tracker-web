import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { client } from "../api/client";
import { short, usd } from "../fmt";
import { liveScenarios, OpenPos, CLOSE_FEE, BAND, confidenceOf, dailyRows, DAY, isBulkAddress, maker, Model, monteCarlo, pointTrading, weekEnd, weekFeatures, weekOf, weekStart } from "../aura/estimator";
import { loadServerModel, actualFor, auraWallet, AuraWallet, Boost, boostActive, loadBoost, loadModel, loadRaw, LoadedRaw, platformFor, pushLookup, recentLookups, saveBoost } from "../aura/data";

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const SLIDER = [0, 1e3, 5e3, 1e4, 25e3, 5e4, 1e5, 25e4, 5e5, 1e6, 2.5e6, 5e6, 1e7];
const countdown = (ms: number) => { if (ms <= 0) return "closing…"; const s = Math.floor(ms / 1000); return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
const jkt = (t: number) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const NOTE = "Estimate. Outlier weeks possible (unmodeled bonuses).";

export function Aura() {
  const wallets = useStore((s) => s.wallets);
  const [subject, setSubject] = useState<string>(wallets[0]?.address ?? "");
  const [lookup, setLookup] = useState(""); const [lookupErr, setLookupErr] = useState(""); const [recent, setRecent] = useState(recentLookups());
  const [model, setModel] = useState<Model>(loadModel()); const [refitMsg, setRefitMsg] = useState("");
  useEffect(() => { if (!subject && wallets[0]) setSubject(wallets[0].address); }, [wallets, subject]);
  // weekly refit runs server-side (GitHub Actions, Saturdays); the app just loads the appended weights
  useEffect(() => { loadServerModel().then(setModel); }, []);
  const check = () => { const a = lookup.trim(); if (!isBulkAddress(a)) { setLookupErr("Not a valid Bulk (Solana-style base58) address"); return; } setLookupErr(""); pushLookup(a); setRecent(recentLookups()); setSubject(a); };
  const saved = wallets.find((w) => w.address === subject);
  return <>
    <section className="card">
      <div className="row between"><h2>Points / AURA <span className="badge est">ESTIMATE</span></h2><span className="small muted">{model.source === "in-app" ? `model refit in-app: ${model.fittedOn}` : `model v2 · ${model.fittedOn}`}{refitMsg ? ` · ${refitMsg}` : ""}</span></div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {wallets.map((w) => <button key={w.address} className={"tab " + (subject === w.address ? "on" : "")} onClick={() => setSubject(w.address)}>{w.label || short(w.address)}</button>)}
        <span className="muted small">or check any wallet:</span>
        <input className="lookup" placeholder="paste any Bulk address (not saved)" value={lookup} onChange={(e) => setLookup(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} />
        <button onClick={check}>Check</button>{lookupErr && <span className="neg small">{lookupErr}</span>}
      </div>
      {recent.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>Recent: {recent.map((a) => <button key={a} className="link" onClick={() => setSubject(a)}>{short(a)}</button>)}<button className="link" onClick={() => { localStorage.removeItem("aura.recentLookups.v1"); setRecent([]); }}>clear</button></div>}
    </section>
    {subject && <WalletEstimate key={subject} address={subject} label={saved ? saved.label || short(subject) : `${short(subject)} (lookup, not saved)`} model={model} saved={!!saved} />}
  </>;
}

function WalletEstimate({ address, label, model, saved }: { address: string; label: string; model: Model; saved: boolean }) {
  const [raw, setRaw] = useState<LoadedRaw | null>(null); const [aw, setAw] = useState<AuraWallet | null | undefined>(undefined);
  const [plat, setPlat] = useState<Record<number, { vol: number; oih: number; source: string }>>({});
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [now, setNow] = useState(Date.now());
  const [extraIdx, setExtraIdx] = useState(0); const [thr, setThr] = useState<number | null>(null); const [boost, setBoost] = useState<Boost>(loadBoost());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const cur = weekOf(now);
  const load = async () => {
    setErr(""); setBusy("loading history…");
    try { setRaw(await loadRaw(address, weekStart(1) - 14 * DAY, setBusy)); } catch (e) { setErr(String((e as Error).message)); }
    setBusy("platform totals…"); const P: typeof plat = {};
    for (let w = 1; w < weekOf(Date.now()); w++) { try { P[w] = await platformFor(model, w); } catch { /* skip */ } } setPlat(P);
    setBusy(""); try { setAw(await auraWallet(address)); } catch { setAw(null); }
  };
  useEffect(() => { void load(); const t = setInterval(load, 15 * 60_000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [address, model]);

  const prev = plat[cur - 1];
  const elapsedH = Math.min(168, Math.max(0, (now - weekStart(cur)) / 36e5)); const elapsedD = elapsedH / 24;
  const obs = raw ? weekFeatures(raw, cur, now) : null;
  const pool = useMemo(() => raw ? [...dailyRows(raw, weekStart(cur) - 14 * DAY, weekStart(cur)), ...dailyRows(raw, weekStart(cur), weekStart(cur) + Math.floor(elapsedD) * DAY)] : [], [raw, cur, Math.floor(elapsedD)]);
  const feeRate = obs && obs.vol > 0 ? obs.fees / obs.vol : 0.00035;
  const extra = SLIDER[extraIdx];
  const { pos: openPos, src: posSrc } = useOpenPositions(raw?.accounts ?? [address], saved);
  const minute = Math.floor(now / 60_000);
  const live = useMemo(() => obs ? liveScenarios(obs, openPos, now, cur) : null, [obs?.vol, obs?.oih, obs?.hoursOpen, JSON.stringify(openPos.map((p) => [p.size, p.entry, Math.round(p.mark)])), minute]);
  const forced = live?.forced;
  const mc = useMemo(() => obs && prev ? monteCarlo(model, obs, elapsedD, pool, prev, { extraVol: extra, feeRate, forced }) : null, [forced, obs?.vol, obs?.oih, obs?.hoursOpen, prev, pool, model, extra, Math.floor(elapsedH)]);
  const mc0 = useMemo(() => obs && prev ? monteCarlo(model, obs, elapsedD, pool, prev, { feeRate, forced }) : null, [forced, obs?.vol, obs?.oih, obs?.hoursOpen, prev, pool, model, Math.floor(elapsedH)]);
  const now0 = obs && prev ? pointTrading(model, obs, prev.vol, prev.oih) : null;
  const mk = obs ? maker(obs.makerVol) : 0, mkPace = obs && elapsedH > 1 ? maker(obs.makerVol * 168 / elapsedH) : 0;
  const conf = obs ? confidenceOf(elapsedH, obs.vol) : null;
  const X = thr ?? (mc0 ? Math.max(1, Math.round(mc0.p50)) : 10);
  const bActive = boostActive(boost, now);
  const setB = (p: Partial<Boost>) => { const b = { ...boost, ...p }; setBoost(b); saveBoost(b); };
  const past = useMemo(() => raw ? Array.from({ length: cur - 1 }, (_, i) => i + 1).map((w) => { const f = weekFeatures(raw, w); const p = plat[w]; return { w, f, e: p ? pointTrading(model, f, p.vol, p.oih) : null, m: maker(f.makerVol), a: actualFor(aw ?? null, w) }; }) : [], [raw, plat, aw, model, cur]);
  const errs = past.filter((r) => r.e && r.e.mid > 0 && (r.a?.trading ?? 0) > 0).map((r) => Math.abs(Math.log(r.a!.trading! / r.e!.mid)));

  return <>
    <section className="card aura">
      <div className="row between"><h3>{label} · week {cur}</h3><div className="row">{busy && <span className="muted small">{busy}</span>}<button onClick={load} disabled={!!busy}>refresh</button></div></div>
      {err && <div className="neg small">{err}</div>}
      <LiveStrip L={live} src={posSrc} nAcc={raw?.accounts.length ?? 1} model={model} prev={prev} now={now} week={cur} />
      {raw && !raw.complete && <div className="small neg">History is very long; only the most recent pages were loaded, so older weeks may be incomplete.</div>}
      <div className="grid4">
        <div className="stat"><div className="k">Drop countdown</div><div className="v">{countdown(weekEnd(cur) - now)}</div><div className="small muted">week closes {jkt(weekEnd(cur))} WIB (Sat 06:00 UTC)</div></div>
        <div className="stat"><div className="k">Forecast trading AURA (P50)</div><div className="v">{mc0 ? `~${n0(mc0.p50)}` : "…"}</div><div className="small muted">P10–P90: {mc0 ? `${n0(mc0.p10)} – ${n0(mc0.p90)}` : "…"} (Monte Carlo, {1500} sims)</div></div>
        <div className="stat"><div className="k">Realized only (ignores open positions)</div><div className="v">{now0 ? `~${n0(now0.mid)}` : "…"}</div><div className="small muted">range ×/÷{BAND}: {now0 ? `${n0(now0.lo)} – ${n0(now0.hi)}` : ""}</div></div>
        <div className="stat"><div className="k">Confidence</div><div className={`v conf-${conf?.level ?? "Low"}`}>{conf?.level ?? "…"}</div><div className="small muted">{conf?.why}</div></div>
      </div>
      <div className="row small" style={{ gap: 18, flexWrap: "wrap" }}>
        <span>This week so far: closed-position volume <b>{obs ? usd(obs.vol, 0) : "…"}</b> · fees <b>{obs ? usd(obs.fees, 2) : "…"}</b> · OI-hours <b>{obs ? usd(obs.oih, 0) : "…"}</b> · hours with a position open <b>{obs?.hoursOpen ?? "…"}</b>/168</span>
        <span>P(trading AURA &gt; <input className="thr" type="number" min={0} value={X} onChange={(e) => setThr(+e.target.value)} />) = <b>{mc0 ? `${Math.round(mc0.pAbove(X) * 100)}%` : "…"}</b></span>
      </div>
      <div className="row small" style={{ gap: 18, marginTop: 6 }}>
        <span>Maker AURA (separate): <b>~{n0(mk)}</b> so far, ~{n0(mkPace)} at pace (maker volume {obs ? usd(obs.makerVol, 0) : "…"})</span>
        {bActive && mc0 && <span>Boost promo ×{boost.multiplier}: <b>+{n0(mc0.p50 * (boost.multiplier - 1))}</b> (separate line, user-configured)</span>}
      </div>
      <div className="whatif">
        <label>What if you trade <b>{usd(extra, 0)}</b> more this week?</label>
        <input type="range" min={0} max={SLIDER.length - 1} step={1} value={extraIdx} onChange={(e) => setExtraIdx(+e.target.value)} />
        <span>→ P50 ~<b>{mc ? n0(mc.p50) : "…"}</b> ({mc && mc0 ? `${mc.p50 >= mc0.p50 ? "+" : ""}${n0(mc.p50 - mc0.p50)}` : ""}; P10–P90 {mc ? `${n0(mc.p10)} – ${n0(mc.p90)}` : ""}) · extra fees at your rate {(feeRate * 1e4).toFixed(1)} bps</span>
      </div>
      <details className="small"><summary>Boost promo (off by default)</summary>
        <label><input type="checkbox" checked={boost.enabled} onChange={(e) => setB({ enabled: e.target.checked })} /> active</label> · multiplier <input className="thr" type="number" step="0.01" value={boost.multiplier} onChange={(e) => setB({ multiplier: +e.target.value })} />
        · start <input type="date" value={boost.start} onChange={(e) => setB({ start: e.target.value })} /> · duration <input className="thr" type="number" value={boost.days} onChange={(e) => setB({ days: +e.target.value })} /> days
        <div className="muted">Shown as a separate line only while active. Historical weeks are not adjusted, and trading AURA is not inflated.</div></details>
      <div className="small muted">{NOTE} Platform totals: previous week {prev ? `${usd(prev.vol / 1e6, 0)}M vol, ${usd(prev.oih / 1e6, 0)}M OI-hours (${prev.source})` : "…"}.</div>
    </section>
    <section className="card">
      <h3>Past weeks: estimate vs actual AURA</h3>
      <table><thead><tr><th>Week</th><th>Closed (WIB)</th><th>Volume</th><th>Fees</th><th>OI-hours</th><th>Hours open</th><th>Est. trading</th><th>Range ×/÷{BAND}</th><th>Actual trading</th><th>Actual / est.</th><th>Est. maker</th><th>Actual maker</th></tr></thead>
        <tbody>{past.map(({ w, f, e, m, a }) => <tr key={w}><td>{w}</td><td>{jkt(weekEnd(w))}</td><td>{usd(f.vol, 0)}</td><td>{usd(f.fees, 2)}</td><td>{usd(f.oih, 0)}</td><td>{f.hoursOpen}</td>
          <td>{e && f.vol > 0 ? n0(e.mid) : "–"}</td><td className="small">{e && f.vol > 0 ? `${n0(e.lo)} – ${n0(e.hi)}` : ""}</td>
          <td>{aw === undefined ? "…" : a?.trading != null ? n0(a.trading) : <span className="muted small">{aw ? "0 / not listed" : "unavailable"}</span>}</td>
          <td className={e && a?.trading && Math.abs(Math.log(a.trading / e.mid)) > Math.log(BAND) ? "neg" : ""}>{e && a?.trading && e.mid > 0 ? `×${(a.trading / e.mid).toFixed(2)}` : ""}</td>
          <td>{f.makerVol > 0 ? n0(m) : "–"}</td><td>{a?.maker != null ? n0(a.maker) : "–"}</td></tr>)}</tbody></table>
      {errs.length > 0 && <div className="small">This wallet: typical error ×{Math.exp(errs.sort((x, y) => x - y)[Math.floor(errs.length / 2)]).toFixed(2)} over {errs.length} weeks; {errs.filter((x) => x <= Math.log(BAND)).length}/{errs.length} inside the range.</div>}
      <div className="small muted">Actual AURA from aurabulk.xyz/api/wallet. Weeks run Sat 06:00 UTC → Sat 06:00 UTC. The model counts volume from closed positions only (master + sub-accounts). Weeks 1–5 use the platform totals from the fit; later weeks use klines and the app's own OI recorder.</div>
    </section>
    <section className="card small"><h3>Caveats</h3><ul>
      <li>{NOTE} Tier-balanced calibration (tier from the estimate itself, cuts 148/512/1,900/5,300/30,000; median ×1.2 because both models under-predicted by ~20%). Walk-forward backtest over 1,996 wallet-weeks: typical error ×1.52, about 81% of actual results inside P10–P90, ranges ~13% tighter than the previous model. Silver and Challenger wallets are less reliable (79% and 73% coverage).</li>
      <li>Boosts, gauntlets, referrals and protocol AURA are not modeled. There is probably a cap or wash filter on huge volume.</li>
      <li>Early in the week the forecast is mostly assumption: how much you'll still trade, and platform totals.</li>
      <li>Platform OI comes from Bulk /stats, sampled while the app runs, scaled ×1.93 to match the fit's bulkstats data.</li>
    </ul></section>
  </>;
}

/** Live strip: saved wallets use the store's live WS account data + marks; lookups poll a REST snapshot every 30 s. */
function useOpenPositions(accounts: string[], saved: boolean): { pos: OpenPos[]; src: string } {
  const st = useStore((s) => s.accounts), marks = useStore((s) => s.marks);
  const [rest, setRest] = useState<OpenPos[] | null>(null);
  useEffect(() => { if (saved || !accounts.length) return; let alive = true;
    const go = async () => { const out: OpenPos[] = []; for (const a of accounts) { try { const fa: any = await client.fullAccount(a); for (const p of fa.positions ?? []) out.push({ size: p.size, entry: p.price, mark: p.fairPrice, fees: p.fees, entryMs: p.averageEntryTime ? p.averageEntryTime / 1e6 : null }); } catch { /* skip */ } } if (alive) setRest(out); };
    void go(); const t = setInterval(go, 30_000); return () => { alive = false; clearInterval(t); }; }, [accounts.join(","), saved]);
  if (!saved) return { pos: rest ?? [], src: rest ? "REST snapshot, refreshes every 30 s" : "loading…" };
  const pos: OpenPos[] = []; for (const a of accounts) for (const p of st[a]?.data?.positions ?? []) pos.push({ size: p.size, entry: p.price, mark: marks[p.symbol] ?? p.fairPrice, fees: p.fees, entryMs: p.averageEntryTime ? p.averageEntryTime / 1e6 : null });
  return { pos, src: "live (WebSocket)" };
}
function LiveStrip({ L, src, nAcc, model, prev, now, week }: { L: ReturnType<typeof liveScenarios> | null; src: string; nAcc: number; model: Model; prev?: { vol: number; oih: number }; now: number; week: number }) {
  if (!L || !prev) return null;
  const c = pointTrading(model, L.closeNow, prev.vol, prev.oih), h = pointTrading(model, L.hold, prev.vol, prev.oih);
  const holdLower = L.openCount > 0 && h.mid < c.mid;
  return <div className="livestrip">
    <div><span className="k">Open positions</span><b>{L.openCount}</b></div>
    <div title={`This week's realized volume, fees and OI-hours, plus closing all open positions at mark now (open+close volume, fees paid so far + ${(CLOSE_FEE * 1e4).toFixed(1)} bps close fee)`}><span className="k">AURA if closed now</span><b>~{n0(c.mid)}</b> <span className="small muted">({n0(c.lo)}–{n0(c.hi)})</span></div>
    <div title="Open positions stay at current size until the cutoff and are closed AT the cutoff at the current mark: close volume + fees, plus OI-hours and hours-open accrued to the cutoff"><span className="k">Hold to cutoff</span><b>~{n0(h.mid)}</b> <span className="small muted">({n0(h.lo)}–{n0(h.hi)})</span></div>
    <div><span className="k">Cutoff in</span><b>{countdown(weekEnd(week) - now)}</b> <span className="small muted">Sat 06:00 UTC / 13:00 WIB</span></div>
    <div className="small muted">{src} · master + {Math.max(0, nAcc - 1)} sub-account(s)</div>
    {holdLower && <div className="small muted" style={{ flexBasis: "100%" }}>Holding scores lower than closing now: the model gives more OI-hours a boost but more hours with a position open a penalty (−0.202·ln(1+hours open)), and here the penalty wins. Both are estimates, ×/÷2.6.</div>}
  </div>;
}
