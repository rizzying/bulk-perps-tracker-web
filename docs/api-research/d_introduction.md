> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bulk.trade/llms.txt
> Use this file to discover all available pages before exploring further.

# API Overview

> HTTP & WebSocket API

<Card title="Download OpenAPI Spec" icon="download" href="/api-reference/openapi.yaml" color="#FFB457">
  Complete OpenAPI 3.0 specification. Import into Postman, generate client SDKs, or browse the schema directly.
</Card>

## API Structure

Is divided into three main sections:

<CardGroup cols={3}>
  <Card title="Market Data" icon="chart-line" color="#FFB457">
    **Public, Read-only**

    Real-time and historical market data. No authentication required.
  </Card>

  <Card title="Account Queries" icon="user" color="#FFB457">
    **Public, Unsigned**

    Query account state without signatures.
  </Card>

  <Card title="Trading" icon="bolt" color="#FFB457">
    **Authenticated, Signed**

    State-mutating operations requiring Ed25519 signatures. Use **[bulk-keychain](https://github.com/Bulk-trade/bulk-keychain)** (Node, browser, Python, Rust) for signing.
  </Card>
</CardGroup>

## Base URLs

<CodeGroup>
  ```bash Mainnet HTTP (Primary) theme={null}
  https://mainnet-api1.bulk.trade/api/v1
  ```

  ```bash Mainnet WebSocket (Primary) theme={null}
  wss://mainnet-ws1.bulk.trade
  ```

  ```bash Testnet HTTP theme={null}
  https://exchange-api.bulk.trade/api/v1
  ```

  ```bash Testnet WebSocket theme={null}
  wss://exchange-ws1.bulk.trade
  ```
</CodeGroup>

<Note>
  Mainnet and testnet are separate networks. Signed transactions must use the matching [signature domain](/api-reference/signing#what-gets-signed).
</Note>

## Quick Start

<Steps>
  <Step title="Query Market Data">
    No authentication required - start exploring immediately.

    ```bash theme={null}
    curl https://mainnet-api1.bulk.trade/api/v1/exchangeInfo
    ```
  </Step>

  <Step title="Check Your Account">
    Query your positions and orders (no signature needed).

    ```bash theme={null}
    curl -X POST https://mainnet-api1.bulk.trade/api/v1/account \
      -H "Content-Type: application/json" \
      -d '{"type":"fullAccount","user":"FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7"}'
    ```
  </Step>

  <Step title="Get Testnet Funds">
    Request testnet funds through the testnet endpoint. The faucet is not available on mainnet. See [Request Faucet](/api-reference/requestFaucet) for details.
  </Step>

  <Step title="Place Your First Order">
    Sign and submit a transaction with the official **[bulk-keychain](https://github.com/Bulk-trade/bulk-keychain)** library (Node, browser, Python, Rust) or see [Transaction Signing](/api-reference/signing) for the protocol details.
  </Step>
</Steps>

## Field Notation

Bulk uses compact field names to minimize bandwidth :

| Short | Full Name | Description |
| - | - | - |
| `s` | symbol | Market symbol (e.g., BTC-USD) |
| `c` | coin | Market symbol in orders |
| `px` | price | Price level |
| `sz` | size | Order/position size |
| `b` | is\_buy | Buy/sell direction (true=buy) |
| `r` | reduce\_only | Order only reduces position |
| `t` | type | Order type object |
| `oid` | order\_id | Order identifier |
| `tif` | time\_in\_force | Order lifetime (GTC/IOC/ALO) |
| `d` | direction | Trigger direction (true=above) |
| `tr` | trigger | Trigger threshold price |
| `lim` | limit | Post-trigger limit price |
| `mk` | maker | Maker/resting flag |
| `of` | on\_fill | On-fill consequent actions |

## Order Types

| Type | Tag | Description | Use Case |
| - | - | - | - |
| **Limit** | `l` | Resting limit order | Standard GTC/IOC/ALO order |
| **Market** | `m` | Immediate execution | Market order at best price |
| **Stop** | `st` | Conditional stop | Trigger sell/buy on price break |
| **Take Profit** | `tp` | Conditional take-profit | Exit position at target price |
| **Range / OCO** | `rng` | One-cancels-other pair | Combined stop + take-profit |
| **Trigger Basket** | `trig` | Conditional action list | Execute multiple actions on trigger |
| **Trailing Stop** | `trl` | Trailing conditional | Adjusts with favorable price |
| **On-Fill** | `of` | Fill-triggered actions | Attach stop/TP after entry fills |

## Timestamp Format

All timestamps are in **milliseconds since Unix epoch** (int64) for both HTTP and WebSocket APIs.

<Note>
  **Nonce for Signed Transactions**: Use nanoseconds for the `nonce` field: `BigInt(Date.now()) * 1_000_000n`
</Note>

***

## Resources

See [Public API Rate Limits](/api-reference/rate-limits) for mainnet request, trading-action, and WebSocket connection budgets.

<CardGroup cols={2}>
  <Card title="API Changelog" icon="clock" href="/api-reference/changelog">
    View API updates and version history
  </Card>

  <Card title="bulk-keychain" icon="key" href="https://github.com/Bulk-trade/bulk-keychain">
    Official signing library for Node.js, browser, Python, and Rust
  </Card>
</CardGroup>


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.