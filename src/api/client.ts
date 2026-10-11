import { z } from "zod";
import { TokenBucket } from "./limiter";
import { FullAccount, Ticker, History, FundingRow, FillRow, RiskRow, TFullAccount, TTicker } from "./types";

export const API = "https://mainnet-api1.bulk.trade/api/v1";
export const WS = "wss://mainnet-ws1.bulk.trade";

export class BulkError extends Error { constructor(public status: number, public code: string, msg: string) { super(msg); } }

type FetchLike = typeof fetch;
export class BulkClient {
  constructor(private bucket = new TokenBucket(), private f: FetchLike = (...a) => fetch(...a)) {}

  private async req(path: string, init?: RequestInit, attempt = 0): Promise<unknown> {
    await this.bucket.take();
    const r = await this.f(API + path, init);
    if ((r.status === 429 || r.status >= 500) && attempt < 4) {
      const ra = Number(r.headers.get("retry-after"));
      const wait = ra > 0 ? ra * 1000 : Math.min(8000, 500 * 2 ** attempt) * (0.5 + Math.random());
      await new Promise((s) => setTimeout(s, wait));
      return this.req(path, init, attempt + 1);
    }
    const text = await r.text();
    let body: any; try { body = JSON.parse(text); } catch { body = text; }
    if (!r.ok) throw new BulkError(r.status, body?.error?.code ?? "HTTP", body?.error?.message ?? String(text).slice(0, 200));
    return body;
  }
  private account(body: object) {
    return this.req("/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  async fullAccount(user: string): Promise<TFullAccount> {
    const arr = (await this.account({ type: "fullAccount", user })) as any[];
    return FullAccount.parse(arr[0].fullAccount);
  }
  async ticker(symbol: string): Promise<TTicker> { return Ticker.parse(await this.req(`/ticker/${symbol}`)); }
  async history<T extends z.ZodTypeAny>(type: string, row: T, user: string, opts: { limit?: number; cursor?: string; startSlot?: number } = {}) {
    const b: any = { type, user, limit: opts.limit ?? 1000 };
    if (opts.cursor) b.cursor = opts.cursor; else if (opts.startSlot) b.startSlot = opts.startSlot;
    return History(row).parse(await this.account(b));
  }
  async klines(symbol: string, interval: string, startTime: number) {
    const r = (await this.req(`/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}`)) as any[];
    return r.map((k) => ({ t: k.t as number, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }));
  }
  async stats() { return this.req("/stats?period=1d"); }
  async exchangeInfo() { return (await this.req("/exchangeInfo")) as { symbol: string; status: string; maxLeverage: number }[]; }
  fundingHistory(user: string, o?: { limit?: number; cursor?: string; startSlot?: number }) { return this.history("fundingHistory", FundingRow, user, o); }
  riskHistory(user: string, o?: { limit?: number; cursor?: string; startSlot?: number }) { return this.history("riskHistory", RiskRow, user, o); }
  fills(user: string, o?: { limit?: number; cursor?: string; startSlot?: number }) { return this.history("fills", FillRow, user, o); }
}
export const client = new BulkClient();
