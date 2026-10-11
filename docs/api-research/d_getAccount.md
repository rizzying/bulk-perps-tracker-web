> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bulk.trade/llms.txt
> Use this file to discover all available pages before exploring further.

# Query Account (Unsigned)

> Query account information. **No signature required** - read-only operation.

Accepts a JSON body with POST request.

**Query types**:

| `type` | Returns |
|---|---|
| `fullAccount` | Complete state (margin + positions + orders + leverage settings) |
| `openOrders` | Resting live orders (includes conditional orders parked in conditional books) |
| `feeTier` | Account-only fee-tier quote snapshot (`symbol` optional). For global fee state use `GET /feeState`. |
| `fills` | Paginated trade fills |
| `positions` | Paginated closed positions |
| `fundingHistory` | Paginated funding payments |
| `orderHistory` | Paginated terminal order states |
| `activityHistory` | Paginated account activity |
| `riskHistory` | Paginated liquidation, ADL, and risk-vault events |

History queries return a plain typed `{data, page}` object; current-state queries retain
their existing array response. History `limit` defaults to 5000 and is
bounded to 1–5000. A first page may include inclusive `startSlot` and
`endSlot` bounds. A continuation includes the same `type` and `user`,
`cursor`, and an optional changed `limit`; it cannot include slot bounds.


<Note>
  **4 October 2026 upgrade:** the account-local and aggregate margin guidance below
  applies after the scheduled upgrade. Public responses retain the `margin`
  object; they do not expose the SDK's internal `metrics` and `aggregate` objects.
</Note>

## Query Targets

`POST /account` is unsigned. Current-state query types accept a **master** or
**sub-account** pubkey as `user`. History queries use the same endpoint and may
also query a physical isolated-account pubkey directly.

| Pubkey passed in `user` | What you get back |
| - | - |
| **Master** | Master snapshot. `fullAccount` and `openOrders` include the master's own rows **plus** rows from any per-instrument isolated accounts attached to it (each isolated row carries `iso = true` and `isoPubkey`). |
| **Sub-account** | Snapshot scoped to that sub-account. `kind = "SubAccount"` and `parent` is the master pubkey. Current-state views also include any per-instrument isolated-account rows attached to that sub-account. |

Isolated accounts are not current-state query targets.
An isolated `isoPubkey` is supported only by the paginated history types.
Isolated accounts are managed via the `i` flag on order actions (see [Isolated
Margin](/bulk-exchange/isolated-margin)); their pubkeys also appear inline on
parent rows and can be used as `to` in margin [`transfer`](/api-reference/transfer)
top-ups.

To enumerate sub-accounts on a master, read `subAccounts[]` from its `fullAccount` response.

***

## Request Examples

<CodeGroup>
  ```json Full Account theme={null}
  {
    "type": "fullAccount",
    "user": "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7"
  }
  ```

  ```json Open Orders theme={null}
  {
    "type": "openOrders",
    "user": "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7"
  }
  ```

  ```json Fee Tier theme={null}
  {
    "type": "feeTier",
    "user": "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7",
    "symbol": "BTC-USD"
  }
  ```

  ```json Sub-Account theme={null}
  {
    "type": "fullAccount",
    "user": "8x7iUti9m6L6Y9yQPXkXj4zD2uP1Qx5Eo9W4vYm6cGmR"
  }
  ```

  ```json History First Page theme={null}
  {
    "type": "fills",
    "user": "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7",
    "limit": 500,
    "startSlot": 12000,
    "endSlot": 13000
  }
  ```

  ```json History Continuation theme={null}
  {
    "type": "fills",
    "user": "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7",
    "limit": 1000,
    "cursor": "opaque-base64url-cursor"
  }
  ```
</CodeGroup>

***

## Response Schemas

Current-state responses are an **array** of externally tagged objects with
`fullAccount`, `openOrder`, or `feeTier`. History types return a plain typed
`{data, page}` object.

## History Queries

Use `fills`, `positions`, `fundingHistory`, `orderHistory`, `activityHistory`,
or `riskHistory` as the request `type`.

* `limit` is optional, defaults to 5000, and accepts 1–5000.
* `startSlot` and `endSlot` are optional inclusive bounds on the first page.
* Continue with the returned `cursor`. A cursor request may change `limit` but
  cannot include slot bounds.

History responses use this envelope:

```json theme={null}
{
  "data": [],
  "page": {
    "nextCursor": "opaque-base64url-cursor",
    "hasMore": true,
    "asOfSlot": 13000,
    "startSlot": 12000,
    "endSlot": 13000,
    "coverage": "complete",
    "minAvailableSlot": 12000
  }
}
```

Rows are ordered newest-first by slot and sequence. Always continue with
`nextCursor`; do not construct cursors from timestamps or row fields.

Fill rows include `tradeId` in `"<slot>:<event-sequence>"` form. REST history
and account WebSocket views of the same execution share the same value. Treat
it as an opaque network-local reconciliation key.

`positions` history rows may include `averageEntryTime` when available.

### Full Account Response

For `type: "fullAccount"`. Returns account state including margin, positions, open orders, and leverage settings. The example below shows selected fields.

