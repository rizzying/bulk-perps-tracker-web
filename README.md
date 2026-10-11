# Bulk Perps Tracker (v1.0.3)

A read-only desktop tracker for Bulk perpetuals. It needs no keys and no sign-in, only wallet addresses.

## For rizzy: install
1. Double-click `Bulk Perps Tracker_1.0.3_x64-setup.exe`.
2. Windows SmartScreen may say "Windows protected your PC". The app is unsigned, so click **More info → Run anyway**.
3. Paste your Bulk wallet address and you're done.

## What's in it
- **Dashboard:** equity, PnL, funding and fees across all wallets and sub-accounts. Positions show liquidation distance (green/amber/red), funding since open, and TP/SL.
- **Trade Setup (BTC, ETH, SOL):** a rule-based SMC + EMA + RSI check (4h bias, 15m trigger). The trend EMAs are configurable: default double EMA 21/50, with an optional third EMA that is off by default. It evaluates both long and short. Counter-trend setups are allowed but labelled COUNTER-TREND, with lower confidence and closer targets. **Find Long / Find Short** buttons search one side for the best entry and say "wait for price at X" when nothing is clean yet. Entries come from 1h/4h swing zones (2–3 ranked candidates). Minimum reward-to-risk defaults to 1:3 and can be changed. It shows LONG, SHORT or **NO TRADE**, with every rule's pass or fail and the reason. It is not financial advice and never places orders.
- **Chart:** candles with EMA 20/50/200, RSI, setup levels, your own liquidation price, and an **estimated** liquidation heatmap. The heatmap is a model, not real positions.
- **Funding:** daily funding by Jakarta day.
- **Alerts:** tray notifications with sound when a position nears liquidation (10% / 5%) and on liquidation or ADL. Closing the window keeps the app in the tray; quit from the tray icon. "Start with Windows" is a setting in the Alerts tab.
- **Pulse widget:** a small always-on-top box. Toggle it from the tray or the top-right button.

## Developer
`npm i`, `npm test`, `npm run dev` (browser) / `npx tauri dev`.
Windows installer from Linux: `npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis`, or the GitHub Actions workflow `.github/workflows/build-windows.yml`.
Live API test: `LIVE=1 npx vitest run tests/live.test.ts`. The plan and API findings are in `PLAN.md`.
