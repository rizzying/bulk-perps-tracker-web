import { useEffect, useMemo, useState } from "react";
import { STRATEGIES, PRESETS, byId, killzoneOf } from "../strategies/catalog";
import { runConsensus, type Consensus } from "../strategies/consensus";
import { FAMILY_LABEL, type Family, type Signal, type StrategyId, type Ctx } from "../strategies/types";
import { CONSENSUS_BACKTEST } from "../strategies/backtest-results";
import { findSide, type SideResult, type SidePlan } from "../strategies/side";
import type { Candle } from "../ta/indicators";
import { px } from "../fmt";

const SK = "bpt.strategies.v1", VK = "bpt.strategyEyes.v1";
const loadSel = (): StrategyId[] => { try { const v = JSON.parse(localStorage.getItem(SK) || "null"); if (Array.isArray(v) && v.length) return v.filter((x) => byId[x as StrategyId]); } catch { /* */ } return PRESETS["All v1"]; };
const FAMS: Family[] = ["trend", "momentum", "structure", "volatility", "volume", "positioning"];
export type Band = { lo: number; hi: number; kind: "entry" | "sl" | "tp"; label: string; strength: number; side: "long" | "short"; dashed?: boolean };
export type PickMode = "long" | "short" | "auto";
const AGREE_TIP = "Agreement ≠ probability. It's the share of active strategy families pointing the same way. Most indicators come from the same price data, so agreement is confluence, not a win rate. In our backtest, higher agreement did NOT produce better results.";