```json theme={null}
[
  {
    "fullAccount": {
      "kind": "MasterEOA",
      "subAccounts": [
        {"pubkey": "8x7iUti9m6L6Y9yQPXkXj4zD2uP1Qx5Eo9W4vYm6cGmR"}
      ],
      "authorizedAgentWallets": [
        "6pJ8vnrWofWgrn9doYBBRjijV5e6YJ2yN1U2EMRk4cLQ"
      ],
      "builderCodeApprovals": [
        {
          "recipient": "5Am6JkEHAjYG1itNWRMGpQrxvY8AaqkXCo1TZvenqVux",
          "maxFee": 5
        }
      ],
      "margin": {
        "totalMargin": 100000.0,
        "availableMargin": 95000.0,
        "executionImpact": 0.0,
        "transferableBalance": 94750.0,
        "marginUsed": 5000.0,
        "marginBufferRate": 0.05,
        "bufferedMargin": 5250.0,
        "notional": 50000.0,
        "realizedPnl": 1234.0,
        "unrealizedPnl": 500.0,
        "fees": 12.5,
        "funding": -5.0
      },
      "positions": [
        {
          "symbol": "BTC-USD",
          "size": 0.5,
          "price": 100000.0,
          "fairPrice": 100050.0,
          "notional": 50000.0,
          "realizedPnl": 1234.0,
          "unrealizedPnl": 500.0,
          "leverage": 5.0,
          "liquidationPrice": 80000.0,
          "fees": 12.5,
          "funding": -5.0,
          "maintenanceMargin": 2500.0,
          "averageEntryTime": 1775550000000000000,
          "lambda": 0.05,
          "riskAllocation": 0.8,
          "iso": false,
          "protection": {
            "orders": [
              {
                "orderId": "9fJdDgS8eYq9Dj8YkXTY32tRAb4gk58wEAg2a5kzCL5P",
                "orderType": "stop",
                "trigger": {
                  "px": 98000.0,
                  "lim": 97950.0,
                  "oco": null
                }
              }
            ]
          }
        }
      ],
      "openOrders": [
        {
          "symbol": "BTC-USD",
          "orderId": "Fpa3oVuL3UzjNANAMZZdmrn6D1Zhk83GmBuJpuAWG51F",
          "price": 100000.0,
          "originalSize": 0.1,
          "size": 0.1,
          "filledSize": 0.0,
          "vwap": 0.0,
          "maker": true,
          "reduceOnly": false,
          "orderType": "limit",
          "trigger": null,
          "tif": "gtc",
          "status": "resting",
          "timestamp": 1704067200000000000,
          "iso": false
        }
      ],
      "feeTiers": [
        {
          "symbol": "global",
          "rollingVolume": 1200000.0,
          "tierIndex": 1,
          "tierThreshold": 1000000.0,
          "makerBps": 1.8,
          "takerBps": 3.3,
          "windowDays": 14
        }
      ],
      "leverageSettings": [
        { "symbol": "BTC-USD", "leverage": 5.0 },
        { "symbol": "ETH-USD", "leverage": 3.0 }
      ],
      "lockedAmounts": [
        {
          "hash": "uQ8yioSC6fYLWwWS2XAi97vMJXKur3GKr7DEp1tdMqs",
          "symbol": "USDC",
          "amount": 500.0,
          "lockedAt": 1700000000000000000
        }
      ]
    }
  }
]
```

**Account top-level fields:**

* `kind` - Account kind string. Current-state query responses use `MasterEOA` or `SubAccount`.
* `parent` - Parent master pubkey for sub-accounts; omitted when no parent exists
* `name` - Sub-account display name. Present on responses where `kind: "SubAccount"` (i.e. when you passed the sub-account pubkey as `user`); omitted on master responses.
* `subAccounts` - Children of the master, each `{pubkey}`. The list contains pubkeys only; query a sub-account directly with `type: "fullAccount"` to see its `name`. See [Sub-Accounts](/api-reference/manageSubAccounts)
* `authorizedAgentWallets` - Agent wallets registered on this account that may sign on its behalf. See [Manage Agent Wallets](/api-reference/manageAgentWallet)
* `builderCodeApprovals` - Approved builder-code recipients as `{recipient, maxFee}`. Builder codes are builder-code fees on the wire; use `abc`/`rbc` to manage this list.
* `lockedAmounts` - Margin locked while a transfer or withdrawal is in
  progress, omitted when empty. Each row contains the action `hash`, `symbol`,
  `amount`, and nanosecond `lockedAt` timestamp. Locks clear when the operation
  completes or is no longer pending.

### Account-local and aggregate margin

The unprefixed fields inside `margin` describe the queried account only. When
that account has attached isolated accounts, optional `agg*` fields in the same
object describe the account **plus those isolated accounts**. These totals do
not include separate sub-accounts. Do not add the unprefixed values to the
`agg*` values: that would count the parent twice.

Illustrative partial response for an account with isolated collateral:

```json theme={null}
[
  {
    "fullAccount": {
      "margin": {
        "totalMargin": 1000.0,
        "availableMargin": 900.0,
        "marginUsed": 100.0,
        "aggTotalMargin": 1250.0,
        "aggAvailableMargin": 1125.0,
        "aggMarginUsed": 125.0
      }
    }
  }
]
```

| Field in `margin` | Meaning |
| - | - |
| `totalMargin` | Account-local margin balance |
| `availableMargin` | `totalMargin - marginUsed`; not the withdrawable balance |
| `executionImpact` | Non-positive difference between impacted and unrealized P\&L |
| `transferableBalance` | Balance currently eligible for transfer under the account's risk constraints |
| `marginUsed` | Account-local maintenance margin |
| `marginBufferRate` | Buffer rate applied to maintenance margin |
| `bufferedMargin` | `marginUsed * (1 + marginBufferRate)` |
| `notional`, `realizedPnl`, `unrealizedPnl`, `fees`, `funding` | Account-local reported values |
| `aggTotalMargin`, `aggAvailableMargin`, `aggExecutionImpact`, `aggTransferableBalance`, `aggMarginUsed`, `aggBufferedMargin`, `aggNotional`, `aggRealizedPnl`, `aggUnrealizedPnl`, `aggFees`, `aggFunding` | Corresponding parent-plus-isolated totals; omitted when no isolated owners are attached |

`positions` and `openOrders` remain the combined parent-plus-isolated view,
with isolated rows identified by `iso` and `isoPubkey`. Public margin fields are
`totalMargin` and `availableMargin`, not `totalBalance` and `availableBalance`.

**Position fields:** `symbol`, `size`, `price`, `fairPrice`, `notional`, `realizedPnl`, `unrealizedPnl`, `leverage`, `liquidationPrice`, `fees`, `funding`, `maintenanceMargin`, `averageEntryTime`, `lambda`, `riskAllocation`, `iso`

