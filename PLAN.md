# Bulk Perps Tracker: Build Plan (v0, planning only)

A read-only desktop tracker for Bulk perpetuals (bulk.trade). The user pastes wallet addresses and the app does the rest. It needs no keys, no signing, and no trading.
Verified against the docs (docs.bulk.trade/llms.txt) and live mainnet calls on 2026-10-10 (UTC+7).
Reference post: x.com/Korgonxx/status/2108763751126302938 ("Introducing Perps Tracker"). The post itself is only a media link, so the UI is not copied from it.

## 1. Stack
- **Tauri 2 + React + TypeScript + Vite.** Installers are roughly 10 MB instead of the roughly 150 MB Electron produces. Tauri also includes tray, notification, always-on-top window, autostart and updater plugins out of the box. The main risk is the Rust toolchain at build time. Installers are built in CI (GitHub Actions matrix: windows/macos), so rizzy never touches it.
- Fallback: Electron + the same React app if Tauri tray or notification quirks block us. The UI code is identical.
- State: Zustand. Server cache: TanStack Query for REST. Persistence: tauri-plugin-store (wallet list, settings, alert thresholds) and SQLite (tauri-plugin-sql) for history caches.
- Charts: **TradingView lightweight-charts** (candles, EMA/RSI panes, overlay of the liquidation estimate as price-bands). Small charts (funding bars, equity) use Recharts.
- Sound: bundled short WAVs played via HTML Audio. Native OS notifications through tauri-plugin-notification.

## 2. Verified API surface (no auth)
REST base `https://mainnet-api1.bulk.trade/api/v1`. Limits: 5 req/s per IP sustained, burst 150. 429 responses may not be JSON, so honor Retry-After.
| Use | Call | Verified shape |
|---|---|---|
| Markets | `GET /exchangeInfo` | array `{symbol, status: TRADING/SUSPENDED, maxLeverage, tickSize, pricePrecision…}`. Most alts were SUSPENDED today and BTC-USD was TRADING |
| Ticker | `GET /ticker/{symbol}` | `{lastPrice, markPrice, oraclePrice, openInterest(base), fundingRate, priceChangePercent, regime…, timestamp(ns)}` |
| Stats | `GET /stats?symbol=` | `{openInterest.totalUsd, funding.rates[sym].current/annualized, markets[]}` |
| Candles | `GET /klines?symbol&interval[&startTime]` | array `{t,T,o,h,l,c,v,n}` (ms). Intervals run 10s to 1M. `limit` seemed ignored (it returned many), so we slice on the client |
| Book | `GET /l2book?type=l2book&coin=BTC-USD&nlevels=N` | `{levels:[[bids],[asks]] of {px,sz,n}}`. Note that `type` is required |
| Account now | `POST /account {"type":"fullAccount","user":PUBKEY}` | `[{fullAccount:{kind, subAccounts[], margin{totalMargin, availableMargin, marginUsed, notional, realizedPnl, unrealizedPnl, fees, funding}, positions[], openOrders[], leverageSettings[]}}]`. An unknown wallet returns 404 `ACCOUNT_NOT_FOUND` |
| Position fields | (inside fullAccount) | `symbol, size(±), price(entry), fairPrice, notional, realizedPnl, unrealizedPnl, leverage, liquidationPrice, fees, funding, maintenanceMargin, averageEntryTime(ns), lambda, iso, protection.orders[] (TP/SL)` |
| History | `POST /account` with type `fills / positions / fundingHistory / orderHistory / activityHistory / riskHistory` | `{data[], page{nextCursor, hasMore, coverage, minAvailableSlot}}`, newest first, limit ≤5000. Funding rows: `{symbol, size, payment(+recv/−paid), fundingRate, markPrice, slot, timestamp}`. Fills carry `reason` normal/liquidation/adl/liquidation_sweep |
WS `wss://mainnet-ws1.bulk.trade` (max 15 connections per IP). Tested live: subscribe `{"method":"subscribe","subscription":[{type:"ticker",symbol}, {type:"trades",symbol}, {type:"risk",symbol}]}` returns `subscriptionResponse`. Tickers arrive at roughly 5/s. `risk` sends the lambda/MMR surface. Docs also list `candle`, `l2Snapshot`, `l2Delta`, `impact`, `frontendContext`, and **`account` (per user, unsigned)**, which emits `accountSnapshot`, `positionUpdate`, `marginUpdate`, `fill`, **`liquidation`**, **`adl`**, and other events. I could not live-test `account` or the history calls because I had no real active wallet (the docs example address returns 404).