export function StrategyPicker({ sym, ltf, htf, ctx, onBands, minRR = 3 }: { sym: string; ltf: Candle[] | undefined; htf: Candle[] | undefined; ctx: Ctx; onBands: (b: Band[]) => void; minRR?: number }) {
  const [mode, setMode] = useState<PickMode | null>(null);
  const [sel, setSel] = useState<StrategyId[]>(loadSel);
  const [eyes, setEyes] = useState<StrategyId[]>(() => { try { return JSON.parse(localStorage.getItem(VK) || "[]"); } catch { return []; } });
  const ran = mode === "auto"; const [gear, setGear] = useState(false);
  useEffect(() => localStorage.setItem(SK, JSON.stringify(sel)), [sel]); useEffect(() => localStorage.setItem(VK, JSON.stringify(eyes)), [eyes]);
  const toggle = (id: StrategyId) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const preset = (k: string) => setSel(PRESETS[k]);
  // closed candles only (drop the forming bar)
  const res: Consensus | null = useMemo(() => (ran && ltf && htf && ltf.length > 80 && sel.length ? runConsensus(sel, ltf.slice(0, -1), htf.slice(0, -1), ctx) : null), [ran, ltf, htf, sel, ctx.funding?.rate, ctx.oi?.changePct]);
  const sideRes: SideResult | null = useMemo(() => (mode && mode !== "auto" && ltf && htf && ltf.length > 80 && sel.length ? findSide(sel, ltf.slice(0, -1), htf.slice(0, -1), ctx, mode, minRR) : null), [mode, ltf, htf, sel, minRR, ctx.funding?.rate, ctx.oi?.changePct]);
  useEffect(() => {
    if (!sideRes) return; const r = sideRes; const b: Band[] = [];
    r.zones.forEach((zn, k) => { const d = zn.status !== "ready"; const w = zn.best ? 1 : 0.45; const tag = `${zn.best ? "★ " : ""}#${k + 1}`;
      b.push({ lo: zn.entry.lo, hi: zn.entry.hi, kind: "entry", label: `${tag} ${d ? "wait " : ""}${r.side} entry`, strength: w, side: r.side, dashed: d });
      b.push({ lo: zn.sl, hi: zn.sl, kind: "sl", label: `${tag} SL`, strength: w, side: r.side, dashed: d });
      b.push({ lo: zn.tp1, hi: zn.tp1, kind: "tp", label: `${tag} TP1 ${zn.rr1.toFixed(1)}R`, strength: w, side: r.side, dashed: d });
      b.push({ lo: zn.tp2, hi: zn.tp2, kind: "tp", label: `${tag} TP2 ${zn.rr2.toFixed(1)}R`, strength: w * 0.8, side: r.side, dashed: d }); });
    for (const p of r.plans) if (eyes.includes(p.id) && p.zone) b.push({ lo: p.zone.lo, hi: p.zone.hi, kind: "entry", label: `${byId[p.id].name}${p.active ? "" : " (pending)"}`, strength: 0.3, side: r.side, dashed: !p.active });
    onBands(b);
  }, [sideRes, eyes]);
  useEffect(() => {
    if (mode !== "auto") { if (!mode) onBands([]); return; }
    if (!res) { onBands([]); return; } const b: Band[] = []; const side = res.dir === "short" ? "short" : "long";
    if (res.entry && res.dir !== "neutral") { b.push({ lo: res.entry.lo, hi: res.entry.hi, kind: "entry", label: `consensus entry (${res.entry.labels.slice(0, 3).join(", ")})`, strength: Math.min(1, res.entry.families.length / 4), side });
      if (res.sl != null) b.push({ lo: res.sl, hi: res.sl, kind: "sl", label: "consensus SL", strength: 1, side }); res.tps.forEach((t, i) => b.push({ lo: t.price, hi: t.price, kind: "tp", label: `TP${i + 1} ${t.rr.toFixed(1)}R`, strength: Math.min(1, t.score / 3), side })); }
    for (const s of res.signals) if (eyes.includes(s.id) && s.direction !== "neutral" && s.entry) { const n = byId[s.id].name; const sd = s.direction as "long" | "short";
      b.push({ lo: s.entry.lo, hi: s.entry.hi, kind: "entry", label: `${n} entry`, strength: 0.35, side: sd }); if (s.sl != null) b.push({ lo: s.sl, hi: s.sl, kind: "sl", label: `${n} SL`, strength: 0.35, side: sd }); s.tp.slice(0, 2).forEach((t, i) => b.push({ lo: t, hi: t, kind: "tp", label: `${n} TP${i + 1}`, strength: 0.35, side: sd })); }
    onBands(b);
  }, [res, eyes]);
  const groupOf = (id: StrategyId) => (id === "bb" ? "volatility / momentum" : FAMILY_LABEL[byId[id].family]);
  return <div className="picker">
    <div className="pk-head"><span className="lbl">Strategies</span>
      <span className="presets">{Object.keys(PRESETS).map((k) => <button key={k} className={"chip preset" + (JSON.stringify([...PRESETS[k]].sort()) === JSON.stringify([...sel].sort()) ? " on" : "")} onClick={() => preset(k)}>{k}</button>)}</span>
      <button className="chip gear" aria-expanded={gear} onClick={() => setGear(!gear)} title="Strategy parameters">⚙ params</button></div>
    <div className="families">{FAMS.map((f) => { const ms = STRATEGIES.filter((s) => s.family === f); const on = ms.filter((s) => sel.includes(s.id)).length; return <div key={f} className="fam">
      <div className="fam-h">{FAMILY_LABEL[f]}{on >= 2 && <span className="badge corr" title="Correlated tools in one family are averaged: counted as one vote">correlated · 1 vote</span>}</div>
      <div className="chips">{ms.map((s) => <button key={s.id} role="switch" aria-checked={sel.includes(s.id)} className={"chip" + (sel.includes(s.id) ? " on" : "")} onClick={() => toggle(s.id)} title={s.short}>{sel.includes(s.id) ? "✓ " : ""}{s.name}</button>)}</div></div>; })}</div>
    {gear && <div className="small muted params">Defaults (v1, fixed): SMC pivot 5, OB/FVG retrace, SL 0.1 ATR beyond · ICT sweep of 20-bar extreme, MSS with ≥1.5 ATR displacement, OTE 0.62–0.79, killzones NY time (now {killzoneOf(Date.now()) ?? "outside"}; Silver Bullet NY 10–11 = 22:00–23:00 WIB until 1 Nov, then 21:00–22:00) · EMA ribbon 8/13/21/34/55 · MACD 12/26/9 · RSI 14, 30/70, pivot 5 · Bollinger 20/2σ, squeeze = 120-bar BBW low, mean reversion when ADX&lt;20 · Supertrend 10×3 · VWAP 00:00 UTC + 1σ/2σ, AVWAP from the last 10-bar swing · Donchian 20/10 · Funding/OI: buffer percentiles (≥24 samples) else ±0.01/0.03%/8h. All on 15m closed candles; bias = same strategies on 4h.</div>}
    <div className="findrow">
      <button className={"mode big long" + (mode === "long" ? " on" : "")} aria-pressed={mode === "long"} disabled={!sel.length || !ltf} onClick={() => setMode("long")}>▲ Find Long</button>
      <button className={"mode big short" + (mode === "short" ? " on" : "")} aria-pressed={mode === "short"} disabled={!sel.length || !ltf} onClick={() => setMode("short")}>▼ Find Short</button>
      <button className={"findbtn" + (mode === "auto" ? " primary" : "")} aria-pressed={mode === "auto"} disabled={!sel.length || !ltf} onClick={() => setMode("auto")}>Find setup with selected strategies (both sides)</button>
    </div>
    <div className="small muted">Find Long / Find Short check only that side: each ticked strategy's {"long/short"} trigger or the zone where it would fire, merged across families. Minimum reward : risk {minRR}R (judged on TP2, set below in the classic section). Updates with every candle refresh.</div>
    {!sel.length && <div className="small neg">Tick at least one strategy.</div>}
    {mode && !res && !sideRes && sel.length > 0 && <div className="muted small">Loading candles…</div>}
    {sideRes && <SideCard r={sideRes} sym={sym} />}
    {sideRes && <div className="scards">{sideRes.plans.map((p) => <PlanCard key={p.id} p={p} side={sideRes.side} eye={eyes.includes(p.id)} onEye={() => setEyes((e) => (e.includes(p.id) ? e.filter((x) => x !== p.id) : [...e, p.id]))} />)}</div>}
    {res && <ConsensusCard r={res} sym={sym} />}
    {res && <div className="scards">{res.signals.map((s) => <SignalCard key={s.id} s={s} group={groupOf(s.id)} eye={eyes.includes(s.id)} onEye={() => setEyes((e) => (e.includes(s.id) ? e.filter((x) => x !== s.id) : [...e, s.id]))} merged={res.merges.find((m) => m.b === s.id)} />)}</div>}
  </div>;
}

