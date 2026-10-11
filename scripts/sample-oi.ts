// GitHub Actions, every 15 min: record Bulk platform OI (from /stats) for the AURA model's platform OI-hours. 1 Bulk request.
import { neon } from "@neondatabase/serverless";
const s = await (await fetch("https://mainnet-api1.bulk.trade/api/v1/stats?period=1d")).json();
const oi = s?.openInterest?.totalUsd, vol = s?.volume?.totalUsd; if (!(oi > 0)) throw new Error("no OI in /stats");
await neon(process.env.DATABASE_URL!)`insert into oi_samples (t, oi_usd, vol24_usd) values (now(), ${oi}, ${vol ?? null}) on conflict do nothing`;
console.log("OI sample", oi);