## 3. Architecture
- **Data layer** (`src/data/`): one `BulkClient` with typed REST methods (zod-validated) behind a token-bucket limiter (4 req/s, burst 20, global queue with priorities: user action > alerts > background backfill). It uses exponential backoff with jitter on 429/5xx.
- **WS first for live data:** a single shared WS connection multiplexes `account.<wallet>` for every tracked wallet plus `ticker` for symbols that are held or watched, and `candle` for the open chart. It sends a heartbeat, reconnects with backoff, and **resyncs through REST fullAccount after every reconnect**, as the docs recommend.
- **REST for snapshots and history:** fullAccount on startup, then every 60 s as a safety net. History (funding, fills, positions, riskHistory) is backfilled incrementally, cached in SQLite by `tradeId`/slot, and refreshed with startSlot > last seen slot.
- Logic lives in pure TS modules (`metrics/`, `alerts/`, `setup-engine/`, `liqmap/`) and is unit-tested with recorded fixtures.

## 4. Feature → field mapping
1. **Wallet list:** add, label, and remove base58 pubkeys. Validation calls fullAccount (a 404 means "no Bulk account yet"). Sub-accounts are pulled automatically from `subAccounts[]` and shown as nested rows.
2. **Overview:** per wallet and in total, show equity = `margin.totalMargin` (TBC: whether it includes uPnL), uPnL, realized PnL, fees, funding, notional, margin used % = marginUsed/totalMargin, and account leverage = notional/totalMargin.
3. **Positions:** side from the sign of `size`. Entry = `price`, mark = `fairPrice` (live ticker `markPrice`), size, notional, leverage, uPnL, uPnL% of margin, TP/SL from `protection.orders`.
   - **Liq distance %** = |mark − liquidationPrice| / mark. Color bands: >20% green, 10–20% amber, <10% red (user adjustable).
   - **Funding since open** = position `funding` field (TBC that it resets per position). Cross-check by summing `fundingHistory.payment` for the symbol since `averageEntryTime`.
4. **Daily funding:** `fundingHistory` grouped by local day (Asia/Jakarta) and symbol. Shown as a bar chart plus a table. Bulk funding is hourly.
5. **Tray alerts + sound:** the tray icon shows worst liq distance. Alerts are native notifications plus sound for: near-liq (crossing thresholds 10%/5%, with hysteresis and cooldown), **liquidation** (WS `liquidation` event, or a fill with reason=liquidation), **ADL** (WS `adl` event, or reason adl). `riskHistory` is polled every 2 min as a backup in case WS was down. The app keeps running in the tray when its window is closed and has an optional launch-at-login setting.
6. **Pulse widget:** a small frameless always-on-top window that can be dragged and pinned. It shows total equity, uPnL (colored), the riskiest position with its liq distance bar, and BTC price. Opacity is adjustable. It is a separate Tauri window that subscribes to the same store through events.
7. **Trade Setup engine (SMC + EMA + RSI):** **Scope: BTC-USD, ETH-USD, SOL-USD only (rizzy, 2026-10-10).** deterministic and explained. **It is not financial advice and places no orders.**
   - Inputs: klines HTF 4h (bias) and LTF 15m (trigger), default 300 bars.
   - Trend: EMA20/50/200. Long bias if close > EMA200 and EMA20 > EMA50 on 4h; short is the mirror case.
   - SMC: swing pivots (fractal n=3). BOS/CHoCH = close beyond the last swing high or low. Order block = the last opposite candle before the BOS impulse. FVG = 3-candle gap. Liquidity = equal highs/lows within 0.1%.
   - RSI14: a long needs LTF RSI between 40 and 65 and rising (not overbought), a short is the mirror case. Extremes (>75/<25) veto the setup.
   - **Setup** = HTF bias agrees + LTF BOS in the same direction + price retests the OB/FVG zone + RSI filter. Output: direction, entry zone, SL beyond OB/swing (+0.1×ATR), TP1 at 1.5R / TP2 at the next liquidity pool, R:R, a confidence score from the checklist, and a list of the reasons that passed or failed.
   - **NO TRADE** when any of these hold: biases conflict, no fresh BOS, price is not in a zone, RSI vetoes, R:R < 1.5, market not TRADING, or the candle history is too thin or volume is 0 (seen live on some 1h candles). The app also shows *why* there is no trade.
8. **Estimated liquidation heatmap:** **labeled "ESTIMATE – modelled, not actual positions"** everywhere. Bulk does not publish other users' positions.
   - Model: we take the recent `trades` stream plus klines volume as proxies for position opens. Opened notional is assumed spread across leverage tiers (5/10/20/25/40x, weights configurable, capped by market `maxLeverage`). Liq price per tier is entry × (1 ∓ 1/lev + mmr), with mmr taken from the WS `risk` surface. Open interest from the ticker scales the total. A level decays once price has traded through it or after N days.
   - Rendered as horizontal intensity bands beside the candle chart. Rizzy's own positions' real liq prices are overlaid as solid lines.

