import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, LineStyle, CrosshairMode, UTCTimestamp } from "lightweight-charts";
import { client } from "../api/client";
import { Candle, ema, rsi } from "../ta/indicators";
import { evaluateSetup, SETUP_SYMBOLS, SetupResult, HTF, LTF, EmaCfg, DEFAULT_EMA, sanitizeEma, emaLabel, Mode, SideResult , histHit, histLabel } from "../ta/setup";
import { estimateLiqMap, LiqBin, DEFAULT_TIERS } from "../ta/liqmap";
import { tokenColor, useThemeName } from "../ui/theme";
import { useStore } from "../store";
import { px, usd } from "../fmt";
import { StrategyPicker, type Band } from "./StrategyPicker";
import { fundingCtx } from "../strategies/buffer";

const MS: Record<string, number> = { "15m": 9e5, "1h": 36e5, "4h": 144e5 };
const toT = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
// 07:00 UTC+7 -> chart displays in local time
const local = (ms: number) => toT(ms + 7 * 3600e3);

type MarketData = { htf: Candle[]; ltf: Candle[]; heat: Candle[]; trading: boolean; maxLev: number; oiUsd: number; funding: number };
async function loadMarket(sym: string, info: Map<string, { status: string; maxLeverage: number }>): Promise<MarketData> {
  const now = Date.now();
  const htf = await client.klines(sym, HTF, now - 60 * 86400e3);
  const ltf = await client.klines(sym, LTF, now - 4 * 86400e3);
  const heat = await client.klines(sym, "1h", now - 21 * 86400e3); // 1h: swing zones + heatmap
  const t = await client.ticker(sym);
  const mi = info.get(sym); const trading = mi?.status === "TRADING";
  return { htf, ltf, heat, trading, maxLev: mi?.maxLeverage ?? 20, oiUsd: t.openInterest * t.markPrice, funding: t.fundingRate };
}

const EK = "bpt.emaCfg.v1";
const loadEma = (): EmaCfg => { try { return sanitizeEma({ ...DEFAULT_EMA, ...JSON.parse(localStorage.getItem(EK) || "{}") }); } catch { return DEFAULT_EMA; } };
const EMA_COLORS = ["var(--accent-ink)", "var(--warn-ink)", "var(--ink-2)"];

function EmaSettings({ cfg, onChange }: { cfg: EmaCfg; onChange: (c: EmaCfg) => void }) {
  const [draft, setDraft] = useState(cfg);
  useEffect(() => setDraft(cfg), [cfg]);
  const commit = (p: Partial<EmaCfg>) => { const n = { ...draft, ...p }; setDraft(n); onChange(sanitizeEma(n)); };
  const num = (k: "fast" | "slow" | "third", disabled = false) => <input type="number" min={2} max={200} value={draft[k]} disabled={disabled}
    onChange={(e) => setDraft({ ...draft, [k]: +e.target.value })} onBlur={(e) => commit({ [k]: +e.target.value })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} style={{ width: 58 }} />;
  return (
    <div className="row emaset" style={{ alignItems: "center", flexWrap: "wrap", gap: 14, margin: "4px 0 12px" }}>
      <b className="small">Trend EMAs ({HTF})</b>
      <label>Fast {num("fast")}</label>
      <label>Slow {num("slow")}</label>
      <label><input type="checkbox" checked={draft.thirdOn} onChange={(e) => commit({ thirdOn: e.target.checked })} /> Third EMA</label>
      <label style={{ opacity: draft.thirdOn ? 1 : 0.5 }}>{num("third", !draft.thirdOn)}</label>
      <button className="link" onClick={() => onChange(DEFAULT_EMA)}>reset to 21/50</button>
      <span className="muted small">Long trend = fast above slow and price above both{draft.thirdOn ? " (and above the third)" : ""}; short = the mirror. Max length 200 (Bulk keeps ~39 days of 4h candles).</span>
    </div>
  );
}