* `averageEntryTime` - Average entry time in nanoseconds.
* `iso` - `true` if the position belongs to a per-instrument [isolated account](/bulk-exchange/isolated-margin) attached to this master/sub-account; otherwise `false`
* `isoPubkey` - Present only when `iso=true`; pubkey of the isolated account. Use as `to` in [`transfer`](/api-reference/transfer) to top up isolated-account margin. It is valid as `user` for history queries, but not for current-state queries.
* `protection` - Optional attached reduce-only protective orders for this symbol

### Open Orders Response

For `type: "openOrders"`. Returns up to 5000 resting orders; each item is an object with key `openOrder`.

```json theme={null}
[
  {
    "openOrder": {
      "symbol": "BTC-USD",
      "orderId": "Fpa3oVuL3UzjNANAMZZdmrn6D1Zhk83GmBuJpuAWG51F",
      "price": 99000.0,
      "originalSize": 0.1,
      "size": 0.1,
      "filledSize": 0.0,
      "vwap": 0.0,
      "maker": true,
      "reduceOnly": false,
      "orderType": "limit",
      "trigger": null,
      "tif": "gtc",
      "status": "resting",
      "timestamp": 1699564800000000000,
      "iso": false
    }
  }
]
```

For master/sub accounts, the response also includes per-instrument isolated-account rows (`iso=true`) belonging to that account tree.

Order-state `tif` values are `gtc`, `ioc`, `postOnly`, `postOnlySlide`, and
`postOnlyJoin`. The last two correspond to the JSON request values `ALO_SLIDE`
and `ALO_JOIN`; see [Place & Cancel Orders](/api-reference/placeOrder).

### Fee Tier Response

For `type: "feeTier"`. Returns the account-only fee-tier quote snapshot. For global fee-state (policy, schedules, settlement totals) use [`GET /feeState`](/api-reference/getFeeState).

```json theme={null}
[
  {
    "feeTier": {
      "scopeInstrument": "BTC-USD",
      "rollingVolume": 1200000.0,
      "tierIndex": 1,
      "tierThreshold": 1000000.0,
      "makerBps": 1.8,
      "takerBps": 3.3,
      "windowDays": 14
    }
  }
]
```

**Fee Tier Fields:**

* `scopeInstrument` - Instrument scope resolved for this quote
* `rollingVolume` - Account rolling volume in resolved scope window
* `tierIndex` - Active tier index (0-based)
* `tierThreshold` - Threshold volume of the active tier row
* `makerBps` / `takerBps` - Effective bps at current tier
* `windowDays` - Rolling window length in days

***

## Real-time Updates

For real-time account updates, use the [WebSocket account stream](/api-reference/ws-account).

```json theme={null}
{
  "method": "subscribe",
  "subscription": [{
    "type": "account",
    "user": "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7"
  }]
}
```


## OpenAPI

````yaml POST /account
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
  /account:
    post:
      tags:
        - Account (Unsigned)
      summary: Query account (unsigned)
      description: >
        Query account information. **No signature required** - read-only
        operation.


        Accepts a JSON body with POST request.


        **Query types**:


        | `type` | Returns |

        |---|---|

        | `fullAccount` | Complete state (margin + positions + orders + leverage
        settings) |

        | `openOrders` | Resting live orders (includes conditional orders parked
        in conditional books) |

        | `feeTier` | Account-only fee-tier quote snapshot (`symbol` optional).
        For global fee state use `GET /feeState`. |

        | `fills` | Paginated trade fills |

        | `positions` | Paginated closed positions |

        | `fundingHistory` | Paginated funding payments |

        | `orderHistory` | Paginated terminal order states |

        | `activityHistory` | Paginated account activity |

        | `riskHistory` | Paginated liquidation, ADL, and risk-vault events |


        History queries return a plain typed `{data, page}` object;
        current-state queries retain

        their existing array response. History `limit` defaults to 5000 and is

        bounded to 1–5000. A first page may include inclusive `startSlot` and

        `endSlot` bounds. A continuation includes the same `type` and `user`,

        `cursor`, and an optional changed `limit`; it cannot include slot
        bounds.
      operationId: getAccount
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AccountQuery'
            examples:
              fullAccount:
                summary: Get full account state
                value:
                  type: fullAccount
                  user: FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7
              openOrders:
                summary: Get open orders only
                value:
                  type: openOrders
                  user: FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7
              feeTier:
                summary: Get account fee tier quote
                value:
                  type: feeTier
                  user: FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7
                  symbol: BTC-USD
              fills:
                summary: Get the first page of fills
                value:
                  type: fills
                  user: FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7
                  limit: 500
                  startSlot: 12000
                  endSlot: 13000
              fillsContinuation:
                summary: Continue a fills page
                value:
                  type: fills
                  user: FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7
                  limit: 1000
                  cursor: opaque-base64url-cursor
      responses:
        '200':
          description: Current-state array or complete/default-policy typed history page
          content:
            application/json:
              schema:
                anyOf:
                  - type: array
                    items:
                      $ref: '#/components/schemas/AccountData'
                  - $ref: '#/components/schemas/HistoryFillPage'
                  - $ref: '#/components/schemas/ClosedPositionHistoryPage'
                  - $ref: '#/components/schemas/FundingPaymentHistoryPage'
                  - $ref: '#/components/schemas/TerminalOrderHistoryPage'
                  - $ref: '#/components/schemas/AccountActivityHistoryPage'
                  - $ref: '#/components/schemas/RiskEventHistoryPage'
        '206':
          description: Incomplete history page when partial reads are enabled
          headers:
            X-Bulk-History-Status:
              description: '`partial` or `unknown`'
              schema:
                type: string
                enum:
                  - partial
                  - unknown
            X-Bulk-History-Min-Available-Slot:
              description: Earliest authoritative available slot; omitted when unknown
              schema:
                type: integer
                format: int64
                minimum: 0
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/HistoryFillPage'
                  - $ref: '#/components/schemas/ClosedPositionHistoryPage'
                  - $ref: '#/components/schemas/FundingPaymentHistoryPage'
                  - $ref: '#/components/schemas/TerminalOrderHistoryPage'
                  - $ref: '#/components/schemas/AccountActivityHistoryPage'
                  - $ref: '#/components/schemas/RiskEventHistoryPage'
        '400':
          $ref: '#/components/responses/HistoryBadRequest'
        '404':
          $ref: '#/components/responses/AccountNotFound'
        '408':
          $ref: '#/components/responses/Timeout'
        '409':
          $ref: '#/components/responses/HistoryConflict'
        '410':
          $ref: '#/components/responses/HistoryCursorExpired'
        '422':
          $ref: '#/components/responses/AccountUnprocessable'
        '500':
          $ref: '#/components/responses/AccountServerError'
        '503':
          $ref: '#/components/responses/HistoryUnavailable'