## 5. Milestones (build order)
1. **M0 Skeleton (½ day):** Tauri+React scaffold, CI building Win/Mac installers, rate-limited BulkClient + zod types from these fixtures.
2. **M1 Wallets + Overview + Positions (1–2 days):** REST snapshot, then the WS account stream and live ticker. Liq distance, funding since open.
3. **M2 Funding history + daily funding (1 day):** paginated backfill with SQLite cache.
4. **M3 Alerts (1 day):** tray, notifications, sounds, thresholds UI, run in background, launch at login.
5. **M4 Pulse widget (½ day).**
6. **M5 Chart + Trade Setup engine (2 days):** lightweight-charts, indicators, rules engine with tests, explain panel.
7. **M6 Liquidation heatmap estimate (1–2 days).**
8. **M7 Polish and ship:** icons, onboarding ("paste your wallet address"), signed installers, auto-update.
Rough total: 8–11 working days.

## 5b. Resolved with live wallet B63A9…Q3w (2026-10-10)
- **Balance excludes uPnL:** `margin.totalMargin` stayed at 55.248964 across 3 polls while `unrealizedPnl` moved from 7.104 to 7.100. **Equity = totalMargin + unrealizedPnl.** availableMargin = totalMargin − marginUsed (checked).
- **Position `funding` is since-open:** BTC position funding −0.467378874 equals the sum of `fundingHistory.payment` for BTC since the first opening fill (−0.4673789, 25 hourly payments). Funding in the page before that was excluded.
- fullAccount positions **do not include `averageEntryTime`** on this wallet, so the open time comes from fills or history. Positions also carry `impact`, `reserve`, `worstCaseMaintenanceMargin`, and range TP/SL (`trigger.px`/`pxHi`).
- History rows: fills use `amount` (not `size`), `makerFee`/`takerFee`, `reasonCode`, and `slot`/`sequence`. Closed `positions` rows have `quantity, avgOpenPrice, avgClosePrice, realizedPnl, fees, funding, openTime, closeTime, closeReason`. `riskHistory` rows have `eventType` (liquidation/adl), `marginPrior/After`, and a reason string, and can include iso-account rows (`isoPubkey`). `coverage` came back "unknown".
- WS `account` sub returns an `accountSnapshot` with the same shape as fullAccount. No incremental events arrived in a 15 s quiet window.
- Wallet has 2 sub-accounts, so the app tracks them automatically.

## 6. Open questions / risks
- DECIDED: Windows x64, unsigned installer OK, default thresholds/timeframes/tiers.
- Code signing: unsigned apps trigger SmartScreen ("More info → Run anyway") or a Mac Gatekeeper warning (right-click → Open). An Apple Developer account ($99/yr) or a Windows cert removes this. Is it worth it?
- API gaps: there is no public all-positions data, so the heatmap can only be an estimate. Whether `margin.totalMargin` includes uPnL, and whether position `funding` is since open or cumulative per symbol, are unconfirmed. `klines` ignores `limit`. History `coverage`/`minAvailableSlot` means old history may be truncated. The API is young (4 Oct 2026 upgrade) and shapes may change, so zod validation plus graceful degradation is needed. Many markets are SUSPENDED right now, and some volumes are thin or 0, which weakens TA signals.
- Alerts only fire while the app is running (tray). No push when the PC is off.
- Default alert thresholds, trade-setup timeframes, and the heatmap leverage weights need rizzy's taste.
- Rate limits are per IP, so if rizzy has other Bulk tools running on the same network, they share the budget.

## 7. Packaging for rizzy (non-technical)
GitHub Actions builds `.msi`/`.exe` (Windows) and universal `.dmg` (macOS). Rizzy gets one download link, double-clicks to install, and the app opens to "Paste a Bulk wallet address". Builtin updater pulls new versions. No terminal, no keys, nothing to configure. A one-page illustrated "first run" guide covers the OS unsigned-app warning.