export function Markets() {
  const [emaCfg, setEmaCfgState] = useState<EmaCfg>(loadEma);
  const [mode, setMode] = useState<Mode>("auto");
  const [minRR, setMinRRState] = useState<number>(() => { const v = Number(localStorage.getItem("bpt.minRR")); return v >= 1 && v <= 20 ? v : 3; });
  const setMinRR = (v: number) => { const x = Math.min(20, Math.max(1, v || 3)); localStorage.setItem("bpt.minRR", String(x)); setMinRRState(x); };
  const setEmaCfg = (c: EmaCfg) => { const s = sanitizeEma(c); localStorage.setItem(EK, JSON.stringify(s)); setEmaCfgState(s); };
  const [sym, setSym] = useState<string>("BTC-USD");
  const [tf, setTf] = useState<"15m" | "1h" | "4h">("15m");
  const [data, setData] = useState<Record<string, MarketData>>({});
  const [err, setErr] = useState<string | null>(null);
  const [showHeat, setShowHeat] = useState(true);
  const [updated, setUpdated] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const info = new Map((await client.exchangeInfo()).map((m) => [m.symbol, m]));
        for (const s of SETUP_SYMBOLS) { const d = await loadMarket(s, info); if (!alive) return; setData((x) => ({ ...x, [s]: d })); }
        setUpdated(Date.now()); setErr(null);
      } catch (e) { setErr(String((e as Error).message)); }
    };
    run(); const id = setInterval(run, 60_000); return () => { alive = false; clearInterval(id); };
  }, []);

  const setups = useMemo(() => Object.fromEntries(Object.entries(data).map(([s, m]) => [s, evaluateSetup(s, m.htf, m.ltf, m.trading, emaCfg, mode, { h1: m.heat, minRR })])) as Record<string, SetupResult>, [data, emaCfg, mode, minRR]);
  const d = data[sym];
  const [bands, setBands] = useState<Band[]>([]);
  const ctx = useMemo(() => d ? { emaCfg, now: d.ltf[d.ltf.length - 1]?.t ?? Date.now(), ...fundingCtx(sym, d.funding, d.oiUsd), liq: estimateLiqMap(d.heat, { maxLev: d.maxLev, oiUsd: d.oiUsd }).bins } : { now: Date.now(), emaCfg }, [d, sym, emaCfg]);
  return (
    <>
      <section className="card">
        <h2>Trade Setup <span className="muted small">Strategy picker · {HTF} bias / {LTF} entry · BTC, ETH, SOL · rule-based, not financial advice, never places orders{updated ? ` · updated ${new Date(updated).toLocaleTimeString()}` : ""}</span></h2>
        {err && <div className="err">{err}</div>}
        <div className="symtabs" role="tablist">{SETUP_SYMBOLS.map((s) => <button key={s} role="tab" aria-selected={s === sym} className={"tab " + (s === sym ? "on" : "")} onClick={() => setSym(s)}>{s.replace("-USD", "")}</button>)}</div>
        <StrategyPicker sym={sym} ltf={d?.ltf} htf={d?.htf} ctx={ctx} onBands={setBands} minRR={minRR} />
      </section>
      <section className="card">
        <details className="classic"><summary><h2 style={{ display: "inline" }}>Classic SMC swing-zone engine</h2> <span className="muted small">the original SMC + {emaLabel(emaCfg)} + RSI checklist with swing-zone candidates</span></summary>
        <EmaSettings cfg={emaCfg} onChange={setEmaCfg} />
        <div className="row" style={{ alignItems: "center", gap: 10, margin: "-4px 0 12px" }}>
          <label><b className="small">Minimum reward : risk</b> 1 : <input type="number" min={1} max={20} step={0.5} value={minRR} onChange={(e) => setMinRR(+e.target.value)} style={{ width: 56 }} /></label>
          <span className="muted small">Judged on TP2. Entries come from 1h/4h swing zones (OB/FVG/liquidity at swings); stop beyond the zone + ATR buffer; targets at opposite 1h/4h swings.</span>
        </div>

        <div className="setups">
          {SETUP_SYMBOLS.map((s) => { const r = setups[s]; return (
            <button key={s} className={"setupcard " + (s === sym ? "on " : "") + (r ? r.verdict.replace(" ", "").toLowerCase() : "")} onClick={() => setSym(s)}>
              <div className="prow"><b className="sym">{s}</b><span className="verdict">{r ? r.verdict : "…"}{r?.counterTrend && <span className="ct">COUNTER-TREND</span>}</span></div>
              {r && <div className="small muted">4h {r.bias === "bull" ? "uptrend" : r.bias === "bear" ? "downtrend" : "neutral"} · {r.verdict === "NO TRADE" ? `closest: ${r.best.dir} ${r.best.confidence}%` : `confidence ${r.score}%`} · {px(r.price)}</div>}
            </button>); })}
        </div>
        {setups[sym] && <SetupDetail r={setups[sym]} />}
        </details>
      </section>
      <section className="card">
        <h2>{sym} chart
          <span className="seg">{(["15m", "1h", "4h"] as const).map((x) => <button key={x} className={"tab " + (tf === x ? "on" : "")} onClick={() => setTf(x)}>{x}</button>)}</span>
          <label className="small" style={{ marginLeft: 12 }}><input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} /> Liquidation heatmap (ESTIMATE)</label>
        </h2>
        {d ? <Chart key={sym + tf} sym={sym} tf={tf} d={d} setup={setups[sym]} ema={emaCfg} showHeat={showHeat} bands={bands} /> : <div className="muted">Loading candles…</div>}
      </section>
    </>
  );
}

