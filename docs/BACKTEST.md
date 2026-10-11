# Backtest & tuning (v1.1.0)

Run: `npx tsx backtest/run.ts baseline` (full period) · `grid2 <shard> <n>` then `report grid2` (hold-out tuning).
Data: Bulk klines BTC/ETH/SOL 15m/1h/4h, which start 2026-09-01. That is all the history the API has: about 39 days. The engine needs 70 4h bars to warm up, so decisions start around Sep 12.
Method: walk-forward, no look-ahead. At each 1h close the engine sees only closed candles, in the same windows the app uses. "Limit" strategy: rest a limit order at the best candidate zone that meets min R:R (refreshed hourly). SL and TP2 come from the plan. If stop and target are hit in the same bar, it counts as a stop. Max hold is 7 days. Fees: taker 3.5 bps (market/stop), maker 0.
"Confirm" strategy: market entry only when the full checklist passes (in zone + fresh 15m BOS + RSI).
Hold-out: train = Sep, test = Oct 1–10 (not used for selection).

## Results (new default, zoneDistHalf 0.02, min R:R 3), Sep 12 – Oct 10
- Limit: 34 trades, win 24%, avg −0.04R, total −1.2R, max DD 10.3R. SOL +6.4R, BTC −3.8R, ETH −3.7R.
- Old default (0.04): 30 trades, win 20%, avg −0.23R, total −6.9R.
- Confirm: 5 trades, 0 wins, −5.3R. It fires late inside zones, and stops sit too close to the entry.
- Big swings (≥3% on 1h closes, after warm-up): 23, captured 5 (22%).

## Tuning (954 configs over two grids)
- Distance weighting near zones (0.02) was best on train and on mean test R (−0.30 vs −1.72 for 0.04).
- Stop 0.25×ATR beat wider stops. Counter-trend on/off, min R:R 2.5–3.5, min zone score and pending time made no consistent difference.
- 64 of 144 train-positive configs; 34 of those were also positive in test. The top-by-train config (+7.3R) lost −3.2R in test (overfit), so it was NOT adopted.
- Default config with 0.02: train +4.3R (25 trades), test +3.4R (8 trades). With 0.04: train −3.5R, test +4.5R (7 trades).

## Honest read
39 days and about 35 trades is far too little to call this edge. It's roughly breakeven after fees. Treat setups as a map of levels, not signals.

# v1.2.0: Hyperliquid history (research only; app data stays Bulk-only)
HL serves only the latest ~5000 candles per interval (paging back returns []). So 1h data starts 2026-03-15, 15m starts 2026-08-19, and 4h starts 2024-06.
The engine needs 1h for its zones, so the test span is Apr 5 – Oct 10 2026 (~6 months, 6 monthly folds: up / down / chop / up). LTF = 1h bars. Same fees, and if stop and target hit in the same bar it counts as a stop.
Files: backtest/hl.ts, hl-wf.ts, calib.ts → results-hl-base.txt, results-hl-wf.txt, results-hl-calib.txt.

| | trades | win | avg R | total | max DD | ≥5% swings caught |
|---|---|---|---|---|---|---|
| v1.0.3 default (dist 0.04) | 264 | 25% | +0.08 | +21.7R | 24.4R | 37/95 (39%) |
| v1.1.0 (dist 0.02) | 279 | 24% | +0.04 | +9.9R | 32.1R | 35/95 (37%) |
Per fold (0.04): −9.9, +5.6, −12.5, +3.6, +5.8, +29.0 R. Positive in 4 of 6 months.
Walk-forward re-tuning (best config on prior folds → next fold), 108 configs: −31.9R OOS vs +25.9R for the fixed default. Tuning overfits, so it is not adopted. v1.2.0 reverts dist to 0.04.
Confidence calibration: the checklist % has no predictive power (65–80% bucket: 21 trades, 14% win; confirm-mode ≥80%: 14 trades, 0 wins).
The UI now shows the historical hit rate by side × trend alignment instead.
80% win: only reachable with tiny targets (exit at 0.3–0.5R). Best robust subset: longs not counter-trend, exit 0.3R. FIT 35t 80% +0.03R/trade, TEST 50t 88% +0.14R/trade.
That is long-only, and the test half was an uptrend. The edge is a few bps per trade and is wiped out by one bad fill. Not shipped as a filter.