## 8. Build status (2026-10-10)
- M0 done: Tauri 2 + React/TS scaffold, rate-limited zod-validated `BulkClient` (4 req/s, burst 20, 429/5xx backoff), shared WS with resubscribe and REST resync, unit tests on live fixtures (5 passing) and an opt-in live test (`LIVE=1 npx vitest run tests/live.test.ts`).
- M1 done (MVP level): wallet add/label/remove (persisted, auto-discovers named sub-accounts), Overview totals, Positions table (live mark via WS ticker, liq distance with 10%/5% bands, funding since open, TP/SL). WS incremental account events currently trigger a debounced REST resync. Verified in Chrome against the live wallet.
- Windows x64 installer cross-built on Linux (cargo-xwin + NSIS): `release/Bulk Perps Tracker_0.1.0_x64-setup.exe` (unsigned, per-user install, ~1.6 MB). Not yet run on a real Windows machine. CI alternative: `.github/workflows/build-windows.yml` (not pushed).
- Defaults chosen: near-liq warn 10% / danger 5%. Trade Setup 4h bias / 15m trigger, BTC/ETH/SOL only. Heatmap tiers 5/10/20/25/40x.
- M3 done: daily funding (all wallets + sub-accounts, Asia/Jakarta days, 7/30/90/365-day views, bar chart + per-symbol table). Incremental sync by slot, cached locally, refreshed every 10 min.
- M4 done: tray icon (colour = worst risk, tooltip = closest position's liq distance, menu Open / Pulse / Quit). Closing the window hides it to the tray. Near-liq alerts (warn 10% / danger 5%, 2pp hysteresis, 10-min repeat cooldown, danger always fires) and liquidation/ADL alerts from the WS account events (incl. fills with reasonCode 1/2/3), deduped, with riskHistory polled every 2 min as backup. OS notification + bundled sounds, adjustable in the Alerts tab.
- M5 done: Pulse widget (frameless, transparent, always-on-top, draggable, hidden from taskbar) showing equity, uPnL, BTC price, and the riskiest position with a liq-distance bar. Toggled from the tray or the main window.
- Installer: release/Bulk Perps Tracker_0.1.0-m5_x64-setup.exe (1.83 MB, unsigned). Cross-built; tray, notifications and always-on-top are not yet tested on real Windows.
- M6 done: Trade Setup tab for BTC/ETH/SOL only. Rules engine in `src/ta/` (EMA/RSI/ATR, fractal pivots, BOS/CHoCH, order blocks, FVGs, liquidity pools). Every rule shows pass or fail with its reason, and NO TRADE lists the failures. The stop is at least 0.5×ATR, and R:R is judged on the structural target (TP1 = 1.5R partial). Chart uses lightweight-charts: candles, EMA 20/50/200, RSI pane, setup or zone lines, and your own liq price. It refreshes every 60 s.
- M7 done: estimated liquidation heatmap (`src/ta/liqmap.ts`), labelled ESTIMATE on the chart and in the legend. It is modelled from 14 days of 1h volume, split 50/50, with tiers 5/10/20/25/40x capped by market max leverage, mmr 2%. Levels are removed once traded through, decay with a 72-bar half-life, and the total is scaled to current OI.
- M8 done: launch at login (tauri-plugin-autostart, starts minimised to the tray, toggle in the Alerts tab), first-run welcome, version shown in the footer, README, repo cleanup. Final version 1.0.0.
- v1.0.1: the Trade Setup trend EMAs are configurable (fast/slow, plus an optional third that is off by default) and saved locally. Default is 21/50. Trend = fast vs slow with price on the same side of both (and of the third if on). The chart EMA lines follow the settings. Lengths are capped at 200 because Bulk serves about 235 4h candles.
- v1.0.2: two-sided engine. The 4h trend sets alignment, not a block. With-trend setups keep full confidence. Counter-trend setups get −25% confidence and TP1 at the nearest 4h EMA/liquidity, with R:R judged on TP1. Neutral trend gets −10%. RSI is direction-aware. Auto shows the best side, with the other side's checklist collapsed. Find Long / Find Short search one side; when nothing is clean they return a "wait for price at X" plan (nearest OB/FVG, then liquidity pool, then 4h EMA) with entry/SL/TP/R:R and the missing conditions, drawn dashed on the chart.
- v1.0.3: entries now come from 1h/4h swing zones (`src/ta/zones.ts`). Supply/demand is built from swing wicks, OBs, FVGs and equal-high/low pools on 1h + 4h, clustered and kept only while unmitigated. Each zone must contain a swing, OB or pool. Zones are scored by timeframe × type × touches and discounted by distance (4% away = half). SL sits beyond the zone + 0.25×ATR of the zone TF. TP1 = nearest opposite 1h/4h swing/liquidity ≥1R; TP2 = first opposite level ≥ min R:R. Min R:R is configurable (default 3) and judged on TP2. Counter-trend targets are capped at the 4h slow EMA. The UI shows 2–3 ranked candidates (nearest→farthest, ★ best) with R:R each, all drawn on the chart. 1h history extended to 21 days.
