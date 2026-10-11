# Points / AURA estimator v2 (ESTIMATE)

**Trading AURA (point):** ln AURA = 17.90 + 0.230 ln(vol/PV) + 0.366 ln((|fees|+0.01)/PV) + 0.368 ln((OIh+1)/POH) − 0.202 ln(1+hours_open). These are the mean of the per-week OLS weights for weeks 1–5 (aura-model/weekly_weights.json, now including each week's residual list).
- vol = closed-position volume (master + subs); fees = |net fees| of those positions; OIh = max(Σ|size|·mark over hourly funding rows, closed-position OI-hours); hours_open = distinct hours with a funding row.
- PV = platform volume = 2 × Σ 1h-klines quote volume. This reproduces the fit's numbers exactly; the fit counted both sides of each trade.
- POH = 1.93 × mean(Bulk /stats openInterest.totalUsd) × 168. The /stats total equals the bulkstats total, and 1.93 reproduces the fit's OI-hours within 1–5%. The app samples /stats every 15 min while it runs (own recorder). Weeks 1–5 use the fit's bundled totals.

**Maker AURA:** exp(−6.946)·makerVol^0.890, shown separately (typical error ×1.69 on 687 wallet-weeks).

**Boost:** a separate line only while a user-configured promo is active (default OFF). History is not adjusted.

**Week:** Sat 06:00 UTC (13:00 WIB) to next Sat.

**Monte Carlo (per mc.py):** 1500 sims. Remaining days are bootstrapped from the last 14 days plus the observed days, scaled by a lognormal ramp (mu 0.5, sd 1.5). The previous week's platform totals get lognormal noise (vol sd 0.242, OI sd 0.012), Then one stored week's full weight vector is resampled, plus a residual from that same week's fit (replacing the generic ×1.6 residual). Shows P10/P50/P90 and P(>X).

**Weekly auto-refit:** after a drop (a new mainnet_weekN_trading on the leaderboard), the app pulls week N features for up to ~300 wallets interleaved from the aura/volume/pnl tabs (the API caps each tab at 100). It fits week N by OLS and appends that week's weights and residuals; the point weights are the mean across weeks. A week's fit is rejected if its slopes are implausible.

## Accuracy
- Product's rw_validate.py reproduced: resample-week MC, walk-forward weeks 2–5. Typical error ×1.490, P10–P90 coverage 78.9% (wk2 69%, wk3 83%, wk4 83%, wk5 80%). Old pooled+residual approach: ×1.521, 78.4%.
- The app's own TS MC, weeks 3–5, 945 wallet-weeks. P10–P90 coverage: day 1 68%, day 3 74%, day 5 77%, day 7 82%. Typical P50 error ×3.62 / 2.30 / 1.84 / 1.53.
- Test wallet with mean weights: 15.8, 6.2, 5.4, 4.0, 30.9 vs actual 9, 19, 31, 9, 23.
- Walk-forward (train on weeks before k, test on week k, weeks 2–5, 1209 wallet-weeks): typical error ×1.52, 80.1% inside ×/÷2.6, bias +0.05. By week: ×1.59 / 1.46 / 1.49 / 1.51.
- MC forecast, weeks 3–5, 945 wallet-weeks (in-sample coefficients). P10–P90 coverage: day 1 71% (26% above P90), day 3 78%, day 5 84%, day 7 91%. Typical P50 error: ×3.67 / 2.27 / 1.86 / 1.53.
- Gross taker fees vs net fees (exact-split rows, 864): weeks 3–5 ×1.49/1.61/1.66 vs ×1.54/1.61/1.61, coverage 67.1% vs 68.6%. Not clearly better, so net fees are kept.
- Test wallet B63A…Q3w, actual vs estimate: wk1 9 vs 16, wk2 19 vs 7, wk3 31 vs 6, wk4 9 vs 4, wk5 23 vs 32. Typical error ×2.2; 3/5 weeks inside the range (wk2, wk3 under-predicted).

Note shown in app: "Estimate. Outlier weeks possible (unmodeled bonuses)."
