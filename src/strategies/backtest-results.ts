// From scripts/consensus-backtest.ts on Hyperliquid history (BTC+ETH+SOL, fees 0.035%/side, limit fill at the consensus entry,
// SL vs TP1 first touch, 96-bar timeout, Funding/OI excluded: no history). No parameters fitted.
export type BtRow = { n: number; win: number; avgR: number };
export const CONSENSUS_BACKTEST = {
  period: "23 Aug – 9 Oct 2026", tf: "15m entry / 4h bias",
  byLabel: { High: { n: 18, win: 0.278, avgR: -0.112 }, Medium: { n: 98, win: 0.276, avgR: -0.195 }, Mixed: { n: 198, win: 0.379, avgR: -0.029 } } as Record<"High" | "Medium" | "Mixed", BtRow>,
  longer: { period: "1 Apr – 8 Oct 2026", tf: "1h entry / 4h bias", byLabel: { High: { n: 45, win: 0.267, avgR: -0.168 }, Medium: { n: 132, win: 0.341, avgR: 0.04 }, Mixed: { n: 149, win: 0.383, avgR: -0.037 } } as Record<"High" | "Medium" | "Mixed", BtRow> },
  monotonic: false, // higher agreement did NOT give better results → said in the UI
};
