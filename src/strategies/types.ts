import type { Candle } from "../ta/indicators";
export type Family = "trend" | "momentum" | "structure" | "volatility" | "volume" | "positioning";
export const FAMILY_LABEL: Record<Family, string> = { trend: "Trend", momentum: "Momentum", structure: "Structure / liquidity", volatility: "Volatility breakout", volume: "Volume / fair value", positioning: "Positioning (perp)" };
export type StrategyId = "smc" | "ict" | "ema" | "macd" | "rsi" | "bb" | "supertrend" | "vwap" | "donchian" | "funding" | "dema";
export type Dir = "long" | "short" | "neutral";
export type Level = { price: number; kind: "entry" | "sl" | "tp" | "static"; label: string; side?: "long" | "short" };
export type Signal = {
  id: StrategyId; family: Family; direction: Dir; strength: number; // 0..1
  entry: { lo: number; hi: number } | null; sl: number | null; tp: number[];
  invalidation: string; freshnessBars: number; reasons: string[];
  levels: Level[]; // static levels this strategy contributes to zone confluence (VWAP, OB, FVG, fib, liq clusters…)
};
export type Ctx = { now: number; emaCfg?: { fast: number; slow: number; thirdOn: boolean; third: number }; funding?: { rate: number; pct: number | null }; oi?: { changePct: number | null }; liq?: { price: number; long: number; short: number }[] };
export type Strategy = { id: StrategyId; name: string; family: Family; short: string; evaluate: (c: Candle[], ctx: Ctx) => Signal };
