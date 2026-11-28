# Shadowfax API — what this app uses

Sources (read on 2026-11-26): developer.shadowfax.in (Forward Logistics, Reverse Logistics, Reference pages,
last modified Aug–Nov 2026) and the older Apiary docs (sfxunifiedapi / sfxmarketplace). Where the two differ,
the newer developer portal wins and the difference is noted.

| | Value |
|---|---|
| Staging base URL | `https://dale.staging.shadowfax.in/api` |
| Production base URL | `https://dale.shadowfax.in/api` |
| Auth | `Authorization: Token <token>` (static token from the SFX 360 portal; staging and production tokens differ) |

## Endpoints

| Feature | Method + path | Code |
|---|---|---|
| Serviceability (per leg, per service) | `GET /v1/clients/serviceability/?service=&pincodes=` | `functions/src/shadowfax/serviceability.ts` |
| Book forward order | `POST /v3/clients/orders/` | `shadowfax/forward.ts` `createForwardOrder` |
| Track forward (single) | `GET /v4/clients/orders/{awb}/track/` | `trackForward` |
| Track forward (≤ 50) | `POST /v4/clients/bulk_track/` | `bulkTrackForward` (2-hour sync) |
| Update / NDR (reopen_ndr, rts, rto) | `POST /v3/clients/order_update/` | `updateOrder` |
| Cancel forward | `POST /v3/clients/orders/cancel/` | `cancelForwardOrder` |
| Shipping label (PDF/PRN, valid 2 days, only before pickup) | `POST /client/generate_label/` | `generateLabel` |
| Proof of delivery (≤ 100) | `POST /v1/clients/pod_details/` | `fetchPod` |
| Rate quote (prepaid-wallet clients) | `POST /v1/clients/rate_calculator/` | `rateQuote` |
| Book return pickup | `POST /v1/clients/pickup/orders/` | `shadowfax/reverse.ts` |
| Track return (single) | `GET /v4/clients/requests/{awb}` | `trackReverse` |
| Track returns (≤ 50) | `POST /v4/clients/requests/bulk_query` | `bulkTrackReverse` |
| Cancel return | `POST /v2/clients/requests/mark_cancel` | `cancelReverseOrder` |
| Status callbacks | Shadowfax → `POST /api/shadowfax-webhook` (registered in the SFX 360 portal) | `functions/src/webhook.ts` |

## Behaviour the code relies on

- Forward order creation answers **HTTP 200 even on failure**; the app branches on `message` (`Success` / `Failure`).
  A duplicate `client_order_id` returns `Failure` plus `AWB` of the existing order.
- Reverse creation returns **HTTP 400** with `errors` keyed by field.
- Cancellation answers `{responseMsg, responseCode}`; `responseCode: 304` means "queued for cancellation".
- `order_update` is asynchronous (`"Request accepted."`); pincode changes only intra-city and at most twice.
- 429 `Request Blocked Temporarily` → exponential backoff (writes are only retried on 429, never on 5xx).
- Callback bodies are a per-account template; the parser accepts every documented field name
  (`awb_number`/`awb`, `status_id`/`event`, `event_timestamp`/`last_updated`, …). On reverse callbacks `event`
  is an internal integer, so `status_id`/`status` are used instead. Callbacks are not retried by Shadowfax,
  hence the 2-hourly bulk-tracking sync.
- Weights are sent in **kg** (developer portal). The older Apiary docs said grams.
- Line 2 of the customer address is sent as both `address_line_2` (Apiary, and every response) and `address2`
  (current schema).

## Not available in the API (the app links to https://shadowfax360.in/)

Wallet / balance, invoices / billing, COD remittance, weight disputes, pickup manifests, webhook and API-key
configuration. There is no separate pickup-scheduling endpoint: `pickup_date` / `pickup_slot` go with each
marketplace order.