function SideChecks({ s }: { s: SideResult }) {
  return <ul className="checks">{s.checks.map((c) => <li key={c.name} className={c.pass ? "pos" : "neg"}>{c.pass ? "✓" : "✗"} <b>{c.name}</b> <span className="muted">— {c.detail}</span></li>)}</ul>;
}
const sideTitle = (s: SideResult) => `${s.dir.toUpperCase()} · ${s.alignment.replace("-", " ").toUpperCase()} · checklist ${s.confidence}% · ${histLabel(s.dir, s.alignment)}${s.valid ? " · VALID" : ` · ${s.reasons.length} failed`}`;
function PlanBox({ side }: { side: SideResult }) {
  const p = side.plan!; const L = side.dir.toUpperCase();
  return (
    <div className="plan">
      <div><b>Best possible {L} entry:</b> wait for price at <b>{px(p.level)}</b> (★ best zone) <span className="muted">({p.levelSource})</span>{side.alignment === "counter-trend" && <span className="ct">COUNTER-TREND</span>}</div>
      <div className="stats" style={{ margin: "8px 0" }}>
        <div className="stat"><div className="k">Entry zone</div><div className="v">{px(p.entry.low)} – {px(p.entry.high)}</div></div>
        <div className="stat"><div className="k">Stop loss</div><div className="v">{px(p.stop)}</div></div>
        <div className="stat"><div className="k">TP1</div><div className="v">{px(p.tp1)}</div></div>
        <div className="stat"><div className="k">TP2</div><div className="v">{px(p.tp2)}</div></div>
        <div className="stat"><div className="k">Reward : risk</div><div className="v">{p.rr.toFixed(2)}R</div></div>
        <div className="stat"><div className="k">Hist. hit rate</div><div className="v" title={histLabel(side.dir, side.alignment)}>{Math.round((histHit(side.dir, side.alignment)?.win ?? 0) * 100)}%</div></div>
      </div>
      {p.candidates.length > 0 && <table className="cands"><thead><tr><th></th><th>Zone (nearest → farthest)</th><th>Why</th><th>Away</th><th>Entry</th><th>Stop</th><th>TP1</th><th>TP2</th><th>R:R</th></tr></thead>
        <tbody>{p.candidates.map((c, i) => <tr key={i} className={c.best ? "bestc" : ""}><td>{c.best ? "★ best" : ""}</td><td>{px(c.zone.bottom)} – {px(c.zone.top)}</td><td className="small">{c.zone.label} · score {c.zone.score}</td><td>{(c.zone.distPct * 100).toFixed(2)}%</td>
          <td>{px(c.entryPx)}</td><td>{px(c.stop)}</td><td title={c.tp1Label}>{px(c.tp1)}</td><td title={c.tp2Label}>{px(c.tp2)}</td><td className={c.meetsRR ? "pos" : "neg"}>{c.rr.toFixed(2)}R</td></tr>)}</tbody></table>}
      <div className="small">Becomes valid when: {p.waitFor.length ? p.waitFor.join(" · ") : "conditions hold at that level"}.</div>
      <div className="small muted">{p.targetNote}. Shown dashed on the chart. Not a signal yet.</div>
    </div>
  );
}
function SetupDetail({ r }: { r: SetupResult }) {
  const b = r.best; const ct = b.alignment === "counter-trend";
  const lv = (k: string, v?: number) => v != null && <div className="stat"><div className="k">{k}</div><div className="v">{px(v)}</div></div>;
  return (
    <div className="setupdetail">
      <div className={"banner " + r.verdict.replace(" ", "").toLowerCase()}>
        <b>{r.symbol}: {r.verdict}</b>{r.counterTrend && <span className="ct">COUNTER-TREND</span>}
        {r.verdict === "NO TRADE"
          ? <span> — {r.mode === "auto" ? "neither side is clean" : `no clean ${r.mode}`}, stay flat. Closest: {b.dir} ({b.reasons.length} check{b.reasons.length > 1 ? "s" : ""} failed).</span>
          : <span> — all checks passed · checklist {b.confidence}% · {histLabel(b.dir, b.alignment)}{ct ? " (counter-trend penalty applied, tighter target: this is a bounce/relief trade against the 4h trend)" : ""}. Plan only; you decide.</span>}
      </div>
      {b.valid && <div className="stats">
        {b.entry && <div className="stat"><div className="k">Entry zone</div><div className="v">{px(b.entry.low)} – {px(b.entry.high)}</div></div>}
        {lv("Stop loss", b.stop)}{lv(ct ? "TP1 (nearest 4h EMA / liquidity)" : "TP1 (1.5R)", b.tp1)}{lv(ct ? "TP2 (next level)" : "TP2 (liquidity)", b.tp2)}
        {b.rr != null && <div className="stat"><div className="k">Reward : risk</div><div className="v">{b.rr.toFixed(2)}R</div></div>}
      </div>}
      {!b.valid && b.plan && <PlanBox side={b} />}
      <div className="sidehead">{sideTitle(b)}</div>
      <SideChecks s={b} />
      {r.other && <details className="otherside"><summary>Other side: {sideTitle(r.other)}</summary><SideChecks s={r.other} /></details>}
    </div>
  );
}