function ConsensusCard({ r, sym }: { r: Consensus; sym: string }) {
  const bt = CONSENSUS_BACKTEST.byLabel[r.label];
  const dirTxt = r.dir === "neutral" ? "MIXED" : r.dir.toUpperCase();
  return <div className={"consensus " + r.dir}>
    <div className="cs-top">
      <div><div className="lbl">{sym} consensus</div><div className={"cs-dir " + r.dir}>{dirTxt}</div></div>
      <span className={"badge lvl-" + r.label}>{r.label}</span>
      <div className="cs-agree" title={AGREE_TIP}><div className="lbl">Agreement <span className="info" tabIndex={0} aria-label={AGREE_TIP}>ⓘ</span></div>
        <div className="meter"><div style={{ width: `${Math.round(r.agreement * 100)}%` }} /></div>
        <div className="mono small">{Math.round(r.agreement * 100)}% · {r.breadth.agree} of {r.breadth.active} families</div></div>
      <div className="tfchips"><span className={"chip tf " + (r.biasDir ?? "")}>4h bias: {r.biasDir ?? "–"}</span><span className={"chip tf " + r.dir}>15m entry: {r.dir}</span></div>
    </div>
    {r.conflicts.length > 0 && <div className="conflict" role="alert">⚠ Conflict: {r.conflicts.join(" · ")}{r.tfAgree === false ? " (confidence capped at Mixed)" : ""}</div>}
    {r.dir !== "neutral" && r.entry ? <div className="cs-plan">
      <div className="stat"><div className="k">Entry zone</div><div className="v">{px(r.entry.lo)}{r.entry.hi - r.entry.lo > 1e-9 ? ` – ${px(r.entry.hi)}` : ""}</div><div className="small muted">levels from {r.entry.families.length} famil{r.entry.families.length === 1 ? "y" : "ies"}: {r.entry.labels.slice(0, 5).join(", ")}</div></div>
      <div className="stat"><div className="k">Stop loss</div><div className="v">{r.sl != null ? px(r.sl) : "–"}</div><div className="small muted">beyond the furthest agreeing invalidation + 0.2 ATR</div></div>
      <div className="stat"><div className="k">Targets</div>{r.tps.length ? r.tps.map((t, i) => <div key={i} className="v small-v">TP{i + 1} {px(t.price)} <span className={t.rr >= 1.2 ? "pos" : "neg"}>{t.rr.toFixed(2)}R</span></div>) : <div className="v">–</div>}</div>
    </div> : <div className="muted small">No consensus direction: the selected families cancel out or are all neutral. Stay flat.</div>}
    {r.rejected && <div className="conflict">✗ Setup rejected: {r.rejected}</div>}
    <details className="bt small"><summary>Backtest: "{r.label}" hit TP1 {Math.round(bt.win * 100)}% ({bt.n} trades, avg {bt.avgR >= 0 ? "+" : ""}{bt.avgR.toFixed(2)}R). <b>Higher agreement did not do better historically.</b></summary>
      <table className="bt-t"><thead><tr><th>Label</th><th>{CONSENSUS_BACKTEST.tf}<br />{CONSENSUS_BACKTEST.period}</th><th>{CONSENSUS_BACKTEST.longer.tf}<br />{CONSENSUS_BACKTEST.longer.period}</th></tr></thead>
        <tbody>{(["High", "Medium", "Mixed"] as const).map((l) => { const a = CONSENSUS_BACKTEST.byLabel[l], b = CONSENSUS_BACKTEST.longer.byLabel[l]; return <tr key={l} className={l === r.label ? "bestc" : ""}><td>{l}</td><td>{Math.round(a.win * 100)}% · {a.avgR >= 0 ? "+" : ""}{a.avgR.toFixed(2)}R · n={a.n}</td><td>{Math.round(b.win * 100)}% · {b.avgR >= 0 ? "+" : ""}{b.avgR.toFixed(2)}R · n={b.n}</td></tr>; })}</tbody></table>
      <div className="muted">Hyperliquid history, BTC+ETH+SOL, fees included, limit fill at the consensus entry, SL vs TP1, no parameters fitted, Funding/OI excluded (no history). Expectancy was negative or near zero at every label. Use the consensus to find confluence levels, not as a signal to trust. Agreement is not a win probability. Not financial advice.</div></details>
  </div>;
}

