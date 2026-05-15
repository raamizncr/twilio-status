# A2P Visibility Dashboard — Handover Guide

A read-only dashboard that surfaces the **current state of your A2P 10DLC registrations** across Twilio (and optionally Telnyx), in one place, so you don't have to log into each provider's console and click through every subaccount.

If you've never seen this project before, this guide is everything you need to run it, change it, and reason about what it shows.

---

## 1. What this tool is, in one paragraph

US carriers require every business that sends SMS to consumers to register the **brand** (who is sending) and each **campaign** (what kind of message — marketing, OTP, customer care, etc.) through a system called **A2P 10DLC**. Both Twilio and Telnyx expose APIs that report the status of those registrations, but the data is split across three or four different endpoints per subaccount, and a Twilio parent account with many subaccounts can have hundreds of in-flight items. This dashboard pulls it all into one screen, classifies every record as either **Operational**, **Pipeline (in flight)**, or **Rejected/Failed**, and shows the underlying reason text when the API gives one.

It is **read-only**. It does not submit profiles, register brands, or fix anything — it just shows you where each item stands so you know what to act on.

---

## 2. Why it exists (the use case)

A typical pain point this solves:

- You manage a Twilio parent account with 50+ subaccounts (e.g. an ISV / agency setup).
- Each subaccount may have a Trust Hub customer profile, one or more A2P brand registrations, and one or more 10DLC campaigns attached to messaging services.
- The Twilio Console only shows one subaccount at a time. To find "which campaigns are stuck in PENDING for more than a week" or "which brand registrations were rejected and why," you'd have to click through each one.
- This dashboard lists every subaccount, expands its profiles → brands → campaigns, surfaces failure reasons inline, and groups what's still moving (pipeline) vs. what's blocked (rejections).

The Telnyx side is the same story for tenants that send through Telnyx 10DLC instead of (or in addition to) Twilio.

---

## 3. Architecture at a glance

```
┌─────────────────────┐     /api/visibility?provider=…     ┌──────────────────────┐
│  React SPA (Vite)   │ ─────────────────────────────────▶ │  Express API         │
│  client/src/App.tsx │                                    │  server/app.ts       │
└─────────────────────┘ ◀───────────────────────────────── └──────────┬───────────┘
                                JSON payload                          │
                                                                      │ Basic / Bearer auth
                                                                      ▼
                                                         ┌────────────────────────┐
                                                         │ Twilio + Telnyx REST   │
                                                         │ (A2P / Trust Hub /     │
                                                         │  10DLC endpoints)      │
                                                         └────────────────────────┘
```

- **Frontend**: a single-page React app built with Vite. One file does almost everything: `client/src/App.tsx`. It fetches `/api/visibility?provider=twilio` (or `telnyx`), renders a tree of cards, supports light/dark themes, and lets you search/filter.
- **Backend**: a thin Express app (`server/app.ts`) with two routes:
  - `GET /api/health` — heartbeat
  - `GET /api/visibility?provider=twilio|telnyx` — the only real endpoint
- **Two deployment shapes** share the same `createApp()` factory:
  - **Local dev / self-hosted**: `server/index.ts` runs Express on `PORT` (default 3001) and also serves the built client from `client/dist`.
  - **Vercel**: `api/index.ts` exports the same Express app as a serverless function. `vercel.json` rewrites `/api/*` to that function and serves the static client from `client/dist`.
- **No database, no queue, no auth.** The server is stateless except for an in-memory response cache (default 3 minutes).

---

## 4. Repository layout

