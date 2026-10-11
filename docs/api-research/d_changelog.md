> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bulk.trade/llms.txt
> Use this file to discover all available pages before exploring further.

# API Changelog

> API updates and version history

## v1.0.20 (4th October 2026)

<Note>
  **Scheduled upgrade — Sunday, 4 October 2026.** The changes below take effect
  after the upgrade; they are not an announcement that deployment has completed.
  All maintenance times are UTC.
</Note>

### Maintenance Schedule

| Time (UTC) | Availability |
| - | - |
| **12:00–13:00** | Scheduled downtime. Trading will be unavailable; API and WebSocket connections will be interrupted. |
| **13:00–13:30** | Markets reopen in **post-only / reduce-only mode**. Post-only orders or orders that reduce existing positions will be permitted. |
| **13:30** | Normal trading is scheduled to resume, subject to final checks. |

Only resting **ALO / post-only orders will be cleared**. GTC and already-placed
conditional orders remain untouched by the clearing process. Untriggered on-fill
actions attached to a cleared post-only order are removed with that parent order.

After reconnecting, reconcile open orders and refresh account and market-data
snapshots before resuming normal order submission.

### Breaking Changes

#### Market Size Metadata

[`GET /exchangeInfo`](/api-reference/getExchangeInfo) replaces `sizePrecision`
and `lotSize` with `sizeDecimals` and `sizeIncrement`.

Illustrative partial response; read the actual values for each market:

```json theme={null}
[
  {
    "symbol": "BTC-USD",
    "pricePrecision": 1,
    "tickSize": 0.1,
    "sizeDecimals": 8,
    "sizeIncrement": 0.00000001,
    "timeInForces": ["GTC", "IOC", "ALO", "ALO_SLIDE", "ALO_JOIN"]
  }
]
```

`sizeDecimals` is the maximum order-size decimal width, capped at eight wire
decimal places. `sizeIncrement` is the smallest representable quantity step,
not the minimum trade value; `minNotional` remains a separate requirement.

#### Account-Local and Aggregate Margin

Public account responses retain the **`margin` object**. Unprefixed fields
describe the queried account only. Optional `agg*` fields report that account
plus its attached isolated accounts, not separate sub-accounts.

Selected fields from a [`POST /account`](/api-reference/getAccount) response:

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

Do not add local and aggregate values together: the aggregate already includes
the parent. The `agg*` fields are omitted when no isolated owners are attached.
Positions and open orders remain a combined parent-plus-isolated view, with
isolated rows identified by `iso` and `isoPubkey`.

WebSocket account snapshots use the same margin object:

```json theme={null}
{
  "type": "account",
  "data": {
    "type": "accountSnapshot",
    "margin": {
      "totalMargin": 1000.0,
      "marginUsed": 100.0,
      "aggTotalMargin": 1250.0,
      "aggMarginUsed": 125.0
    }
  },
  "topic": "account.FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7"
}
```

These are partial examples. For parents with attached isolated accounts, the
API suppresses incremental parent `marginUpdate` messages; consume account
snapshots for the combined margin view. See
[Account Stream](/api-reference/ws-account) for the complete field reference.

#### Conditional-Order Signing

Update the signing encoder for new conditional orders and batches containing
conditional actions. The new optional slippage fields participate in the
upgraded signing schema even when an override is omitted. An older conditional
encoder is not made compatible merely by leaving those fields out of JSON.

Use the updated SDK signing implementation. This requirement concerns **new
signed submissions**; existing conditional orders are preserved through the
upgrade. See [Transaction Signing](/api-reference/signing).

### New Features

#### ALO Slide and ALO Join

* **`ALO_SLIDE`** moves a crossing post-only order to the nearest non-crossing
  display tick.
* **`ALO_JOIN`** moves a crossing post-only order to the best quote on its own
  side of the book. If no same-side quote exists, it falls back to Slide.

Non-crossing orders retain their tick-aligned submitted price. Both modes
remain subject to the usual risk and order-validity checks.

Use these action objects inside a signed transaction's `actions` array, over
either HTTP or WebSocket:

<CodeGroup>
  ```json ALO Slide theme={null}
  {
    "l": {
      "c": "BTC-USD",
      "b": true,
      "px": 100000.0,
      "sz": 0.1,
      "tif": "ALO_SLIDE",
      "r": false,
      "i": false
    }
  }
  ```

  ```json ALO Join theme={null}
  {
    "l": {
      "c": "BTC-USD",
      "b": true,
      "px": 100000.0,
      "sz": 0.1,
      "tif": "ALO_JOIN",
      "r": false,
      "i": false
    }
  }
  ```
</CodeGroup>

| JSON request TIF | Account/order response TIF | Binary signing enum index |
| - | - | -: |
| `ALO_SLIDE` | `postOnlySlide` | `3` |
| `ALO_JOIN` | `postOnlyJoin` | `4` |