function SignalCard({ s, group, eye, onEye, merged }: { s: Signal; group: string; eye: boolean; onEye: () => void; merged?: { a: StrategyId; r: number } }) {
  const st = byId[s.id];
  return <div className={"scard " + s.direction}>
    <div className="prow"><b>{st.name}</b><span className={"pill dir " + s.direction}>{s.direction === "neutral" ? "no trade" : s.direction}</span>
      <button className={"eye" + (eye ? " on" : "")} aria-pressed={eye} disabled={s.direction === "neutral"} onClick={onEye} title="Show this strategy's levels on the chart">{eye ? "◉" : "○"} chart</button></div>
    <div className="small muted">{group}{merged ? ` · merged with ${byId[merged.a].name} (r=${merged.r.toFixed(2)})` : ""}</div>
    {s.direction !== "neutral" && <>
      <div className="meter thin" title={`strength ${Math.round(s.strength * 100)}%`}><div style={{ width: `${Math.round(s.strength * 100)}%` }} /></div>
      <div className="kv"><span>Entry</span><b>{s.entry ? `${px(s.entry.lo)} – ${px(s.entry.hi)}` : "–"}</b><span>SL</span><b>{s.sl != null ? px(s.sl) : "–"}</b><span>TP</span><b>{s.tp.slice(0, 2).map((t) => px(t)).join(" / ") || "–"}</b></div>
      <div className="small">Fired {s.freshnessBars} bar{s.freshnessBars === 1 ? "" : "s"} ago · invalid if {s.invalidation}</div></>}
    <ul className="reasons small">{s.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
  </div>;
}

function BtNote({ label }: { label: "High" | "Medium" | "Mixed" }) {
  const bt = CONSENSUS_BACKTEST.byLabel[label];
  return <div className="small muted">Backtest (both-sides consensus, Hyperliquid {CONSENSUS_BACKTEST.period}): "{label}" hit TP1 {Math.round(bt.win * 100)}% ({bt.n} trades, avg {bt.avgR >= 0 ? "+" : ""}{bt.avgR.toFixed(2)}R). Higher agreement did not do better historically. Agreement is not a win probability. Not financial advice.</div>;
}
function SideCard({ r, sym }: { r: SideResult; sym: string }) {
  const L = r.side === "long"; const S = r.side.toUpperCase();
  return <div className={"consensus " + r.side}>
    <div className="cs-top">
      <div><div className="lbl">{sym} · find {r.side}</div><div className={"cs-dir " + (r.status === "ready" ? r.side : "neutral")}>{r.status === "ready" ? `${S} READY` : r.status === "wait" ? `WAIT · ${S}` : `NO ${S} ZONE`}</div></div>
      <span className={"badge lvl-" + r.label}>{r.label}</span>
      <div className="cs-agree" title={AGREE_TIP}><div className="lbl">{r.side} agreement <span className="info" tabIndex={0} aria-label={AGREE_TIP}>ⓘ</span></div>
        <div className="meter"><div style={{ width: `${Math.round(r.agreement * 100)}%` }} /></div>
        <div className="mono small">{Math.round(r.agreement * 100)}% · {r.breadth.agree} of {r.breadth.active} active families say {r.side}</div></div>
      <div className="tfchips"><span className={"chip tf " + (r.biasDir ?? "")}>4h bias: {r.biasDir ?? "–"}</span></div>
    </div>
    {r.opposing.length > 0 && <div className="conflict">⚠ Against this {r.side}: {r.opposing.join(" · ")}</div>}
    {r.zones.length ? <>
      <div><b>{r.status === "ready" ? `★ Entry now near ${px(r.zones[0].entryPx)}` : <>★ Wait for price at <span className="mono">{px(r.zones[0].entry.mid)}</span></>}</b> <span className="muted small">(best of {r.zones.length} {r.side} zone{r.zones.length > 1 ? "s" : ""}, ranked by family confluence, then side and distance)</span></div>
      <div className="zones">{r.zones.map((zn, k) => <div key={k} className={"zone" + (zn.best ? " best" : "")}>
        <div className="prow"><b>{zn.best ? "★ " : ""}Zone {k + 1}</b><span className={"pill dir " + (zn.status === "ready" ? r.side : "neutral")}>{zn.status === "ready" ? "ready" : `wait · ${zn.distAtr.toFixed(1)} ATR`}</span><span className={"badge lvl-" + zn.label}>{zn.label}</span></div>
        <div className="kv"><span>Entry</span><b>{px(zn.entry.lo)} – {px(zn.entry.hi)}</b><span>SL</span><b>{px(zn.sl)}</b><span>TP1</span><b>{px(zn.tp1)} · {zn.rr1.toFixed(2)}R</b><span>TP2</span><b>{px(zn.tp2)} · <span className={zn.meetsRR ? "pos" : "neg"}>{zn.rr2.toFixed(2)}R</span></b>
          <span>Breadth</span><b>{zn.families} of {zn.famTotal} families · {zn.liveCount} firing</b></div>
        <div className="small muted">{zn.contributors.join(", ")} <span title="* = pending (would trigger here)">(* pending)</span></div>
        {zn.waitFor.length > 0 && <details className="small" open={zn.best}><summary>Still needs to happen ({zn.waitFor.length})</summary><ul className="checks">{zn.waitFor.map((w, i) => <li key={i}>○ {w}</li>)}</ul></details>}
      </div>)}</div>
      <div className="small muted">Min reward : risk {r.minRR}R judged on TP2. Waiting zones are drawn dashed on the chart. Not a signal yet until ready.</div>
    </> : <div className="muted small">No {r.side} confluence zone within 6 ATR. Stay flat.</div>}
    <BtNote label={r.label} />
  </div>;
}
function PlanCard({ p, side, eye, onEye }: { p: SidePlan; side: "long" | "short"; eye: boolean; onEye: () => void }) {
  const st = byId[p.id];
  return <div className={"scard " + (p.active ? side : "neutral")}>
    <div className="prow"><b>{st.name}</b><span className={"pill dir " + (p.active ? side : "neutral")}>{p.active ? `${side} now` : "pending"}</span>
      <button className={"eye" + (eye ? " on" : "")} aria-pressed={eye} disabled={!p.zone} onClick={onEye} title="Show this strategy's zone on the chart">{eye ? "◉" : "○"} chart</button></div>
    <div className="small muted">{FAMILY_LABEL[p.family]} · {p.signal.direction === "neutral" ? "no signal now" : `currently ${p.signal.direction}`}</div>
    <div className="kv"><span>Zone</span><b>{p.zone ? `${px(p.zone.lo)} – ${px(p.zone.hi)}` : "–"}</b><span>SL</span><b>{p.sl != null ? px(p.sl) : "–"}</b><span>TP</span><b>{p.tps.slice(0, 2).map((t) => px(t)).join(" / ") || "–"}</b></div>
    {p.active ? <ul className="reasons small">{p.signal.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul> : <ul className="reasons small">{p.waitFor.map((x, i) => <li key={i}>needs: {x}</li>)}</ul>}
  </div>;
}
