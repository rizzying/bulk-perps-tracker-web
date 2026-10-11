> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bulk.trade/llms.txt
> Use this file to discover all available pages before exploring further.

# Get Size-Impact Curve

> Returns the latest executor-published liquidation-size impact curve cached for one market.
Returns `404` until the first curve has been published for the requested symbol.


Returns the latest executor-published liquidation-size impact curve for one
market.

* `market` is required and uses the exact market symbol, such as `BTC-USD`.
* `timestamp` is Unix time in milliseconds.
* `sellBps` and `buyBps` each contain 250 impact values at log-uniform size
  knots.
* `minSize` is the first size knot. For a curve with `n` values, knot `i` is
  `exp(logMin + i / (n - 1) * logRange)`.
* The endpoint returns `404` until the executor publishes the first curve for
  that market.

For live updates, subscribe to the
[`impact` WebSocket stream](/api-reference/ws-market-data#impact-curve-stream).


## OpenAPI

````yaml GET /impact
openapi: 3.0.3
info:
  title: Bulk Trade API
  description: |
    # BULK TRADE (HTTP & WebSocket) API

    One Exchange Infinite Markets.

    ## Scheduled 4 October 2026 upgrade

    The new post-only modes, size metadata, and account-local/aggregate margin
    guidance in this specification apply after the scheduled upgrade.
    Public account snapshots retain `margin`; optional `agg*` fields report
    parent-plus-isolated totals. Internal SDK `metrics` and `aggregate` objects
    are not public response fields.

    ## API Structure

    This API is divided into three main sections:

    ### 1. Market Data Endpoints (Public, Read-only)
    - Exchange information and symbols
    - Market statistics and tickers
    - Historical candles (OHLCV)
    - Order book snapshots
    - **HTTP**: REST endpoints for queries
    - **WebSocket**: Real-time streams for live data

    ### 2. Account Endpoints (Public, Unsigned)
    - Query account state (positions, orders, margin)
    - Query fill history
    - **No signature required** - read-only operations
    - Does not mutate state

    ### 3. Transaction Endpoint (Signed, State-Mutating)
    - Single `POST /order` endpoint for all operations
    - Place orders (limit, market), cancel, faucet, settings, agent wallets
    - Unified `Transaction` model with `actions` array
    - **Signature required** - Ed25519 signature of transaction
    - Mutates account state

    ## Base URLs

    - **HTTP REST (primary)**: `https://mainnet-api1.bulk.trade/api/v1`
    - **WebSocket (primary)**: `wss://mainnet-ws1.bulk.trade`
    - **Testnet HTTP REST**: `https://exchange-api.bulk.trade/api/v1`
    - **Testnet WebSocket**: `wss://exchange-ws1.bulk.trade`

    ## Glossary

    ### Field Notation

    Bulk uses compact field names to minimize bandwidth (critical for HFT):

    | Short | Full Name | Description |
    |-------|-----------|-------------|
    | `s` | symbol | Market symbol (e.g., BTC-USD) |
    | `c` | coin | Market symbol in orders / cancel |
    | `px` | price | Price level |
    | `sz` | size | Order/position size |
    | `b` | is_buy | Buy/sell direction (true=buy, false=sell) |
    | `r` | reduce_only | Order only reduces position |
    | `tif` | time_in_force | Order lifetime (GTC/IOC/ALO/ALO_SLIDE/ALO_JOIN) |
    | `o` | open | Open price (candles) |
    | `h` | high | High price (candles) |
    | `l` | low | Low price (candles) |
    | `v` | volume | Trading volume |
    | `n` | count | Number of trades/orders |
    | `T` | close_time | Close timestamp |
    | `oid` | order_id | Order identifier (base58) |
    | `u` | user | User public key |
    | `a` | agent | Agent public key |
    | `d` | delete | Delete flag |
    | `m` | max_leverage | Leverage settings map |
    | `reason` | reason | Fill reason (normal/liquidation/adl) |

    ### Order Types

    | Action Type | TIF | Description | Use Case |
    |-------------|-----|-------------|----------|
    | `l` | **GTC** | Good Till Cancel | Standard limit order, rests on book |
    | `l` | **IOC** | Immediate or Cancel | Fill or kill (aggressive price) |
    | `l` | **ALO** | Add Liquidity Only | Maker-only (post-only) |
    | `m` | N/A | Market Order | Immediate execution at best price |

    ### Market Terminology

    - **Perpetual**: Perpetual futures contract (no expiry)
    - **Mark Price**: Fair value price (used for margin calculations)
    - **Oracle Price**: External reference price
    - **Open Interest**: Total notional value of open positions
    - **Funding Rate**: Periodic payment between longs and shorts
    - **Maker**: Liquidity provider (resting order)
    - **Taker**: Liquidity consumer (aggressive order)
    - **Tick Size**: Minimum price increment
    - **Lot Size**: Minimum order size

    ### Timestamp Formats

    - **HTTP API**: Milliseconds since Unix epoch (int64)
    - **WebSocket**: Milliseconds since Unix epoch (int64)
    - **Internal**: Nanoseconds (converted at API boundary)
  version: 3.0.10
  contact:
    name: Junbug
    url: https://x.com/junbug_sol
  license:
    name: Custom
    url: https://www.custom.com/license
servers:
  - url: https://mainnet-api1.bulk.trade/api/v1
    description: Mainnet (Primary)
  - url: https://exchange-api.bulk.trade/api/v1
    description: Testnet
security: []
tags:
  - name: Market Data
    description: |
      **Public, read-only endpoints**

      Real-time and historical market data. No authentication required.

      **HTTP**: Query historical data
      **WebSocket**: Subscribe to real-time updates
  - name: Account (Unsigned)
    description: |
      **Public, read-only, no signature required**

      Query account information. Does not mutate state.
      Anyone can query any account's public data.
  - name: Trading (Signed)
    description: |
      **Authenticated, state-mutating endpoints**

      Place and cancel orders. Requires Ed25519 signature.
      See "Transaction Signing" section for details.
paths:
  /impact:
    get:
      tags:
        - Market Data
      summary: Get the latest size-impact curve for a market
      description: >
        Returns the latest executor-published liquidation-size impact curve
        cached for one market.

        Returns `404` until the first curve has been published for the requested
        symbol.
      operationId: getImpact
      parameters:
        - name: market
          in: query
          required: true
          description: Exact market symbol, for example `BTC-USD`
          schema:
            type: string
            example: BTC-USD
      responses:
        '200':
          description: Latest cached impact curve
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Impact'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'
components:
  schemas:
    Impact:
      type: object
      required:
        - symbol
        - timestamp
        - minSize
        - sellBps
        - buyBps
      properties:
        symbol:
          type: string
          example: BTC-USD
        timestamp:
          type: integer
          format: int64
          description: Unix timestamp in milliseconds
          example: 1720000000000
        minSize:
          type: number
          format: double
          description: Size represented by the first curve knot
        sellBps:
          $ref: '#/components/schemas/ImpactCurve'
        buyBps:
          $ref: '#/components/schemas/ImpactCurve'
    ImpactCurve:
      type: object
      required:
        - logMin
        - logRange
        - bps
      properties:
        logMin:
          type: number
          format: double
          description: Natural logarithm of the first size knot
        logRange:
          type: number
          format: double
          description: Natural-log distance between the first and last size knots
        bps:
          type: array
          minItems: 250
          maxItems: 250
          description: Impact in basis points at 250 log-uniform size knots
          items:
            type: number
            format: double
  responses:
    NotFound:
      description: Not Found - Symbol or account doesn't exist
    ServerError:
      description: Internal Server Error - Database or channel error

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.