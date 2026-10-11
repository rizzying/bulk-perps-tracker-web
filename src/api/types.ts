import { z } from "zod";
// Shapes verified live against mainnet on 2026-10-10. passthrough() tolerates new fields.
export const Margin = z.object({
  totalMargin: z.number(), availableMargin: z.number(), marginUsed: z.number(),
  notional: z.number(), realizedPnl: z.number(), unrealizedPnl: z.number(),
  fees: z.number(), funding: z.number(),
  transferableBalance: z.number().optional(),
}).passthrough();
export const Trigger = z.object({ px: z.number().nullish(), pxHi: z.number().nullish(), lim: z.number().nullish() }).passthrough();
export const Position = z.object({
  symbol: z.string(), size: z.number(), price: z.number(), fairPrice: z.number(),
  notional: z.number(), realizedPnl: z.number(), unrealizedPnl: z.number(),
  leverage: z.number(), liquidationPrice: z.number().nullish(), fees: z.number(),
  funding: z.number(), maintenanceMargin: z.number(),
  averageEntryTime: z.number().nullish(), iso: z.boolean().optional(), isoPubkey: z.string().optional(),
  protection: z.object({ orders: z.array(z.object({ orderId: z.string(), orderType: z.string(), trigger: Trigger.nullish() }).passthrough()) }).nullish(),
}).passthrough();
export const FullAccount = z.object({
  kind: z.string(), name: z.string().nullish(), parent: z.string().nullish(),
  subAccounts: z.array(z.object({ pubkey: z.string() })).default([]),
  margin: Margin, positions: z.array(Position).default([]),
  openOrders: z.array(z.any()).default([]),
}).passthrough();
export type TFullAccount = z.infer<typeof FullAccount>;
export type TPosition = z.infer<typeof Position>;
export const Ticker = z.object({ symbol: z.string(), lastPrice: z.number(), markPrice: z.number(), fundingRate: z.number(), priceChangePercent: z.number(), openInterest: z.number() }).passthrough();
export type TTicker = z.infer<typeof Ticker>;
export const Page = z.object({ nextCursor: z.string().nullish(), hasMore: z.boolean() }).passthrough();
export const FundingRow = z.object({ symbol: z.string(), size: z.number(), payment: z.number(), fundingRate: z.number(), markPrice: z.number(), slot: z.number(), timestamp: z.number() }).passthrough();
export const FillRow = z.object({ symbol: z.string(), amount: z.number(), price: z.number(), isBuy: z.boolean(), maker: z.string(), taker: z.string(), reasonCode: z.number(), slot: z.number(), timestamp: z.number() }).passthrough();
export const History = <T extends z.ZodTypeAny>(row: T) => z.object({ data: z.array(row), page: Page });
export const RiskRow = z.object({ symbol: z.string(), eventType: z.string(), amount: z.number(), price: z.number(), slot: z.number(), timestamp: z.number(), reason: z.string().nullish(), iso: z.boolean().optional() }).passthrough();