const zoomMemo = new Map<string, any>(); // keeps the user's zoom when data refreshes
function Chart({ sym, tf, d, setup, ema: emaCfg, showHeat, bands }: { sym: string; tf: "15m" | "1h" | "4h"; d: MarketData; setup: SetupResult; ema: EmaCfg; showHeat: boolean; bands: Band[] }) {
  const box = useRef<HTMLDivElement>(null), rbox = useRef<HTMLDivElement>(null);
  const [heatEls, setHeatEls] = useState<{ y: number; h: number; long: number; short: number; price: number }[]>([]);
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const accounts = useStore((s) => s.accounts);
  const myLiqs = useMemo(() => Object.values(accounts).flatMap((a) => (a.data?.positions ?? []).filter((p) => p.symbol === sym && p.liquidationPrice).map((p) => ({ liq: p.liquidationPrice!, side: p.size > 0 ? "long" : "short" }))), [accounts, sym]);
  const heat = useMemo(() => estimateLiqMap(d.heat, { maxLev: d.maxLev, oiUsd: d.oiUsd }), [d]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = tf === "15m" ? d.ltf : tf === "4h" ? d.htf : d.heat;
      if (alive) setCandles(c);
    })();
    return () => { alive = false; };
  }, [tf, d]);

  const themeName = useThemeName();
  useEffect(() => {
    if (!box.current || !rbox.current || !candles?.length) return;
    const C = { bg: tokenColor("--surface"), ink2: tokenColor("--ink-2"), soft: tokenColor("--line-soft"), line: tokenColor("--line"), strong: tokenColor("--line-strong"), pos: tokenColor("--pos"), neg: tokenColor("--neg"), accent: tokenColor("--accent"), warn: tokenColor("--warn-ink"), liq: tokenColor("--liq") };
    const opts = { layout: { background: { color: C.bg }, textColor: C.ink2, fontFamily: "Geist Mono Variable, ui-monospace, monospace" }, grid: { vertLines: { color: C.soft }, horzLines: { color: C.soft } }, crosshair: { mode: CrosshairMode.Normal }, timeScale: { timeVisible: true, borderColor: C.line }, rightPriceScale: { borderColor: C.line } };
    const ch: IChartApi = createChart(box.current, { ...opts, height: 420, width: box.current.clientWidth });
    const rc: IChartApi = createChart(rbox.current, { ...opts, height: 110, width: rbox.current.clientWidth });
    const cs = ch.addCandlestickSeries({ upColor: C.pos, downColor: C.neg, borderVisible: false, wickUpColor: C.pos, wickDownColor: C.neg });
    cs.setData(candles.map((k) => ({ time: local(k.t), open: k.o, high: k.h, low: k.l, close: k.c })));
    const closes = candles.map((k) => k.c);
    const line = (n: number, color: string) => { const s = ch.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); const e = ema(closes, n); s.setData(candles.map((k, i) => ({ time: local(k.t), value: e[i] })).filter((x) => !isNaN(x.value))); };
    [emaCfg.fast, emaCfg.slow, ...(emaCfg.thirdOn ? [emaCfg.third] : [])].forEach((n, i) => line(n, i === 0 ? C.accent : i === 1 ? C.warn : C.ink2));
    const rs = rc.addLineSeries({ color: C.accent, lineWidth: 1, priceLineVisible: false });
    const rv = rsi(closes, 14); rs.setData(candles.map((k, i) => ({ time: local(k.t), value: rv[i] })).filter((x) => !isNaN(x.value)));
    [70, 30].forEach((v) => rs.createPriceLine({ price: v, color: C.strong, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" }));
    const s: SetupResult = bands.length ? ({ ...setup, verdict: "NO TRADE", best: { ...setup.best, plan: undefined }, zones: [] } as SetupResult) : setup; const pl = (price: number | undefined, color: string, title: string) => price != null && cs.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
    if (s.verdict !== "NO TRADE") { pl(s.entry?.low, C.ink2, "entry"); pl(s.entry?.high, C.ink2, "entry"); pl(s.stop, C.neg, "SL"); pl(s.tp1, C.pos, "TP1"); pl(s.tp2, C.pos, "TP2"); }
    else if (s.best.plan) {
      const p = s.best.plan; const d = s.best.dir;
      p.candidates.forEach((c, i) => { if (c.best) return; pl(c.zone.top, C.strong, `${d} zone ${i + 1}`); pl(c.zone.bottom, C.strong, ""); });
      pl(p.entry.high, C.warn, `★ ${d} zone`); pl(p.entry.low, C.warn, ""); pl(p.stop, C.neg, "★ SL"); pl(p.tp1, C.pos, "★ TP1"); if (Math.abs(p.tp2 - p.tp1) > 1e-9) pl(p.tp2, C.pos, "★ TP2");
    }
    else s.zones.forEach((z) => { pl(z.top, C.strong, z.kind); pl(z.bottom, C.strong, ""); });
    const al = (c: string, a: number) => { const m = c.match(/[\d.]+/g); return m && m.length >= 3 ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a.toFixed(2)})` : c; };
    for (const b of bands) { const col = b.kind === "sl" ? C.neg : b.kind === "tp" ? C.pos : C.accent; const a = 0.35 + 0.65 * b.strength; const style = b.dashed ? LineStyle.Dashed : b.strength >= 0.99 || b.kind === "entry" ? LineStyle.Solid : LineStyle.Dotted;
      cs.createPriceLine({ price: b.hi, color: al(col, a), lineWidth: b.kind === "entry" ? 2 : 1, lineStyle: style, axisLabelVisible: true, title: b.label });
      if (b.hi - b.lo > 1e-9) cs.createPriceLine({ price: b.lo, color: al(col, a), lineWidth: 2, lineStyle: style, axisLabelVisible: false, title: "" }); }
    myLiqs.forEach((m) => cs.createPriceLine({ price: m.liq, color: C.liq, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `YOUR ${m.side} LIQ` }));
    const saved = zoomMemo.get(sym + tf); if (saved) ch.timeScale().setVisibleLogicalRange(saved); else { ch.timeScale().fitContent(); } rc.timeScale().fitContent();
    ch.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (r) zoomMemo.set(sym + tf, r); });
    // keep time scales in sync
    ch.timeScale().subscribeVisibleLogicalRangeChange((r) => r && rc.timeScale().setVisibleLogicalRange(r));
    const drawHeat = () => {
      const max = Math.max(1e-9, ...heat.bins.map((b) => b.long + b.short));
      const next = heat.bins.map((b) => { const y1 = cs.priceToCoordinate(b.price + heat.step / 2), y2 = cs.priceToCoordinate(b.price - heat.step / 2); return y1 == null || y2 == null ? null : { y: y1, h: Math.max(1, y2 - y1), long: b.long / max, short: b.short / max, price: b.price, raw: b }; }).filter(Boolean) as any;
      setHeatEls((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    drawHeat(); ch.timeScale().subscribeVisibleLogicalRangeChange(drawHeat);
    const ro = new ResizeObserver(() => { ch.applyOptions({ width: box.current!.clientWidth }); rc.applyOptions({ width: rbox.current!.clientWidth }); drawHeat(); });
    ro.observe(box.current);
    const iv = setInterval(drawHeat, 1000); // price scale autoscale changes
    return () => { clearInterval(iv); ro.disconnect(); ch.remove(); rc.remove(); };
  }, [candles, heat, myLiqs, setup, emaCfg, themeName, bands]);

  const tot = heat.bins.reduce((a, b) => ({ l: a.l + b.long, s: a.s + b.short }), { l: 0, s: 0 });
  const topLong = [...heat.bins].sort((a, b) => b.long - a.long)[0], topShort = [...heat.bins].sort((a, b) => b.short - a.short)[0];
  return (
    <div>
      <div style={{ position: "relative" }}>
        <div ref={box} />
        {showHeat && <div className="heat" title="ESTIMATE – modelled, not actual positions">
          {heatEls.map((e, i) => <div key={i} className="hb" style={{ top: e.y, height: e.h }}>
            {e.long > 0.02 && <span className="hl" style={{ width: e.long * 100 + "%", opacity: 0.25 + e.long * 0.75 }} />}
            {e.short > 0.02 && <span className="hs" style={{ width: e.short * 100 + "%", opacity: 0.25 + e.short * 0.75 }} />}
          </div>)}
          <div className="heatlabel">ESTIMATE<br />not real positions</div>
        </div>}
      </div>
      <div className="muted small" style={{ margin: "4px 0" }}>RSI(14)</div>
      <div ref={rbox} />
      <div className="muted small legend">
        {[emaCfg.fast, emaCfg.slow, ...(emaCfg.thirdOn ? [emaCfg.third] : [])].map((n, i) => <span key={i} style={{ color: EMA_COLORS[i] }}>━ EMA{n} </span>)} <span style={{ color: "var(--liq-ink)" }}>━ your liquidation price</span>
        {showHeat && <> · <b>Heatmap = ESTIMATE.</b> <span className="hl-key" aria-hidden="true">■</span> est. long liquidations <span className="hs-key" aria-hidden="true">■</span> est. short liquidations. Model: last 14 days of 1h volume as new opens, split 50/50, leverage tiers {DEFAULT_TIERS.filter((t) => t.lev <= d.maxLev).map((t) => `${t.lev}x`).join("/")}, levels removed once traded through, scaled to current open interest ({usd(d.oiUsd, 0)}). Biggest est. clusters: longs ~{px(topLong?.price ?? 0)}, shorts ~{px(topShort?.price ?? 0)} ({usd(tot.l, 0)} long / {usd(tot.s, 0)} short in view range).</>}
      </div>
    </div>
  );
}
