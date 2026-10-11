> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bulk.trade/llms.txt
> Use this file to discover all available pages before exploring further.

# Public API Rate Limits

> Mainnet public HTTP and WebSocket limits, burst budgets, and retry behavior.

These limits apply to the public mainnet endpoints:

* HTTP: `https://mainnet-api1.bulk.trade`
* WebSocket: `wss://mainnet-ws1.bulk.trade`

## HTTP

| Budget | Sustained rate per client IP | Burst capacity |
| - | - | - |
| API requests | 5 requests/second | 150 requests |
| Order actions submitted through `/api/v1/order` | 5 actions/second | 64 actions |

Order submissions must satisfy both budgets. A transaction with 20 top-level actions consumes one HTTP request and 20 action tokens. Batching does not bypass the action limit; cancellations also consume action tokens.

## WebSocket

| Budget | Public limit |
| - | - |
| Trading actions | 32 actions/second per connection |
| Trading-action burst capacity | 96 actions per connection |
| Concurrent connections | 15 per client IP |
| New connection attempts | 45/minute per client IP |

The trading-action budget counts actions inside submitted transactions, not outbound ticker, order-book, or account updates. It is not a promise of a fixed market-data message rate. Each connection has its own action bucket; concurrent connections and connection attempts remain limited per IP.

## How Bursts Work

HTTP request and trading-action budgets use token buckets. Tokens refill at the sustained rate, up to the burst capacity. A burst of 150 HTTP requests is **not** an additional allowance every second or minute. Once that bucket is empty, it refills at five tokens per second.

Clients sharing a public IP share HTTP request/action budgets and WebSocket connection limits. WebSocket trading-action buckets are per connection. Pace traffic to the applicable budget rather than treating a burst as a sustained rate.

## Handling Rate Limits

* **HTTP:** handle status `429`. The response may come from the API or gateway and is not guaranteed to be JSON. Honor `Retry-After` when supplied; otherwise use bounded exponential backoff with jitter.
* **WebSocket trading:** a rate-limited submission can return a negative acknowledgement containing `rate limited: too many actions`. Treat it as a rejected submission, not execution confirmation.
* **Connections:** limit simultaneous connections and stagger reconnects with backoff. Reconnecting repeatedly does not reset a per-IP budget.
* Prefer WebSocket subscriptions over repeated HTTP polling for market and account updates.

Rate limits and protective controls may change. Clients should handle rejection even when operating below the published sustained rates.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.