```
twilio-status/
├── api/
│   └── index.ts            # Vercel entry — re-exports createApp() from built dist/
├── server/
│   ├── index.ts            # Local entry — boots Express + serves client/dist
│   ├── app.ts              # createApp(): defines routes + caching
│   └── lib/
│       ├── http.ts                 # fetchJson, fetchJsonOptional, basicAuthHeader
│       ├── status-labels.ts        # Maps API status codes → human strings
│       ├── twilio.ts               # Main Twilio aggregator (subaccounts → profiles → brands → campaigns)
│       ├── twilio-rejection.ts     # Pulls failure_reason / errors into "Rejected" items
│       ├── twilio-pipeline.ts      # Classifies in-flight items into pipeline phases
│       └── telnyx.ts               # Telnyx 10DLC brand + campaign listing
├── client/
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx              # React root
│       ├── App.tsx               # All UI: provider toggle, theme, Twilio + Telnyx views
│       ├── RawDataPanel.tsx      # Collapsible "raw API JSON" inspector
│       ├── rawDisplay.ts         # Helpers to render raw payloads readably
│       └── index.css             # All styles
├── scripts/
│   └── push-github-pat.sh        # One-off helper for pushing via PAT
├── package.json
├── tsconfig.server.json
├── vercel.json
├── .env.example                  # Copy to .env and fill in
└── A2P (3).json, A2P.png         # n8n workflow + diagram (reference, not used at runtime)
```

The two top-level binary files (`A2P (3).json`, `A2P.png`) are exports of an n8n workflow / architecture diagram from earlier exploration. They are **not used at runtime** and are ignored from future commits via `.gitignore` (`A2P*.json`).

---

## 5. Running it locally

### Prerequisites
- Node.js 18+ (uses native `fetch`).
- A Twilio parent **Account SID** + **Auth Token** with permission to list subaccounts and read Trust Hub / Messaging resources.
- (Optional) A Telnyx **API key** if you also want to view Telnyx tenants.

### Steps

```bash
cp .env.example .env
# edit .env — fill TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and (optionally) TELNYX_API_KEY
npm install
npm run dev
```

`npm run dev` uses `concurrently` to run two processes:

| Script           | What it does                                                  |
| ---------------- | ------------------------------------------------------------- |
| `dev:server`     | `tsx watch server/index.ts` — Express on `http://localhost:3001` |
| `dev:client`     | `vite` — React dev server, proxies `/api/*` to `:3001`        |

Open the URL Vite prints (usually `http://localhost:5173`). Switch the provider toggle, click **Refresh data**, and the dashboard fetches from the live APIs.

### Build for production

```bash
npm run build      # builds server (tsc) → dist/  AND client (vite) → client/dist/
npm start          # node dist/index.js — serves both API and built client on PORT
```

### Deploy to Vercel

The repo is already wired for Vercel:
- `vercel.json` sets `outputDirectory: client/dist` and routes `/api/*` to `api/index.ts`.
- `api/index.ts` imports the **already-built** `dist/app.js`, so the build step (`npm run build`) must produce `dist/` before Vercel cold-starts the function.
- Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and optionally `TELNYX_API_KEY` in the Vercel project's Environment Variables.

---

## 6. Configuration reference (`.env`)

| Variable                          | Required | Default   | Purpose                                                                 |
| --------------------------------- | -------- | --------- | ----------------------------------------------------------------------- |
| `TWILIO_ACCOUNT_SID`              | for Twilio view | —    | Parent Account SID. Used to list subaccounts.                          |
| `TWILIO_AUTH_TOKEN`               | for Twilio view | —    | Parent token. Also used as fallback per-subaccount Basic-auth password. |
| `TELNYX_API_KEY`                  | for Telnyx view | —    | Single-tenant Telnyx API key (Bearer token).                            |
| `TELNYX_API_KEYS`                 | optional | —         | Comma-separated keys for **multiple Telnyx tenants** in one dashboard.  |
| `TELNYX_TENANT_LABELS`            | optional | `Tenant N`| Comma-separated labels (same count as `TELNYX_API_KEYS`).               |
| `PORT`                            | optional | `3001`    | Local server port.                                                      |
| `VISIBILITY_CACHE_TTL_MS`         | optional | `180000`  | In-memory cache TTL for `/api/visibility` responses. `0` disables.      |
| `TWILIO_SUBACCOUNT_CONCURRENCY`   | optional | `8`       | How many subaccounts to process in parallel. Lower if rate-limited.     |
| `TWILIO_SKIP_BRAND_DETAIL_FETCH`  | optional | `0`       | If `1`, skip the per-brand GET. Faster but a few fields may be missing. |

`TELNYX_PUBLIC_KEY` is mentioned in `.env.example` but **not used** by this app — it would only matter if you were verifying inbound Telnyx webhooks.

---

## 7. The data pipeline (Twilio)

This is the core of the project. Understand this section and you understand the codebase.