components:
  schemas:
    AccountQuery:
      type: object
      additionalProperties: false
      description: Unsigned current-state or paginated-history query
      required:
        - type
        - user
      properties:
        type:
          type: string
          enum:
            - fullAccount
            - openOrders
            - feeTier
            - fills
            - positions
            - fundingHistory
            - orderHistory
            - activityHistory
            - riskHistory
          description: >-
            `feeTier` returns the account-only fee-tier quote; use `GET
            /feeState` for global fee policy/schedule snapshots.
        user:
          type: string
          description: Account public key (base58)
          example: FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7
        symbol:
          type: string
          description: Optional market symbol for `feeTier`
          example: BTC-USD
        limit:
          type: integer
          minimum: 1
          maximum: 5000
          default: 5000
          description: Optional page size for history queries
        startSlot:
          type: integer
          format: int64
          minimum: 0
          description: Optional inclusive lower slot bound for the first history page
        endSlot:
          type: integer
          format: int64
          minimum: 0
          description: Optional inclusive upper slot bound for the first history page
        cursor:
          type: string
          description: Opaque history continuation; cannot be combined with slot bounds
    AccountData:
      oneOf:
        - type: object
          additionalProperties: false
          required:
            - fullAccount
          properties:
            fullAccount:
              $ref: '#/components/schemas/FullAccount'
        - type: object
          additionalProperties: false
          required:
            - openOrder
          properties:
            openOrder:
              $ref: '#/components/schemas/OrderState'
        - type: object
          additionalProperties: false
          required:
            - feeTier
          properties:
            feeTier:
              $ref: '#/components/schemas/FeeTierAccountQuote'
    HistoryFillPage:
      type: object
      required:
        - data
        - page
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/HistoryFillRow'
        page:
          $ref: '#/components/schemas/HistoryPageInfo'
    ClosedPositionHistoryPage:
      type: object
      required:
        - data
        - page
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/ClosedPositionHistoryRow'
        page:
          $ref: '#/components/schemas/HistoryPageInfo'
    FundingPaymentHistoryPage:
      type: object
      required:
        - data
        - page
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/FundingPaymentHistoryRow'
        page:
          $ref: '#/components/schemas/HistoryPageInfo'
    TerminalOrderHistoryPage:
      type: object
      required:
        - data
        - page
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/TerminalOrderHistoryRow'
        page:
          $ref: '#/components/schemas/HistoryPageInfo'
    AccountActivityHistoryPage:
      type: object
      required:
        - data
        - page
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/AccountActivityHistoryRow'
        page:
          $ref: '#/components/schemas/HistoryPageInfo'
    RiskEventHistoryPage:
      type: object
      required:
        - data
        - page
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/RiskEventHistoryRow'
        page:
          $ref: '#/components/schemas/HistoryPageInfo'
    FullAccount:
      type: object
      description: >-
        Complete account state with account tree, margin, positions, orders, and
        leverage settings
      properties:
        kind:
          type: string
          description: Account kind
        parent:
          type: string
          nullable: true
          description: >-
            Parent account pubkey (present for sub/iso accounts, otherwise
            `null`)
        name:
          type: string
          nullable: true
          description: >
            Sub-account display name. Present on responses where `kind:
            "SubAccount"`

            (i.e. when the sub-account pubkey was passed as `user`); omitted on
            master responses.
        subAccounts:
          type: array
          description: >
            Child sub-accounts owned by this master (empty for non-master
            kinds).

            The list contains pubkeys only; query a sub-account directly with
            `type: "fullAccount"`

            (HTTP) or subscribe to its account stream (WS) to see its `name`.
          items:
            type: object
            required:
              - pubkey
            properties:
              pubkey:
                type: string
                description: Sub-account pubkey (base58)
        authorizedAgentWallets:
          type: array
          description: >
            Agent wallets registered on this account that may sign on its
            behalf.

            Agents registered on a master are also authorized to sign for any of
            the master's sub-accounts. Sub-accounts can additionally register
            their own agents independently.
          items:
            type: string
        builderCodeApprovals:
          type: array
          description: >-
            Approved builder-code recipients for this account. Builder codes are
            builder-code fees on the wire.
          items:
            $ref: '#/components/schemas/BuilderCodeApproval'
        margin:
          $ref: '#/components/schemas/Margin'
        positions:
          type: array
          description: >-
            Open positions with full risk metrics. For master/sub accounts,
            includes per-instrument isolated-account rows (`iso=true`).
          items:
            $ref: '#/components/schemas/Position'
        openOrders:
          type: array
          description: >-
            Resting live orders, including conditional orders parked in
            conditional books. For master/sub accounts, includes per-instrument
            isolated-account rows (`iso=true`).
          items:
            $ref: '#/components/schemas/OrderState'
        pendingOnFill:
          type: array
          description: Registered on-fill plans waiting for parent order fill
          items:
            $ref: '#/components/schemas/PendingOnFillPlan'
        feeTiers:
          type: array
          description: Effective fee tier snapshot rows for global and instrument scopes
          items:
            $ref: '#/components/schemas/FeeTierQuote'
        leverageSettings:
          type: array
          description: Per-symbol leverage settings
          items:
            $ref: '#/components/schemas/LeverageEntry'
        lockedAmounts:
          type: array
          description: >-
            Margin locked while a transfer or withdrawal is in progress; omitted
            when empty
          items:
            $ref: '#/components/schemas/LockedAmount'
    OrderState:
      type: object
      description: Order status and details
      properties:
        symbol:
          type: string
          description: Market symbol
        orderId:
          type: string
          description: Order ID (base58) - use for cancellation
        price:
          type: number
          description: >-
            Order price (for conditional roots this is projected from trigger
            threshold when direct price is not set)
        originalSize:
          type: number
          description: >-
            Original order size (signed; negative values indicate sell-side
            intent)
        size:
          type: number
          description: >-
            Remaining size (signed; negative values indicate sell-side intent;
            `trigger` baskets use `0` because they are action containers, not
            direct sized orders)
        filledSize:
          type: number
          description: Filled size
        vwap:
          type: number
          description: Volume-weighted average fill price (0 if no fills)
        maker:
          type: boolean
          description: true if order is maker (resting on book)
        reduceOnly:
          type: boolean
          description: true if reduce-only order
        orderType:
          type: string
          enum:
            - limit
            - market
            - stop
            - takeProfit
            - range
            - trigger
            - trailing
          description: Inferred order type for snapshots/open-orders
        trigger:
          allOf:
            - $ref: '#/components/schemas/TriggerSpec'
          nullable: true
          description: Trigger metadata for conditional/trigger orders, otherwise `null`
        tif:
          type: string
          enum:
            - gtc
            - ioc
            - postOnly
            - postOnlySlide
            - postOnlyJoin
          description: Time in force
        status:
          type: string
          enum:
            - pending
            - placed
            - resting
            - working
            - modified
            - filled
            - partiallyFilled
            - cancelled
            - cancelledRiskLimit
            - cancelledSelfCrossing
            - cancelledReduceOnly
            - cancelledIoc
            - rejectedInvalid
            - rejectedRiskLimit
            - rejectedCrossing
            - rejectedDuplicate
            - triggered
            - siblingCancelled
            - triggerFailed
          description: Order status
        timestamp:
          type: integer
          format: int64
          description: Order placement time (nanoseconds)
        iso:
          type: boolean
          description: >-
            `true` if this row belongs to a per-instrument isolated account,
            otherwise `false`
    FeeTierAccountQuote:
      type: object
      description: >
        Account-only fee-tier quote returned by `POST /account` with `type:
        "feeTier"`.

        For global fee state (policy/schedule/settlement totals), use `GET
        /feeState`.
      properties:
        scopeInstrument:
          type: string
          description: >-
            Instrument scope resolved for this quote (`global` or a market
            symbol)
        rollingVolume:
          type: number
          description: Account rolling volume in resolved scope window
        tierIndex:
          type: integer
          format: int32
          description: Active tier index (0-based)
        tierThreshold:
          type: number
          description: Threshold volume of the active tier row
        makerBps:
          type: number
        takerBps:
          type: number
        windowDays:
          type: integer
          format: int32
          description: Rolling window length in days
    HistoryFillRow:
      allOf:
        - $ref: '#/components/schemas/Fill'
        - type: object
          required:
            - maker
            - taker
            - orderIdMaker
            - orderIdTaker
            - isBuy
            - symbol
            - amount
            - price
            - makerFee
            - takerFee
            - fee
            - reasonCode
            - iso
            - slot
            - timestamp
            - sequence
    HistoryPageInfo:
      type: object
      required:
        - nextCursor
        - hasMore
        - asOfSlot
        - startSlot
        - endSlot
        - coverage
      properties:
        nextCursor:
          type: string
          nullable: true
          description: Opaque exclusive continuation; null exactly when hasMore is false
        hasMore:
          type: boolean
        asOfSlot:
          type: integer
          format: int64
          minimum: 0
        startSlot:
          type: integer
          format: int64
          minimum: 0
        endSlot:
          type: integer
          format: int64
          minimum: 0
        coverage:
          type: string
          enum:
            - complete
            - partial
            - unknown
          description: >-
            Coverage of the effective inclusive range. Backfill proof is fixed
            at its inclusive cutoff and is not advanced by newer live rows.
        minAvailableSlot:
          type: integer
          format: int64
          minimum: 0
          description: >-
            Earliest authoritative slot for this direct or aggregate history
            scope; primary and parent-alias retention floors are independent.
            Omitted when unknown.
    ClosedPositionHistoryRow:
      allOf:
        - $ref: '#/components/schemas/ClosedPosition'
        - type: object
          required:
            - owner
            - symbol
            - quantity
            - maxQuantity
            - totalVolume
            - avgOpenPrice
            - avgClosePrice
            - realizedPnl
            - fees
            - funding
            - openTime
            - closeTime
            - closeReason
            - iso
            - closeSlot
            - sequence
    FundingPaymentHistoryRow:
      allOf:
        - $ref: '#/components/schemas/FundingPayment'
        - type: object
          required:
            - owner
            - symbol
            - size
            - payment
            - fundingRate
            - markPrice
            - iso
            - slot
            - timestamp
            - sequence
    TerminalOrderHistoryRow:
      allOf:
        - $ref: '#/components/schemas/OrderHistoryEntry'
        - type: object
          required:
            - orderId
            - symbol
            - side
            - orderType
            - tif
            - price
            - vwap
            - originalSize
            - executedSize
            - reduceOnly
            - status
            - iso
            - slot
            - timestamp
            - sequence
    AccountActivityHistoryRow:
      allOf:
        - $ref: '#/components/schemas/ActivityHistoryEntry'
        - type: object
          required:
            - activityType
            - status
            - from
            - to
            - symbol
            - amount
            - iso
            - slot
            - timestamp
            - sequence
    RiskEventHistoryRow:
      allOf:
        - $ref: '#/components/schemas/RiskEvent'
        - type: object
          required:
            - owner
            - symbol
            - isBuy
            - amount
            - price
            - eventType
            - iso
            - slot
            - timestamp
            - sequence
    HistoryErrorEnvelope:
      type: object
      required:
        - error
      properties:
        error:
          $ref: '#/components/schemas/HistoryErrorBody'
    BuilderCodeApproval:
      type: object
      properties:
        recipient:
          type: string
          description: Approved builder-code recipient public key (base58)
        maxFee:
          type: integer
          format: int32
          minimum: 1
          maximum: 15
          description: Maximum approved builder-code fee in basis points
    Margin:
      type: object
      description: >-
        Account-local margin and PnL; optional agg-prefixed fields include
        attached isolated accounts, not separate sub-accounts
      properties:
        totalMargin:
          type: number
          description: Account-local margin balance
        availableMargin:
          type: number
          description: >-
            Account-local totalMargin minus marginUsed; not the transferable
            balance
        executionImpact:
          type: number
          description: Non-positive difference between impacted and unrealized PnL
        transferableBalance:
          type: number
          description: Account-local balance eligible for transfer under risk constraints
        marginUsed:
          type: number
          description: Total maintenance margin requirement
        marginBufferRate:
          type: number
          description: Maintenance-margin buffer rate
        bufferedMargin:
          type: number
          description: marginUsed multiplied by (1 + marginBufferRate)
        notional:
          type: number
          description: Total position notional value
        realizedPnl:
          type: number
          description: Total realized profit/loss
        unrealizedPnl:
          type: number
          description: Total unrealized profit/loss
        fees:
          type: number
          description: Total fees paid
        funding:
          type: number
          description: Total funding payments
        aggTotalMargin:
          type: number
          description: >-
            Parent-plus-isolated margin; omitted without attached isolated
            owners
        aggAvailableMargin:
          type: number
          description: Parent-plus-isolated margin minus maintenance margin
        aggExecutionImpact:
          type: number
          description: >-
            Non-positive difference between aggregate impacted and unrealized
            PnL
        aggTransferableBalance:
          type: number
          description: >-
            Sum of parent-plus-isolated transferable balances; not a promise
            that the parent can directly withdraw isolated collateral
        aggMarginUsed:
          type: number
          description: Parent-plus-isolated maintenance margin
        aggBufferedMargin:
          type: number
          description: Aggregate maintenance margin multiplied by (1 + marginBufferRate)
        aggNotional:
          type: number
          description: Parent-plus-isolated position notional
        aggRealizedPnl:
          type: number
          description: Parent-plus-isolated realized PnL
        aggUnrealizedPnl:
          type: number
          description: Parent-plus-isolated unrealized PnL
        aggFees:
          type: number
          description: Parent-plus-isolated reported fees
        aggFunding:
          type: number
          description: Parent-plus-isolated reported funding
    Position:
      type: object
      properties:
        symbol:
          type: string
          description: Market symbol
        size:
          type: number
          description: Position size (negative=short, positive=long)
        price:
          type: number
          description: Volume-weighted average entry price
        fairPrice:
          type: number
          description: Current fair/mark price
        notional:
          type: number
          description: Position notional value
        realizedPnl:
          type: number
          description: Realized profit/loss
        unrealizedPnl:
          type: number
          description: Unrealized profit/loss at current fair price
        leverage:
          type: number
          description: Effective leverage
        liquidationPrice:
          type: number
          description: Estimated liquidation price
        fees:
          type: number
          description: Fees paid on this position
        funding:
          type: number
          description: Funding payments for this position
        maintenanceMargin:
          type: number
          description: Maintenance margin requirement
        averageEntryTime:
          type: integer
          format: int64
          description: Average entry time in nanoseconds.
        lambda:
          type: number
          description: Risk lambda parameter
        riskAllocation:
          type: number
          description: Fraction of portfolio risk allocated
        iso:
          type: boolean
          description: >-
            `true` if this row belongs to a per-instrument isolated account,
            otherwise `false`
        isoPubkey:
          type: string
          nullable: true
          description: >-
            Present only when `iso=true`; base58 pubkey of the per-instrument
            isolated account. Use **only** as `to` in an internal `transfer`
            action to top up isolated-account margin. Isolated-account pubkeys
            are not valid as `account` on transactions and are not valid `user`
            values for `POST /account`.
        protection:
          allOf:
            - $ref: '#/components/schemas/PositionProtection'
          nullable: true
          description: Optional attached reduce-only protective orders for this symbol
    PendingOnFillPlan:
      type: object
      properties:
        parentOrderId:
          type: string
          description: Parent resting order ID that activates these actions on first fill
        actions:
          type: array
          description: Consequent actions executed when parent order first fills
          items:
            type: object
    FeeTierQuote:
      type: object
      properties:
        symbol:
          type: string
          description: Scope symbol (`global` or market symbol)
        rollingVolume:
          type: number
        tierIndex:
          type: integer
          format: int32
        tierThreshold:
          type: number
        makerBps:
          type: number
        takerBps:
          type: number
        windowDays:
          type: integer
          format: int32
    LeverageEntry:
      type: object
      properties:
        symbol:
          type: string
          description: Market symbol
        leverage:
          type: number
          description: Maximum leverage (1.0 to 50.0)
    LockedAmount:
      type: object
      description: Per-transfer or withdrawal margin lock
      properties:
        hash:
          type: string
          description: Transfer or withdrawal action hash (base58)
        symbol:
          type: string
          description: Locked instrument symbol, for example USDC
        amount:
          type: number
          description: Locked amount in instrument units
        lockedAt:
          type: integer
          format: int64
          description: Nanosecond timestamp when margin was locked
    TriggerSpec:
      type: object
      required:
        - px
      properties:
        isAbove:
          type: boolean
          description: Optional trigger direction when encoded; omitted when unavailable
        px:
          type: number
          description: Trigger threshold price
        lim:
          type: number
          description: Optional post-trigger limit price; omitted for market execution
        oco:
          type: string
          description: Optional linked OCO sibling order ID
        pxHi:
          type: number
          description: Optional upper trigger threshold for range/OCO
        limHi:
          type: number
          description: Optional upper post-trigger limit for range/OCO
        trb:
          type: integer
          format: uint32
          description: Trailing distance in bps (trailing orders only)
        stb:
          type: integer
          format: uint32
          description: Favorable reset step in bps (trailing orders only)
    Fill:
      type: object
      description: Trade execution (fill)
      required:
        - tradeId
        - maker
        - taker
        - orderIdMaker
        - orderIdTaker
        - isBuy
        - symbol
        - amount
        - price
        - makerFee
        - takerFee
        - fee
        - reasonCode
        - slot
        - timestamp
        - sequence
        - iso
      properties:
        tradeId:
          type: string
          pattern: ^[0-9]+:[0-9]+$
          maxLength: 41
          example: '34554078:127'
          description: >-
            Opaque network-local execution ID in `<slot>:<event-sequence>` form.
            Maker, taker, and isolated-account views of the same execution share
            this value. Gaps are expected in an individual account's view.
        maker:
          type: string
          description: Maker public key (base58)
        taker:
          type: string
          description: Taker public key (base58)
        orderIdMaker:
          type: string
          description: Maker order ID (base58)
        orderIdTaker:
          type: string
          description: Taker order ID (base58)
        isBuy:
          type: boolean
          description: Queried account side on paginated history
        symbol:
          type: string
        amount:
          type: number
          description: Trade size
        price:
          type: number
          description: Execution price
        makerFee:
          type: number
          description: Maker fee (negative means rebate)
        takerFee:
          type: number
          description: Taker fee (negative means rebate)
        fee:
          type: number
          description: >-
            Effective fee for queried row (`makerFee` for maker row, `takerFee`
            for taker row)
        reasonCode:
          type: integer
          format: int32
          enum:
            - 0
            - 1
            - 2
            - 3
          description: >-
            Fill reason code: `0=normal`, `1=liquidation`, `2=adl`,
            `3=liquidation_sweep`
        reason:
          type: string
          enum:
            - liquidation
            - adl
            - liquidation_sweep
          description: Fill reason label (present only if non-normal)
        counterpartyHint:
          type: string
          description: Short counterparty key hint for the queried user (`xxxx..yyyy`)
        slot:
          type: integer
          format: int64
          description: Slot number
        timestamp:
          type: integer
          format: int64
          description: Execution time (nanoseconds)
        sequence:
          type: integer
          format: int64
          description: Event sequence inside slot
        iso:
          type: boolean
          description: >-
            `true` if this row belongs to a per-instrument isolated account,
            otherwise `false`
        isoPubkey:
          type: string
          nullable: true
          description: Present only when `iso=true`; isolated-lane account pubkey (base58)
    ClosedPosition:
      type: object
      description: Closed position history record
      required:
        - owner
        - symbol
        - quantity
        - maxQuantity
        - totalVolume
        - avgOpenPrice
        - avgClosePrice
        - realizedPnl
        - fees
        - funding
        - openTime
        - closeTime
        - closeReason
        - closeSlot
        - sequence
        - iso
      properties:
        owner:
          type: string
          description: Owner public key (base58)
        symbol:
          type: string
          description: Market symbol
        quantity:
          type: number
          description: Closed position size (signed; long=positive, short=negative)
        maxQuantity:
          type: number
          description: Legacy alias of quantity (kept for backward compatibility)
        totalVolume:
          type: number
          description: Total traded volume over position lifetime
        avgOpenPrice:
          type: number
          description: Volume-weighted average entry price
        avgClosePrice:
          type: number
          description: Volume-weighted average exit price
        realizedPnl:
          type: number
          description: Total realized profit/loss
        fees:
          type: number
          description: Total fees paid
        funding:
          type: number
          description: Total funding payments (positive=received, negative=paid)
        openTime:
          type: integer
          format: int64
          description: Position open timestamp (nanoseconds)
        averageEntryTime:
          type: integer
          format: int64
          description: Average entry time in nanoseconds.
        closeTime:
          type: integer
          format: int64
          description: Position close timestamp (nanoseconds)
        closeReason:
          $ref: '#/components/schemas/CloseReason'
        closeSlot:
          type: integer
          format: int64
          description: Slot in which the position closed
        sequence:
          type: integer
          format: int64
          description: Event sequence inside closeSlot
        iso:
          type: boolean
          description: >-
            `true` if this row belongs to a per-instrument isolated account,
            otherwise `false`
        isoPubkey:
          type: string
          nullable: true
          description: Present only when `iso=true`; isolated-lane account pubkey (base58)
    FundingPayment:
      type: object
      description: Funding payment record
      required:
        - owner
        - symbol
        - size
        - payment
        - fundingRate
        - markPrice
        - slot
        - timestamp
        - sequence
        - iso
      properties:
        owner:
          type: string
          description: Owner public key (base58)
        symbol:
          type: string
          description: Market symbol
        size:
          type: number
          description: Position size at time of funding (positive=long, negative=short)
        payment:
          type: number
          description: Funding payment amount in USD (positive=received, negative=paid)
        fundingRate:
          type: number
          description: Applied funding rate
        markPrice:
          type: number
          description: Fair price at time of funding
        slot:
          type: integer
          format: int64
          description: Slot number when funding was applied
        timestamp:
          type: integer
          format: int64
          description: Timestamp (nanoseconds)
        sequence:
          type: integer
          format: int64
          description: Event sequence inside slot
        iso:
          type: boolean
          description: >-
            `true` if this row belongs to a per-instrument isolated account,
            otherwise `false`
        isoPubkey:
          type: string
          nullable: true
          description: Present only when `iso=true`; isolated-lane account pubkey (base58)
    OrderHistoryEntry:
      type: object
      description: Terminal order history record
      required:
        - orderId
        - symbol
        - side
        - orderType
        - tif
        - price
        - vwap
        - originalSize
        - executedSize
        - reduceOnly
        - status
        - slot
        - timestamp
        - sequence
        - iso
      properties:
        orderId:
          type: string
          description: Order ID (base58)
        symbol:
          type: string
          description: Market symbol
        side:
          type: string
          enum:
            - buy
            - sell
          description: Order side
        orderType:
          type: string
          enum:
            - limit
            - market
            - stop
            - stopLimit
            - takeProfit
            - range
            - trigger
            - trailing
          description: Order type
        tif:
          type: string
          enum:
            - gtc
            - ioc
            - postOnly
            - postOnlySlide
            - postOnlyJoin
          description: Time in force
        price:
          type: number
          description: Order price
        vwap:
          type: number
          description: Volume-weighted average fill price (0 if no fills)
        originalSize:
          type: number
          description: Original order size
        executedSize:
          type: number
          description: Amount filled
        reduceOnly:
          type: boolean
          description: Whether order was reduce-only
        status:
          type: string
          enum:
            - filled
            - partiallyFilled
            - cancelled
            - cancelledRiskLimit
            - cancelledSelfCrossing
            - cancelledReduceOnly
            - cancelledIoc
            - rejectedInvalid
            - rejectedRiskLimit
            - rejectedCrossing
            - rejectedDuplicate
          description: Terminal order status
        trigger:
          allOf:
            - $ref: '#/components/schemas/TriggerSpec'
          nullable: true
          description: Trigger metadata for conditional/trigger orders, otherwise `null`
        reason:
          type: string
          nullable: true
          description: Rejection/cancellation reason (optional)
        slot:
          type: integer
          format: int64
          description: Slot number when order became terminal
        timestamp:
          type: integer
          format: int64
          description: Timestamp (nanoseconds)
        sequence:
          type: integer
          format: int64
          description: Event sequence inside slot
        iso:
          type: boolean
          description: >-
            `true` if this row belongs to a per-instrument isolated account,
            otherwise `false`
        isoPubkey:
          type: string
          nullable: true
          description: Present only when `iso=true`; isolated-lane account pubkey (base58)
    ActivityHistoryEntry:
      type: object
      description: >-
        Account activity history row (transfers, deposits, builder-code fee
        credits)
      required:
        - activityType
        - status
        - from
        - to
        - symbol
        - amount
        - iso
        - slot
        - timestamp
        - sequence
      properties:
        activityType:
          type: string
          enum:
            - transferInternal
            - transferExternal
            - deposit
            - withdrawal
            - builderCode
            - unknown
        status:
          type: string
          enum:
            - completed
            - failed
            - ongoing
            - unknown
        from:
          type: string
          description: Source account pubkey (base58)
        to:
          type: string
          description: Destination account pubkey (base58)
        symbol:
          type: string
          description: Margin asset symbol
        amount:
          type: number
        reason:
          type: string
          nullable: true
          description: Optional failure/details string
        iso:
          type: boolean
          description: '`true` if the row belongs to an implicit isolated-lane owner stream'
        isoPubkey:
          type: string
          nullable: true
          description: Present only when `iso=true`; isolated-lane account pubkey (base58)
        slot:
          type: integer
          format: int64
        timestamp:
          type: integer
          format: int64
          description: Event timestamp (nanoseconds)
        sequence:
          type: integer
          format: int64
    RiskEvent:
      type: object
      description: >-
        Typed liquidation, ADL, or risk-vault row returned by paginated account
        history
      required:
        - owner
        - symbol
        - isBuy
        - amount
        - price
        - eventType
        - iso
        - slot
        - timestamp
        - sequence
      properties:
        owner:
          type: string
          description: Account pubkey on which the event was recorded (base58)
        symbol:
          type: string
        isBuy:
          type: boolean
          description: Queried account side
        amount:
          type: number
        price:
          type: number
        eventType:
          type: string
          enum:
            - liquidation
            - adl
            - risk_vault
        marginPrior:
          type: number
          description: Optional margin balance before the event; omitted when unavailable
        marginAfter:
          type: number
          description: Optional margin balance after the event; omitted when unavailable
        reason:
          type: string
          description: Optional human-readable reason; omitted when unavailable
        iso:
          type: boolean
        isoPubkey:
          type: string
          description: Present only when `iso=true`; isolated-lane account pubkey (base58)
        slot:
          type: integer
          format: int64
        timestamp:
          type: integer
          format: int64
          description: Event timestamp (nanoseconds)
        sequence:
          type: integer
          format: int64
    HistoryErrorBody:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: string
          enum:
            - INVALID_HISTORY_QUERY
            - INVALID_HISTORY_LIMIT
            - INVALID_SLOT_RANGE
            - CURSOR_INVALID
            - ACCOUNT_NOT_FOUND
            - HISTORY_NOT_COVERED
            - CURSOR_EXPIRED
            - HISTORY_STATE_NOT_READY
            - HISTORY_BUSY
            - HISTORY_STORAGE_ERROR
        message:
          type: string
    PositionProtection:
      type: object
      properties:
        orders:
          type: array
          description: Protective order references attached to this position
          items:
            $ref: '#/components/schemas/ProtectionOrderRef'
    CloseReason:
      type: string
      description: Reason for position closure
      enum:
        - normal
        - liquidation
        - adl
        - liquidation_sweep
    ProtectionOrderRef:
      type: object
      properties:
        orderId:
          type: string
          description: Protective order ID (base58)
        orderType:
          type: string
          enum:
            - stop
            - takeProfit
            - range
            - trigger
            - trailing
          description: Conditional root order type
        trigger:
          allOf:
            - $ref: '#/components/schemas/TriggerSpec'
          nullable: true
          description: Conditional trigger metadata for this protective order
  responses:
    HistoryBadRequest:
      description: >-
        Invalid current-state request or malformed history query, limit, slot
        range, or cursor
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/HistoryErrorEnvelope'
    AccountNotFound:
      description: >-
        The current-state account or history scope was not found. History
        requests return the structured error envelope when a JSON body is
        present.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/HistoryErrorEnvelope'
    Timeout:
      description: >-
        Request Timeout - Upstream executor did not respond before the endpoint
        deadline
    HistoryConflict:
      description: Strict coverage cannot satisfy the requested history range
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/HistoryErrorEnvelope'
    HistoryCursorExpired:
      description: >-
        History scope, coverage, backfill, or retention changed after cursor
        issuance
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/HistoryErrorEnvelope'
    AccountUnprocessable:
      description: Unsupported query type or malformed current-state account body
      content:
        text/plain:
          schema:
            type: string
    AccountServerError:
      description: >-
        Current-state request failure or history storage/decoding failure.
        History requests return the structured error envelope when a JSON body
        is present.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/HistoryErrorEnvelope'
    HistoryUnavailable:
      description: History state is not ready or bounded read capacity is saturated
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/HistoryErrorEnvelope'

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.