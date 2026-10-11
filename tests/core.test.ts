import { describe, it, expect } from "vitest";
import fx from "./fullAccount.json";
import { FullAccount } from "../src/api/types";
import { accountSummary, positionView } from "../src/metrics";
import { TokenBucket } from "../src/api/limiter";
import { BulkClient } from "../src/api/client";

const acct = FullAccount.parse((fx as any)[0].fullAccount);
describe("live fixture (wallet B63A…Q3w, 2026-10-10)", () => {
  it("parses and computes equity = totalMargin + uPnL", () => {
    const s = accountSummary(acct);
    expect(s.equity).toBeCloseTo(55.248964 + 7.116788, 5);
    expect(acct.subAccounts.length).toBe(2);
  });
  it("position: long, liq distance, upnl, funding since open", () => {
    const v = positionView(acct.positions[0]);
    expect(v.side).toBe("LONG");
    expect(v.upnl).toBeCloseTo(7.1158, 2);
    expect(v.liqDist!).toBeCloseTo((82645.95067121 - 81268.19770514531) / 82645.95067121, 6);
    expect(v.risk).toBe("danger"); // ~1.67% from liq
    expect(v.fundingSinceOpen).toBeCloseTo(-0.467378874, 8);
    expect(v.tpsl[0]).toMatchObject({ type: "range", px: 81636.1, pxHi: 84500 });
  });
  it("short liq distance is mirrored", () => {
    const p = { ...acct.positions[0], size: -1, liquidationPrice: 110 };
    expect(positionView(p, 100).liqDist).toBeCloseTo(0.1);
  });
});
describe("rate limiter", () => {
  it("never exceeds burst then paces at rate", async () => {
    let t = 0; const b = new TokenBucket(4, 3, () => t);
    let done = 0; for (let i = 0; i < 3; i++) b.take().then(() => done++);
    await Promise.resolve(); await Promise.resolve();
    expect(done).toBe(3);
  });
});
describe("client", () => {
  it("retries 429 then maps 404 ACCOUNT_NOT_FOUND", async () => {
    let n = 0;
    const f: any = async () => { n++; return n === 1 ? new Response("slow", { status: 429, headers: { "retry-after": "0.01" } }) : new Response(JSON.stringify({ error: { code: "ACCOUNT_NOT_FOUND", message: "x" } }), { status: 404 }); };
    const c = new BulkClient(new TokenBucket(100, 100), f);
    await expect(c.fullAccount("x")).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    expect(n).toBe(2);
  });
});