### 7.1 The hierarchy

Twilio's A2P data is structured as:

```
Parent Account
└── Subaccount (one per customer / tenant)
    ├── Customer Profile  (Trust Hub bundle, BU…)
    │   └── A2P Brand Registration (BN…)
    │       └── 10DLC Campaign / Usa2p compliance record (QE…)
    │           ↑ attached to a Messaging Service (MG…)
```

A subaccount might also have **orphan campaigns** — Usa2p records that don't list a `brand_registration_sid` we recognise. The dashboard shows those in a separate group so they aren't lost.

### 7.2 What `buildTwilioVisibility()` does

Defined in `server/lib/twilio.ts:446`. The flow:

1. **`listSubaccounts(parentSid, parentToken)`** — `GET /2010-04-01/Accounts.json`, paginated. Filters to only rows where `owner_account_sid === parentSid` (or `type === "Subaccount"`). The parent account itself is skipped.
2. **`runPool(subs, concurrency, processSubaccount)`** — runs up to `TWILIO_SUBACCOUNT_CONCURRENCY` subaccounts in parallel. The pool is hand-rolled (no external dep).
3. For each subaccount, `processSubaccount` does (in roughly this order):
   - **Auth choice**: if the Accounts list returned a per-subaccount `auth_token`, use it; otherwise fall back to the parent token. Both work for Basic auth as that subaccount.
   - **List Customer Profile SIDs** for the subaccount: `GET /v1/CustomerProfiles` on `trusthub.twilio.com`.
   - **List Messaging Services** and, for each that has a `links.us_app_to_person`, **list its Usa2p compliance records**: `GET /v1/Services/{MG…}/Compliance/Usa2p`. The response wraps the array as `{ compliance: [...], meta }`. Each record has `brand_registration_sid` (which brand it's tied to) and `campaign_status`. Records are bucketed into `campaignsByBrand` keyed by brand SID.
   - For each Customer Profile, **GET the profile** for full status, then **list Brand Registrations** filtered by `CustomerProfileBundleSid={profileSid}`. The list endpoint sometimes returns brands that don't actually belong to the queried profile, so `brandBelongsToCustomerProfile` re-checks `customer_profile_bundle_sid` on the detail. If `TWILIO_SKIP_BRAND_DETAIL_FETCH` is unset, each brand is also fetched individually for full fields.
   - Brands are paired with their campaigns from `campaignsByBrand`. Anything left over in `campaignsByBrand` after all profiles are processed is added to `orphanCampaigns`.
   - Finally, two derived views are built:
     - `rejectionItems = buildRejectionItems(row)` — see §7.3
     - `pipelineItems = buildPipelineItems(row)` — see §7.4

### 7.3 Rejection items (`server/lib/twilio-rejection.ts`)

Walks the assembled tree and emits a flat list of every **failed/rejected** profile, brand, or campaign, with the most useful human-readable reasons we can find. `collectReasonsFromRaw` looks for, in order:

- `failure_reason` / `failureReason` / `rejection_reason` / `rejectionReason` (string)
- `errors[]` — an array of strings or objects with `message` / `description` / `error_message` / `more_info` / `log` and `code`
- `error.message` / `error.detail`

If none of those exist, a fallback line points the user to the relevant Twilio Console screen (e.g. "open Trust Hub → Customer profiles in Twilio Console").

A profile counts as rejected when `status === "twilio-rejected"`. A brand counts when `status === "FAILED"`. A campaign counts when `campaign_status` is `FAILED` or `SUSPENDED`.

### 7.4 Pipeline items (`server/lib/twilio-pipeline.ts`)

Same idea, but for things still **moving through the funnel** (excludes failures and verified):

| Phase                  | Triggered by                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `draft`                | profile `status === "draft"`                                       |
| `pending`              | profile `pending-review` OR brand `PENDING`                        |
| `in_review`            | profile `in-review` OR brand `IN_REVIEW`                           |
| `verification_pending` | campaign `PENDING`                                                 |
| `in_progress`          | campaign `IN_PROGRESS`                                             |

Items are sorted by phase, then by scope (profile → brand → campaign), so the UI shows the earliest-stage things first.

### 7.5 Status label mapping

`server/lib/status-labels.ts` is a pure lookup table that converts API codes to dashboard text:

- `profileStatusLabel("twilio-approved")` → `"Approved — ready for brand registration"`
- `brandStatusLabel("PENDING")` → `"Awaiting approval"`
- `campaignStatusLabel("VERIFIED")` → `"Verified / active"`
- `twilioOverallStatus(profile, brand, campaign)` → a single rolled-up label like `"Operational"`, `"Brand pending"`, `"Profile pending"`, `"Incomplete"`, used as the headline badge.

Unknown statuses pass through as-is, so adding a new code Twilio invents tomorrow won't crash the UI — it just won't be prettified until you add it to the table.

---

## 8. The data pipeline (Telnyx)

`server/lib/telnyx.ts` is much shorter because Telnyx exposes a flat 10DLC namespace with no subaccount tree:

1. `parseTelnyxApiKeys()` reads `TELNYX_API_KEYS` (comma-separated) or falls back to a single `TELNYX_API_KEY`. Each key becomes a "tenant" row.
2. For each tenant, `listAllBrands` paginates `GET /v2/10dlc/brand?recordsPerPage=100&page=N` until empty. The response uses `records` + `totalRecords` (not `data`).
3. For each brand, `listCampaignsForBrand` paginates `GET /v2/10dlc/campaign?brandId=…`.
4. Statuses come from `status` (brand) and `campaignStatus` / `submissionStatus` / `status` (campaign). Telnyx's status labels currently pass through unchanged — see `telnyxBrandStatusLabel` etc. in `status-labels.ts`.

There is no rejection/pipeline derivation on the server for Telnyx — the client (`telnyxPipelineItemsForTenant` in `App.tsx`) does that classification at render time.

---

## 9. The HTTP layer (`server/lib/http.ts`)

Three small helpers everyone in `lib/` uses:

- `basicAuthHeader(sid, token)` — builds `"Basic base64(sid:token)"`. Twilio uses Basic auth; the SID is the username, the auth token is the password.
- `fetchJson<T>(url, init)` — wraps `fetch`, sets `Accept: application/json`, throws on non-2xx with the first 500 chars of the response body in the error message (helpful when Twilio returns a useful error JSON).
- `fetchJsonOptional<T>(url, init)` — same, but returns `null` on `404`. Used for Usa2p records, since some services don't have any.

**No retries, no exponential backoff.** If a subaccount fails partway, its error is captured into `row.error` in `processSubaccount` and the rest of the dashboard still renders. The caller does not retry.

---

## 10. The UI (`client/src/App.tsx`)

It's one big file (~700 lines). The shape:

| Component / function          | Role                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `App()`                        | Top-level. Owns `provider`, `theme`, `loading`, `error`, `payload`, `search`. Fetches `/api/visibility` on provider change or refresh. |
| `useTheme()`                   | Persists light/dark to `localStorage` under key `a2p-theme`.          |
| `badgeClass(status)`           | Maps any status string to one of `ok` / `bad` / `pending` / `neutral` for CSS. |
| `TwilioView`                   | Renders the Twilio payload: per-subaccount cards with metrics, rejection summary, pipeline summary, and a tree of profile → brand → campaign cards. |
| `TwilioCampaignCard`           | Single campaign row with status badge and (if failed) the parsed error messages. |
| `RejectionSummaryBlock` / `PipelineSummaryBlock` | Render the flat lists `buildRejectionItems` / `buildPipelineItems` produced. |
| `TelnyxView`                   | Same idea for Telnyx tenants → brands → campaigns. Pipeline classification happens here client-side via `telnyxPipelineItemsForTenant`. |
| `RawDataPanel` (separate file) | A `<details>`-style collapsible that shows the raw API JSON for any item, useful for debugging. |

The search box does a simple lowercase substring filter against subaccount/tenant/brand display fields.

There is no React Router, no global state library, no data-fetching library — just `useState` + `fetch`.

---

## 11. Caching

`server/app.ts` keeps an in-process `Map<string, { at, body }>`. Keys are `visibility:twilio` and `visibility:telnyx`. TTL is `VISIBILITY_CACHE_TTL_MS` (default 3 minutes).

Implications:
- Hitting **Refresh data** in the UI within the TTL returns the cached result; the upstream APIs are not called again.
- On Vercel, each serverless function instance has its own cache, so the cache hit rate is lower than locally. That's fine — the goal is to dampen accidental rapid clicks, not to be a real cache.
- To force a real refetch, set `VISIBILITY_CACHE_TTL_MS=0` or restart the server.

---

## 12. Common changes a future maintainer will probably need

- **A new Twilio status code lands** (e.g. Twilio adds `IN_APPEAL`). It already renders raw, but to give it a friendly label and put it in pipeline/rejection lists, edit `status-labels.ts` and add the case to `twilio-pipeline.ts` or `twilio-rejection.ts`.
- **More tenants on Telnyx**: add another comma-separated key to `TELNYX_API_KEYS` and a matching label to `TELNYX_TENANT_LABELS`. No code change needed.
- **Twilio rate-limits you**: lower `TWILIO_SUBACCOUNT_CONCURRENCY` (e.g. to `4` or `2`). The pool in `runPool` will respect it.
- **The list endpoint is enough, skip per-brand GET**: set `TWILIO_SKIP_BRAND_DETAIL_FETCH=1`. Faster cold loads with a slight loss of fields.
- **Add a new provider** (e.g. Bandwidth): create `server/lib/bandwidth.ts` with a `buildBandwidthVisibility()` function returning a similarly-shaped payload, branch in `app.ts` like the existing two, then add a `BandwidthView` to `App.tsx` and a third button in the provider toggle.
- **Surface a new field per brand in the UI**: it's already in `raw` — open a `RawDataPanel` to confirm the JSON path, then add a render line in the brand card inside `TwilioView`.

---

## 13. What this tool does **not** do (and won't)

- It doesn't write to Twilio or Telnyx. No POSTs, no PATCHes.
- It has no users, no auth on the dashboard. Anyone who can reach the URL sees everything. **Do not deploy it publicly without putting auth in front** (e.g. Vercel password protection, Cloudflare Access, a reverse proxy).
- It doesn't notify anyone. No emails, no Slack, no schedule. Refresh = on demand.
- It doesn't persist history. You can't see "what was the brand status a week ago" — only the live snapshot.
- It doesn't verify Telnyx webhook signatures. The `TELNYX_PUBLIC_KEY` env var in `.env.example` is informational only.

---

## 14. Quick troubleshooting

| Symptom                                                          | Likely cause                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `503 Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN`            | `.env` not loaded (wrong dir) or values not set in Vercel env.               |
| Dashboard loads but a subaccount card shows a red error          | That specific subaccount's API call failed — `row.error` carries the HTTP message. Often a permission issue on that one subaccount. |
| Twilio view very slow on cold load                               | Many subaccounts × per-brand GETs. Try `TWILIO_SKIP_BRAND_DETAIL_FETCH=1` and/or raise `TWILIO_SUBACCOUNT_CONCURRENCY`. |
| `429` errors from Twilio                                         | Too much concurrency. Lower `TWILIO_SUBACCOUNT_CONCURRENCY`.                 |
| Telnyx tenant shows "Set TELNYX_API_KEY or TELNYX_API_KEYS"      | Neither var is set; the Telnyx tab will only show that one error row.        |
| Vercel 500 with `Cannot find module '../dist/app.js'`            | Vercel didn't run `npm run build` (so no `dist/`). Check the build command in `vercel.json` / project settings. |
| UI shows stale data after a Console change                       | 3-minute cache. Either wait, set `VISIBILITY_CACHE_TTL_MS=0`, or restart the server. |

---

## 15. Where to start reading the code

If you have ten minutes to get oriented, read these in this order:

1. `server/app.ts` — see what the API surface is (1 real route).
2. `server/lib/twilio.ts` — `buildTwilioVisibility` → `processSubaccount`. This is the heart of the project.
3. `server/lib/twilio-rejection.ts` and `server/lib/twilio-pipeline.ts` — short, derived views you can scan in a minute each.
4. `client/src/App.tsx` — start at `App()`, then `TwilioView`. Skip the SVG icons.

That is the entire system. There is intentionally no framework, no ORM, no microservices — keep it that way unless a real need shows up.