JSON requests use the names, not the numeric indices. Existing signing indices
remain `GTC = 0`, `IOC = 1`, and `ALO = 2`. `GET /exchangeInfo` advertises
uppercase names in `timeInForces`. Read the reported working price rather than
assuming it equals the submitted price.

See [Place & Cancel Orders](/api-reference/placeOrder#alo-slide-and-alo-join)
and [Trading via WebSocket](/api-reference/ws-trading).

#### Configurable Conditional Slippage

Market-executing stop, take-profit, and trailing orders accept optional
`slippage` overrides in basis points. Range orders support independent
`slSlippage` and `tpSlippage` values for their stop-loss and take-profit legs.
When omitted, the applicable market default is used. Explicit limit-executing
legs retain their limit price. Slippage controls do not guarantee a fill.

### Improvements

#### Resting-Order Price Alignment

Orders capable of resting, including GTC and the ALO family, align to the
market's `pricePrecision` / `tickSize`: buys round down and sells round up.
IOC orders retain native fixed-point price precision.

#### Performance and Correctness

* Order-processing performance and efficiency improvements.
* More accurate account, leverage, and isolated-margin reporting.
* Funding and liquidation precision fixes.
* Improved liquidation-related market-data reporting.

***

## v1.0.19 (2nd September 2026)

### Improvements

#### Primary Mainnet Endpoints

New integrations should use the dedicated mainnet endpoints:

```text theme={null}
HTTP: https://mainnet-api1.bulk.trade/api/v1
WebSocket: wss://mainnet-ws1.bulk.trade
```

Testnet continues to use `exchange-api.bulk.trade` and `exchange-ws1.bulk.trade`. Request paths, transaction payloads, subscriptions, and response schemas are unchanged; signed transactions must use the signature domain for the target network.

#### Atomic L2 Delta Batches

Deployed to Mainnet at 20:00 UTC.

The `l2Delta` WebSocket stream now publishes all changed price levels for an
instrument update together in one atomic message. Previously, each changed
price level was published as a separate message.

The subscription topic and JSON schema are unchanged. `levels` remains a
two-element array of `[bids, asks]`, but either side may now contain multiple
changed levels in the same message. Clients should apply the complete message
as one order-book transition before exposing the updated local book.

Clients that are disconnected or fall behind as slow consumers must not
continue applying deltas to a stale book. Reconnect, request a fresh
`l2Snapshot`, rebuild the local book, and then resume `l2Delta` processing.

No API-breaking change is expected for clients that already process every
level in both sides of each delta message.

***

## v1.0.18 (21st August 2026)

### Breaking Changes

#### Risk-Surface Response

Risk REST and WebSocket responses now contain:

* `liveRegime`, identifying the active risk regime
* a `leverage` object with `min`, `max`, `margin_0`, and `margin_half`
* `surfaces[]`, containing every regime's `regime`, `leverage[]`,
  `notionals[]`, `buy[][]`, and `sell[][]`
* the existing correlation data

This replaces the previous WebSocket shape where `regime`, `leverage[]`,
`notionals[]`, `buy[][]`, and `sell[][]` were top-level fields.

### New Features

#### Size-Impact API

[`GET /impact`](/api-reference/getImpact) returns the latest cached size-impact
curve for the requested market. The `market` query parameter is required.

The response contains:

* `symbol`
* millisecond `timestamp`
* `minSize`
* `sellBps` and `buyBps`, each containing `logMin`, `logRange`, and exactly
  250 impact values at log-uniform size knots

The endpoint returns `404` until the first curve is available for that market.

The WebSocket `impact` subscription accepts a market symbol, publishes on
`impact.<symbol>`, sends the cached curve immediately when one is available,
and then sends future updates. It sends no initial event before the first curve
is available.

#### Account Data

* Position snapshots, history rows, and WebSocket position updates may expose
  `averageEntryTime`, the average entry time in nanoseconds.
* Full account snapshots may include `lockedAmounts[]` while a transfer or
  withdrawal is in progress. Each lock contains the action `hash`, `symbol`,
  `amount`, and nanosecond `lockedAt` time. Account WebSockets emit
  `lockedAmountsUpdate`; an empty array means all locks have cleared.

### Improvements

#### Order-Size Corrections

Order responses now report the current remaining quantity after partial fills:

* `working.remainingSz` reports the remaining quantity and is clamped at zero
* `fullAccount.openOrders[].size` and account WebSocket snapshot order `size`
  report signed remaining quantity
* regular and conditional WebSocket `orderUpdate.sz` report signed remaining
  quantity

The original size remains available separately as `originalSize` or `origSz`,
and filled quantity remains available as `filledSz` or `fillSz`.

#### Upgrade Response

During an upgrade, transaction admission may temporarily return `503` with:

```json theme={null}
{
  "error": {
    "code": "UPGRADE_IN_PROGRESS",
    "message": "transaction admission is paused during executor upgrade"
  }
}
```

The response may include `Retry-After`. Clients should retry with bounded
backoff.

***

## v1.0.17 (31st July 2026)

<Warning>
  **Breaking signing change.** Upgrade to a network-domain-aware SDK or client before submitting transactions. Clients using the previous signature preimage will receive a `bad signature` response after the network cutover.
</Warning>

### Breaking Changes

#### Network-Bound Transaction Signatures

Every signed transaction is now bound to one Bulk network:

| Network | Signature domain byte |
| - | -: |
| Mainnet | `1` |
| Testnet | `2` |
| Devnet | `3` |

For raw Ed25519 signing, append the configured byte to the canonical preimage:

```text theme={null}
wincode_serialize(commission_signable_actions)
|| nonce_le_u64
|| account_pubkey_32_bytes
|| signature_domain_u8
```

The domain is trusted client configuration. It is **not** included as a transaction JSON field or supplied through an HTTP or WebSocket header. The receiving network reconstructs the preimage with its configured domain, so a transaction signed for one network is rejected by the others.

Only the signature preimage changes; the transaction JSON shape and order IDs are unchanged.

Offchain/Ledger signing now binds the same domain in two places:

* `app_domain = signature_domain_u8 || 31 zero bytes`
* the clear-sign payload includes `Network: <mainnet|testnet|devnet>` and hashes the domain-bound canonical preimage

See [Transaction Signing](/api-reference/signing) for raw and offchain examples.

#### Trigger and OnFill Actions

Trigger baskets no longer carry a top-level `i` field or append an isolated-routing
byte to the canonical signing payload. Each nested order or conditional action
still carries its own `i`.

OnFill now uses one action with an embedded market or limit order:

```json theme={null}
{
  "of": {
    "trigger": {"l": {"c": "BTC-USD", "b": true, "px": 100000, "sz": 0.1, "tif": "GTC", "r": false, "i": false}},
    "actions": [{"st": {"c": "BTC-USD", "d": false, "sz": 0.1, "tr": 98000, "lim": null, "i": false}}]
  }
}
```

The former parent sequence field is no longer part of the JSON or signing
payload. See [Place & Cancel Orders](/api-reference/placeOrder#on-fill-of).

#### Paginated Account History

The unsigned `POST /account` endpoint now supports bounded pagination for
`fills`, `positions`, `fundingHistory`, `orderHistory`, `activityHistory`, and
`riskHistory`.

```json theme={null}
{
  "type": "fills",
  "user": "...",
  "limit": 500,
  "startSlot": 12000,
  "endSlot": 13000
}
```

`limit` defaults to 5000 and accepts 1–5000. First-page `startSlot` and
`endSlot` bounds are inclusive. Continue with the same `type` and `user`, the
opaque `cursor`, and an optional new `limit`; do not include slot bounds with a
cursor.

Every history response contains typed rows in `data` and frozen traversal,
coverage, and retention metadata in `page`. Rows are ordered newest-first by
slot and server sequence. Use `nextCursor` for continuation rather than
timestamps or payload fields.

A direct physical-account query reads that account's history. A parent query
returns the parent's own rows plus rows assigned to it when an isolated account
event was written. Detaching or reparenting an isolated account does not move
earlier history. See [Query Account](/api-reference/getAccount#history-queries).

### Improvements

#### Account Fill `tradeId`

REST account-fill history and account WebSocket fill updates now expose
`tradeId` as a lossless `"<slot>:<event-sequence>"` string. Maker, taker, and
isolated-account views of the same execution share the same value.

Treat `tradeId` as an opaque, network-local reconciliation key. It is not
portable across forks or networks, and sequence gaps in one account's view are
expected. This field applies to account fill surfaces; it does not add an ID to
the public market-trades stream.

See [Query Account](/api-reference/getAccount#history-queries)
and [Account WebSocket Events](/api-reference/ws-account#fill-update).

***

## v1.0.16 (10th July 2026)

<Note>
  **Client update required.** [`bulk-client`](https://github.com/Bulk-trade/bulk-client) has been bumped to **0.1.2** for builder-code support. Update before exercising the `builderCode`, `abc`, and `rbc` fields below.
</Note>

### New Features

#### Builder Codes (live)

Builder codes are now live on BULK's exchange endpoints for routed-order-flow attribution. A user first approves a builder-code recipient with `abc`, routed `m`/`l` orders may include `builderCode: { "to": "...", "fee": 5 }`, and approval can be revoked with `rbc`.

<Warning>
  `abc` and `rbc` are master-account-only actions. Agent wallets cannot approve or revoke builder-code recipients.
</Warning>

<CodeGroup>
  ```bash HTTP REST theme={null}
  https://mainnet-api1.bulk.trade/api/v1
  ```

  ```bash WebSocket theme={null}
  wss://mainnet-ws1.bulk.trade
  ```
</CodeGroup>

See [Builder Codes](/bulk-exchange/builder-codes), [Place & Cancel Orders](/api-reference/placeOrder#builder-codes), and [Transaction Signing](/api-reference/signing) for payload and signing details.

***

## v1.0.15 (20th May 2026)

<Note>
  **Client updates required.** [`bulk-client`](https://github.com/Bulk-trade/bulk-client) and [`bulk-cli`](https://github.com/Bulk-trade/bulk-cli) have been bumped to **0.1.1** to enable the changes in this release. Update both before exercising the new endpoints / fields below.
</Note>

### New Features

#### Offchain Signing Mode (any transaction shape)

Transactions can now be signed via the **Solana v0 offchain-message envelope** in addition to the default raw canonical-binary path. The signed bytes are the full offchain envelope wrapping a deterministic clear-sign text payload (`Bulk Exchange Transaction`, `Account`, `Nonce`, `Actions`, `Signable-Hash`, plus per-action lines). `format = 0x00` for ASCII payloads and `format = 0x01` for UTF-8.

| Surface | Header | Allowed values |
| - | - | - |
| `POST /order` | `x-bulk-sig-mode` | `raw` \| `offchain` \| `base58` |
| WebSocket handshake | `x-bulk-sig-mode` | `raw` \| `offchain` \| `base58` |

Header is hint only; signature validity still decides accept/reject. See [Offchain Signing Mode](/api-reference/signing#offchain-signing-mode) and [Optional Handshake Headers](/api-reference/ws-connection#optional-handshake-headers).

The legacy compatibility path for **owner-signed `agentWalletCreation`** (signature over `bs58_encode(canonical_binary_message).as_bytes()`) is retained for older wallet UIs.

#### `POST /account` Query Type: `riskHistory`

New unsigned query returning the last 5000 liquidation, ADL, and risk-vault events for a master or sub-account. For master/sub queries, results include both base-account rows and per-instrument isolated-account rows (`iso = true`).

| Field | Description |
| - | - |
| `eventType` | `liquidation`, `adl`, or `risk_vault` |
| `marginPrior` / `marginAfter` | Margin balance snapshot around the event |
| `reason` | Optional human-readable reason (e.g. shortfall, underfill tagging) |

This query now supports bounded pagination through optional `limit`, `cursor`,
`startSlot`, and `endSlot` body fields. See [Query
Account](/api-reference/getAccount#history-queries).

### Improvements

#### `feeTier` Query Response Simplified (Account-Only)

`POST /account` with `type: "feeTier"` now returns just the account fee-tier quote (`scopeInstrument`, `rollingVolume`, `tierIndex`, `tierThreshold`, `makerBps`, `takerBps`, `windowDays`). Global fee-state fields (`globalPolicyActive`, `scopes`, `settledFills`, totals, etc.) live on [`GET /feeState`](/api-reference/getFeeState).

#### `liquidation_sweep` Reason Code

A new `3 = liquidation_sweep` value joins the fill `reasonCode` set (`0 = normal`, `1 = liquidation`, `2 = adl`, `3 = liquidation_sweep`) and the closed-position `closeReason` enum. Affected surfaces:

* Trades stream (`reason` label)
* Account stream fill rows (`reasonCode`)
* `POST /account` `fills` / `positions` history responses

#### ADL Account-Stream Event: `adl` (lowercase) + `reason`

The `data.type` value on the account stream ADL event changed from `"ADL"` to
`"adl"` to match the rest of the stream's casing convention. The liquidation
and ADL events now also carry an optional human-readable `reason` field. The
historical POST form introduced in this release now supports bounded
pagination through `type: "riskHistory"`. See [Query
Account](/api-reference/getAccount#history-queries).

#### `subAccounts[]` on Master Snapshots, `name` on Sub-Account Snapshots

The `subAccounts` array on a master's `fullAccount` snapshot (both HTTP `POST /account` and the WS account stream) returns rows containing only `{pubkey}`. To resolve a sub-account's display name, query/subscribe to that sub-account directly; its snapshot carries a top-level `name` field when `kind: "SubAccount"`.

#### `marginAmount` Must Be JSON Numbers

`createSubAccount.marginAmount` and `transfer.marginAmount` must be unquoted JSON numbers (e.g. `100.0`, not `"100.0"`). Strings are rejected.

***

## v1.0.14 (28th April 2026)

### New Features

#### Sub-Accounts (`createSubAccount`, `removeSubAccount`, `renameSubAccount`)

Master accounts can now create, rename, and remove sub-accounts via the unified `POST /order` endpoint. Sub-accounts are off-curve, protocol-derived accounts under a master with their own margin, positions, and risk profile.

| Action | Description |
| - | - |
| `createSubAccount` | Create a named sub-account, optionally seeded with margin atomically |
| `removeSubAccount` | Remove a flat sub-account (or auto-created isolated account) and sweep margin back to master |
| `renameSubAccount` | Rename an existing sub-account (`{a, n}`); pubkey is preserved |

See [Sub-Accounts API](/api-reference/manageSubAccounts).

#### Native Margin Transfers (`transfer`)

Move margin between accounts directly inside the protocol, with no external bridge or wrapper.

| Kind | Scope |
| - | - |
| `internal` | Master and its sub-accounts, including topping up a per-instrument isolated account via `isoPubkey` |
| `external` | Any account on the network |

External transfers to off-curve addresses that are not protocol accounts are rejected; no implicit account creation.

See [Transfer API](/api-reference/transfer).

#### Isolated Account Routing (`i` flag on `l`, `m`, `st`, `tp`, `rng`, `trig`, `trl`)

Order actions that produce a position now carry a **required** `i` boolean. Setting `i = true` routes the order into a per-instrument **isolated account** (`IsoAccount`) auto-derived from the signing account and the instrument. Isolated-account positions and history rows are flagged with `iso = true` and expose an `isoPubkey` for direct margin top-up via `transfer`. Isolated accounts are torn down via `removeSubAccount` against the isolated-account pubkey.

<Warning>
  `i` is part of the canonical signed binary message. Always include it in the JSON (`true` or `false`); omitting it will produce a `bad signature` error.
</Warning>

See [Isolated Margin](/bulk-exchange/isolated-margin) and [Place & Cancel Orders](/api-reference/placeOrder#isolated-account-routing-i).

#### Trading From a Sub-Account

Every signed action (orders, modify, cancel, conditional baskets, on-fill, transfers, user settings) now works on a sub-account by setting the transaction `account` field to the sub-account pubkey while the master, the sub-account itself, or an [agent wallet](/api-reference/manageAgentWallet) registered on either signs. There is no separate sub-account endpoint or action variant. Agents registered on a master are automatically authorized for that master's sub-accounts; sub-accounts can additionally register their own agents independently.

See [Sub-Accounts: Trading From a Sub-Account](/api-reference/manageSubAccounts#trading-from-a-sub-account).

### Improvements

#### `fullAccount` Top-Level Fields

The full-account snapshot now exposes account hierarchy and authorization state:

| Field | Description |
| - | - |
| `kind` | `MasterEOA` or `SubAccount` (the account kinds that `POST /account` can return) |
| `parent` | Parent master pubkey for sub-accounts, `null` for masters |
| `subAccounts` | List of `{pubkey, name?}` children of a master |
| `authorizedAgentWallets` | Agent wallets registered on this account |

See [Query Account](/api-reference/getAccount).

#### `iso` Flag on Account Rows

Positions, open orders, fills, closed positions, funding payments, and order history rows all carry an `iso` boolean. When `iso=true`, position rows additionally expose `isoPubkey`, the per-instrument isolated account's pubkey. Master/sub `POST /account` history queries return both base-account and per-instrument isolated-account rows. In v1.0.17, `isoPubkey` also became valid as `user` with the paginated history types for direct physical history across that pubkey's account lifecycle. It remains invalid with current-state query types and as transaction `account`.

#### New Response Status Types

`POST /order` now emits dedicated status rows for the new actions:

| Status | Source action |
| - | - |
| `transfer` / `transferFailed` | `transfer` |
| `createSubAccount` / `createSubAccountFailed` | `createSubAccount` |
| `removeSubAccount` / `removeSubAccountFailed` | `removeSubAccount` |
| `renameSubAccount` / `renameSubAccountFailed` | `renameSubAccount` |

See [Place & Cancel Orders](/api-reference/placeOrder) for the full status table.

***

## v1.0.13 (16th April 2026)

### New Features

#### Conditional Order Types (`st`, `tp`, `rng`, `trig`, `trl`, `of`)

Six conditional order types are now fully documented with request/response examples across HTTP and WebSocket:

| Action | Type | Description |
| - | - | - |
| `st` | Stop | Trigger when price crosses against position |
| `tp` | Take Profit | Trigger when price moves in favor |
| `rng` | Range / OCO | Two-leg stop + take-profit pair (one-cancels-other) |
| `trig` | Trigger Basket | Arbitrary nested actions on threshold cross |
| `trl` | Trailing Stop | Stop that follows favorable price movement |
| `of` | On-Fill | One-shot follow-up actions on parent fill |

See [Place & Cancel Orders](/api-reference/placeOrder) and [Trading via WebSocket](/api-reference/ws-trading) for full examples.

#### Conditional Response Statuses

New status types for conditional order lifecycle:

| Status | Description |
| - | - |
| `triggered` | Conditional root fired (non-terminal) |
| `siblingCancelled` | OCO sibling auto-cancelled when other leg fires |
| `triggerFailed` | Trigger execution failed (e.g. no counterparty) |
| `depositFailed` | Faucet deposit failed |
| `agentWalletFailed` | Agent wallet operation failed |

### Breaking Changes

<Warning>
  These changes affect response parsing.
</Warning>

#### Signed Sizes in Order Responses

Size fields in order responses are now **signed**: negative values indicate sell-side intent.

Affected fields:

* `totalSz` in `filled` / `partiallyFilled` statuses
* `filledSz` / `remainingSz` in `working` status
* `filledSz` in `cancelledIoc` status
* `origSz` / `sz` in WebSocket `orderUpdate` messages

**Example:**

```json theme={null}
{"filled": {"oid": "...", "totalSz": -0.1, "avgPx": 100025.5}}
```

A `totalSz` of `-0.1` means 0.1 BTC was sold. Previously all sizes were positive with direction inferred from `isBuy`.

#### WebSocket `orderUpdate` Compact Format

The `orderUpdate` message uses compact field names and includes trigger metadata for conditional orders:

| Old Field | New Field |
| - | - |
| `symbol` | `sym` |
| `orderId` | `oid` |
| `originalSize` | `origSz` |
| `size` | `sz` |
| `filledSize` | `fillSz` |
| `isBuy` | *(removed; use signed `origSz`)* |

New fields: `ot` (order type), `mk` (maker flag), `trigger` (trigger metadata object with `isAbove`, `px`, `lim`, `oco`, `pxHi`, `limHi`, `trb`, `stb`), `pendingOnFill`.

See [Account Stream](/api-reference/ws-account) for the full `orderUpdate` reference.

***

## v1.0.12 (March 2026)

### Breaking Changes

<Warning>
  These changes require updates to your integration.
</Warning>

#### Unified Transaction Envelope (POST /order and WebSocket trading)

All signed requests now use a single envelope. The previous nested `action` / `orders` structure is no longer used.

**Before:**

```json theme={null}
{
  "action": {
    "type": "order",
    "orders": [...],
    "nonce": 1704067200000000000
  },
  "account": "...",
  "signer": "...",
  "signature": "..."
}
```

**After:**

```json theme={null}
{
  "actions": [{"l": {"c": "BTC-USD", "b": true, "px": 100000.0, "sz": 0.1, "tif": "GTC", "r": false}}],
  "nonce": 1704067200000000000,
  "account": "...",
  "signer": "...",
  "signature": "..."
}
```

**Action tags:** `l` (limit), `m` (market), `mod` (modify), `cx` (cancel one), `cxa` (cancel all). Other actions (faucet, updateUserSettings, agentWalletCreation) use the same envelope.

Affected: `POST /order`, WebSocket `post` requests for trading.

#### Signed Message Format (signer excluded)

The bytes that get signed no longer include the signer public key.

**Message to sign:**

```
bincode_serialize(actions) + nonce_le_u64 + account_pubkey_bytes
```

**Do not include** `signer` or `signature` in the signed message. `signer` remains in the JSON payload for authorization.

See [Transaction Signing](/api-reference/signing) for the full specification.

#### WebSocket: Ping-Pong Keepalive Required

The server sends a WebSocket **ping** frame every **30 seconds**. The client **must** reply with a **pong** frame. If no pong is received within **10 seconds**, the server closes the connection.

Ping and pong are transport-level WebSocket frames, not JSON application messages. Clients that do not respond to ping will be disconnected.

#### WebSocket: Risk Metrics Stream Structure

The risk stream payload has changed to the **asset risk** format.

**New structure:**

* `leverage` - Knot list (e.g. 1.0 … 50.0)
* `notionals` - Notional knot points
* `buy` / `sell` - 2D arrays indexed by `[notional_idx][leverage_idx]`, each cell `{ mmrO, mmrE, p }`
* `corrs` - Array of `[pair, correlation]`
* `regime` - Integer -12 to 12

Previous power-law style fields (`lambdaBuy`, `lambdaSell`, `buyCoefA/B`, `sellCoefA/B`) are no longer used.

#### POST /account: fullAccount Response Shape

The `fullAccount` response now returns:

* `margin` - Object with `totalBalance`, `availableBalance`, `marginUsed`, `notional`, `realizedPnl`, `unrealizedPnl`, `fees`, `funding`
* `positions` - Array with full position fields (e.g. `fairPrice`, `notional`, `liquidationPrice`, `maintenanceMargin`, `lambda`, `riskAllocation`, `allocMargin`)
* `openOrders` - Array of order state objects
* `leverageSettings` - Array of `{ symbol, leverage }`

Previous `marginSummary` / `settings.maxLeverage` shape is no longer used. Response body is an array of single-key objects (e.g. `[{ "fullAccount": { ... } }]`).

***

### New Features

#### GET /stats (Market Data)

New endpoint for exchange statistics.

**Endpoint:** `GET /stats`

**Query parameters:** `period` (1d, 7d, 30d, 90d, 1y, all), `symbol` (optional filter)

Returns aggregate volume, open interest, funding rates, and per-market stats. See [Get Exchange Statistics](/api-reference/getStats).

#### Deterministic Order IDs

Order IDs are derived from the transaction (action, account, nonce, action index). No client order ID is required. You can compute the order ID before or after sending; use [bulk-keychain](https://github.com/Bulk-trade/bulk-keychain) (Node, browser, Python, Rust) to compute them. See [Order IDs](/api-reference/orderIds).

#### WebSocket Ticker: Regime and Fair Price Fields

Ticker stream now includes:

| Field | Description |
| - | - |
| `regime` | Market regime indicator |
| `regimeDt` | Regime duration (10s intervals) |
| `regimeVol` | Regime-adjusted volatility |
| `regimeMv` | Regime mean value |
| `fairBookPx` | Fair price from order book |
| `fairVol` | Fair volatility estimate |
| `fairBias` | Fair price bias |

Timestamp is in nanoseconds.

#### WebSocket Candles: Additional Intervals

Candle stream supports additional intervals: `3m`, `30m`, `2h`, `6h`, `8h`, `12h`, `3d`, `1w`, `1M`.

#### WebSocket Trades: reason Field

Trade messages may include optional `reason` when not a normal trade: e.g. `"liquidation"`, `"adl"`.

#### WebSocket Account Stream: allocMargin and New Events

* **Position field:** `allocMargin` (allocated margin for the position) added to snapshot and position updates.
* **New event types:** `liquidation`, `ADL`, `cancelOneRejected`, `cancelAllRejected` with full payloads. See [Account stream](/api-reference/ws-account).

Legacy `order` messages with `status: "placed"` or `"cancelled"` may still be sent; new integrations should use `orderUpdate` only.

#### WebSocket Trading: deposit and agentWallet Status Types

Response status types for faucet and agent-wallet flows: `deposit`, `agentWallet`.

#### Official Signing Library: bulk-keychain

[bulk-keychain](https://github.com/Bulk-trade/bulk-keychain) is the official signing library for Node.js, browser (WASM), Python, and Rust. It produces the correct canonical encoding and supports order ID computation. See [Transaction Signing](/api-reference/signing) and [Order IDs](/api-reference/orderIds).

***

### Improvements

#### Wincode and Bincode Compatibility

On the wire, wincode and bincode are the same (bincode-compatible encoding). See [wincode](https://docs.rs/wincode/latest/wincode/) for the Rust crate.

#### POST /account: Open Orders and Fills Response Examples

At the time, documentation added response examples and field descriptions for
the `openOrders` and `fills` query types. `fills` now returns a paginated
`{data, page}` object; `openOrders` retains its existing array shape.

***

## v1.0.11 (January 2026)

### Breaking Changes

<Warning>
  This is a **critical signing update**. Existing signing implementations must be updated.
</Warning>

#### Signing Implementation Update (wincode format)

The transaction signing has been updated with the correct **wincode** serialization format:

**Key Changes:**

* Action types now use **u32 enum discriminants** (not length-prefixed strings)
* Order items (`order`, `cancel`, `cancelAll`) use u32 discriminants
* Pubkeys and Hashes are serialized as **raw 32 bytes** (decoded from base58)
* Added support for `cloid` (client order ID) as `Option<Hash>`
* Faucet user field is now raw 32-byte pubkey (not string)

**Action Discriminants:**

```typescript theme={null}
const ACTION_CODES = {
  order: 0,
  oracle: 1,
  faucet: 2,
  updateUserSettings: 3,
  agentWalletCreation: 4,
};
```

**Order Item Discriminants:**

```typescript theme={null}
const ORDER_ITEM_CODES = {
  order: 0,
  cancel: 1,
  cancelAll: 2,
};
```

See [Transaction Signing](/api-reference/signing) for the complete implementation with binary layout reference.

***

## v1.0.10 (January 2026)

### Breaking Changes

<Warning>
  These changes require updates to your integration.
</Warning>

#### Nonce Requirement for Signed Transactions

All signed transactions now require a `nonce` field (u64) for replay protection.

**Before:**

```json theme={null}
{
  "action": {
    "type": "order",
    "orders": [...]
  },
  "account": "...",
  "signer": "...",
  "signature": "..."
}
```

**After:**

```json theme={null}
{
  "action": {
    "type": "order",
    "orders": [...],
    "nonce": 1704067200000000000
  },
  "account": "...",
  "signer": "...",
  "signature": "..."
}
```

**Recommendation:** Use nanosecond timestamps: `BigInt(Date.now()) * 1_000_000n`

Affected endpoints:

* `POST /order` - Place/cancel orders
* `POST /agent-wallet` - Manage agent wallets
* `POST /user-settings` - Update user settings
* `POST /private/faucet` - Request testnet funds

***

### New Features

#### WebSocket: Subscription Response Format

Subscription confirmations now return topic strings instead of numeric IDs.

**New Format:**

```json theme={null}
{
  "type": "subscriptionResponse",
  "topics": ["ticker.BTC-USD", "trades.BTC-USD"]
}
```

#### WebSocket: Unsubscription via Topic String

```json theme={null}
{
  "method": "unsubscribe",
  "topic": "ticker.BTC-USD"
}
```

#### WebSocket: Batched Account Subscriptions

Subscribe to multiple accounts in a single request:

```json theme={null}
{
  "method": "subscribe",
  "subscription": [{
    "type": "account",
    "user": ["pubkey1", "pubkey2", "pubkey3"]
  }]
}
```

#### WebSocket: Unified `orderUpdate` Message

All order state changes now use a single `orderUpdate` message type with comprehensive state information.

```json theme={null}
{
  "type": "account",
  "data": {
    "type": "orderUpdate",
    "status": "filled",
    "symbol": "BTC-USD",
    "orderId": "...",
    "price": 100000.0,
    "originalSize": 0.1,
    "size": 0.0,
    "filledSize": 0.1,
    "vwap": 100025.5,
    "isBuy": true,
    "maker": false,
    "timestamp": 1763316177219383423,
    "reason": null
  },
  "topic": "account.pubkey"
}
```

#### Account Query: New Query Types

Three history query types were added to `POST /account` in this release. They
now accept optional pagination and inclusive slot-bound body fields:

* `positions` - Closed position history (last 5000)
* `fundingHistory` - Funding payment history (last 5000)
* `orderHistory` - Terminal order history (last 5000)

```json theme={null}
{"type": "positions", "user": "..."}
{"type": "fundingHistory", "user": "..."}
{"type": "orderHistory", "user": "..."}
```

#### WebSocket: Frontend Context Stream

New stream for aggregated market data across all symbols:

```json theme={null}
{
  "method": "subscribe",
  "subscription": [{"type": "frontendContext"}]
}
```

Returns summary data for all markets every 2 seconds.

#### WebSocket: Risk Metrics Stream

Subscribe to coin-based risk metrics:

```json theme={null}
{
  "method": "subscribe",
  "subscription": [{
    "type": "risk",
    "symbol": "BTC-USD"
  }]
}
```

***

### Improvements

#### Expanded Order Status Types

Added granular status types for better order tracking:

| Status | Description |
| - | - |
| `placed` | Order placed and resting on book |
| `working` | Partial fills, still resting |
| `filled` | Fully filled |
| `partiallyFilled` | Partially filled and terminal |
| `cancelled` | Cancelled by user |
| `cancelledRiskLimit` | Cancelled - risk limit exceeded |
| `cancelledSelfCrossing` | Cancelled - self-trade prevention |
| `cancelledReduceOnly` | Cancelled - would increase position |
| `cancelledIOC` | IOC expired without full fill |
| `rejectedCrossing` | Post-only rejected for crossing |
| `rejectedDuplicate` | Duplicate order ID |
| `rejectedRiskLimit` | Rejected - risk limit on submission |
| `rejectedInvalid` | Invalid order parameters |

#### L2 Delta Stream Behavior

L2 Delta provides an initial snapshot (latest cached book state) on subscription, followed by real-time delta updates for every price level change.

#### Enhanced Account Snapshot

Account snapshot now includes additional fields:

* `originalSize` - Original order size
* `vwap` - Volume-weighted average fill price
* `maker` - Maker/taker indicator
* `reduceOnly` - Reduce-only flag
* `tif` - Time in force

***

## Migration Guide

### 1. Add Nonce to Signed Transactions

```typescript theme={null}
const nonce = BigInt(Date.now()) * 1_000_000n;

const action = {
  type: "order",
  orders: [...],
  nonce: nonce  // Required
};
```

Update your bincode serialization to include nonce.

### 2. Update WebSocket Subscription Handling

```javascript theme={null}
// Old way (deprecated)
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.channel === 'subscriptionResponse') {
    // Handle numeric IDs
  }
});

// New way
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'subscriptionResponse') {
    console.log('Subscribed to:', msg.topics);
  }
});
```

### 3. Handle New Order Status Types

```javascript theme={null}
switch(orderUpdate.status) {
  case 'placed':
  case 'working':
    // Non-terminal - order is active
    break;
  case 'filled':
  case 'partiallyFilled':
  case 'cancelled':
  case 'cancelledRiskLimit':
  case 'cancelledSelfCrossing':
  case 'cancelledReduceOnly':
  case 'cancelledIOC':
  case 'rejectedCrossing':
  case 'rejectedDuplicate':
  case 'rejectedRiskLimit':
  case 'rejectedInvalid':
    // Terminal - order is complete
    break;
}
```

***

## Previous Versions

### v1.0.0

* Initial public API release
* HTTP REST API
* WebSocket streaming
* Ed25519 transaction signing


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.