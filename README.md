# SmartDine Backend

Single-restaurant management platform — Node.js + Express + TypeScript + MongoDB.

Covers the full v1.0 surface from the PRD: QR ordering, kitchen display, billing with GST-compliant invoices, inventory deduction, customers & feedback, discounts & loyalty, notifications, and reports.

See [MASTERPLAN.md](MASTERPLAN.md) for the phase-by-phase build plan.

---

## Stack

- **Runtime** — Node.js 20+, TypeScript
- **HTTP** — Express 4
- **Real-time** — Socket.IO 4 (KDS, order status, /now-serving board, menu changes, low-stock alerts)
- **Database** — MongoDB 6+ with Mongoose 8
- **Async jobs** — Agenda (Mongo-backed scheduler — no Redis needed)
- **Auth** — JWT (access + refresh) for staff, short-lived JWT for guest phone verification
- **Validation** — Zod
- **Logging** — pino + pino-http
- **Providers** — Cloudinary (images, QR PDFs), Razorpay (UPI QR + webhook), Twilio (SMS + WhatsApp), Nodemailer (SMTP), optional Sentry

## Architecture (modular monolith)

```
src/
├── app.ts                # Express factory
├── server.ts             # HTTP + Socket.IO + Agenda bootstrap
├── config/               # Typed config (Zod-validated from .env)
├── middleware/           # auth, rbac, validate, error, request-id, rate-limits, upload
├── modules/              # 22 feature modules
│   ├── auth/             users/ roles/ audit/      <- Phase 1
│   ├── restaurant/                                  <- Phase 2
│   ├── menu/             tables/ qr/                <- Phase 3-4
│   ├── orders/ kds/                                 <- Phase 5
│   ├── invoices/ payments/ cashSessions/ billing/   <- Phase 6
│   ├── inventory/                                   <- Phase 7
│   ├── customers/ feedback/                         <- Phase 8
│   ├── promotions/                                  <- Phase 9
│   ├── notifications/                               <- Phase 10
│   └── reports/                                     <- Phase 11
├── providers/            # cloudinary, razorpay, sms, email
├── jobs/                 # Agenda job definitions (daily summary, cleanup)
├── docs/                 # OpenAPI spec + Swagger UI
├── sockets/              # /staff /kds /guest /now-serving /menu namespaces
├── utils/                # logger, AppError, deepMerge, numberToWords, sentry
└── db/                   # connect.ts, seed.ts
```

## Quick start

```powershell
cd backend
npm install
copy .env.example .env
# Edit .env — at minimum MONGODB_URI and the two JWT secrets

# Make sure MongoDB is running locally (or use Atlas)
npm run seed       # creates roles, owner, restaurant, menu, tables, QRs, inventory, notification templates
npm run dev
```

Server boots on `http://localhost:4000`. Try:
- `GET /health`
- `GET /api/v1/ping`
- `GET /docs` — interactive API explorer (Swagger UI)
- `GET /docs/openapi.json` — raw spec
- `GET /api/v1/menu/public` — what guests see (no auth)

Seeded owner: `owner@smartdine.local` / `Owner@12345`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with hot reload (ts-node-dev) |
| `npm run build` | Compile TS to `dist/` (uses tsc-alias so path aliases resolve at runtime) |
| `npm run start` | Run compiled JS (production) |
| `npm run seed` | Seed roles + owner + restaurant + menu + tables + QRs + inventory + notification templates |
| `npm test` | Run Jest unit tests (pricing engine, template engine, unit conversion, rupees-to-words) |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` | Prettier write |

## Real-time namespaces (Socket.IO)

| Namespace | Audience | Sample events |
|---|---|---|
| `/staff` | Dashboard | `order:new`, `order:status_changed`, `table:status_changed`, `inventory:low_stock`, `feedback:new`, `feedback:negative_alert` |
| `/kds` | Kitchen | `order:new`, `order:item_status_changed`, `order:cancelled` — join `station:<name>` rooms for per-station routing |
| `/guest` | Per-order room `order:<id>` | `order:status_changed`, `order:updated` |
| `/now-serving` | Public board | `window:update` (placed / ready / picked_up) |
| `/menu` | Guest apps | `item:86_changed`, `menu:updated` so QR menus refresh live |

## Deployment to Render

1. Push the repo to GitHub.
2. In Render, click **New → Blueprint** and point at this repo. [render.yaml](render.yaml) handles the rest:
   - Web service on Node, root `backend`
   - Build: `npm ci && npm run build`
   - Start: `npm run start`
   - Health check: `/health`
3. Fill in the **non-synced** env vars in the Render dashboard:
   - `MONGODB_URI` — your Atlas URI (or Render's Mongo add-on)
   - `CORS_ORIGIN`, `PUBLIC_BASE_URL` — your frontend + API domains
   - `CLOUDINARY_*`, `RAZORPAY_*`, `TWILIO_*`, `SMTP_*` — provider credentials
4. First deploy will run `seed` once via:
   ```
   render exec --service smartdine-backend -- npm run seed
   ```
   (or run it locally against the Atlas URI before flipping DNS).

## Operational endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness probe (Render health check) |
| `GET /api/v1/ping` | API-prefix sanity |
| `GET /docs` | Swagger UI |
| `GET /docs/openapi.json` | OpenAPI 3.0 spec |
| `GET /r/:slug` | Public QR redirect (logs scan, 302 → guest app) |
| `POST /api/v1/payments/webhook/razorpay` | Razorpay webhook (HMAC-verified) |

## Rate limits

In addition to the global limiter (300/15min), several routes have per-route limits:

| Route | Limit |
|---|---|
| `POST /auth/staff/login` | 10 / 15 min |
| `POST /auth/staff/2fa/verify` | 10 / 5 min |
| `POST /auth/guest/otp/request` | 5 / 5 min (anti-SMS-bomb) |
| `POST /auth/guest/otp/verify` | 10 / 5 min |

## Scheduled jobs (Agenda)

Bootstrapped at server start (Mongo-backed — no Redis):

| Job | Cron | What it does |
|---|---|---|
| `daily-summary-email` | `30 23 * * *` | Builds day-close summary + emails the owner |
| `cleanup-expired-sessions` | `0 * * * *` | Belt-and-suspenders cleanup of TTL-expired sessions and OTPs |

## Sentry (optional)

Set `SENTRY_DSN` in your `.env` and the app initializes Sentry automatically at boot — handles `unhandledRejection` and `uncaughtException`. `@sentry/node` is an `optionalDependencies` entry so it doesn't fail install if the SDK is unavailable.

## Testing

Pure-function unit tests run without a database:

```powershell
npm test
```

Covers:
- Pricing engine (tax-exclusive/inclusive, service charge, discount, rounding, modifiers)
- Notification template engine (`{{var}}` + dot-paths, strict-mode errors)
- Inventory unit conversion (kg↔g, L↔ml, group-compatibility guard)
- Rupees-to-words (Indian Lakh/Crore numbering)

Add integration tests in Phase v1.1 — the design is intentionally repo-only stable.

## Complete curl playbook

A walkthrough of the whole flow — adapt IDs as you go.

```powershell
$BASE = "http://localhost:4000/api/v1"

# 1. Staff login (seeded owner)
$ACCESS = (curl -X POST $BASE/auth/staff/login -H "Content-Type: application/json" `
  -d '{\"email\":\"owner@smartdine.local\",\"password\":\"Owner@12345\"}' | ConvertFrom-Json).data.accessToken

# 2. Inspect the menu the guest sees
curl $BASE/menu/public

# 3. Get the seeded QR slugs
curl "$BASE/qr-codes?type=table" -H "Authorization: Bearer $ACCESS"

# 4. Place a dine-in guest order (no auth)
curl -X POST $BASE/guest/orders/dine-in -H "Content-Type: application/json" `
  -d '{\"qrSlug\":\"<slug>\",\"items\":[{\"itemId\":\"<paneerTikkaId>\",\"variantId\":\"<halfId>\",\"qty\":1,\"modifiers\":[{\"groupId\":\"<spiceGroupId>\",\"modifierId\":\"<mildId>\"}]}]}'

# 5. Kitchen accepts → mark all items ready → waiter serves
curl -X PATCH $BASE/orders/<orderId>/accept -H "Authorization: Bearer $ACCESS"
curl -X PATCH $BASE/kds/orders/<orderId>/items/<itemId>/status `
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" `
  -d '{\"status\":\"ready\"}'
curl -X POST $BASE/orders/<orderId>/serve -H "Authorization: Bearer $ACCESS"

# 6. Generate invoice with discount + coupon + loyalty redemption
curl -X POST $BASE/billing/orders/<orderId>/bill `
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" `
  -d '{\"discountId\":\"<happyHourId>\",\"couponCode\":\"WELCOME100\",\"loyaltyPoints\":50}'

# 7. Record split-tender payment
curl -X POST $BASE/payments/invoices/<invoiceId> `
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" `
  -d '{\"mode\":\"cash\",\"amount\":200,\"cashTendered\":500}'
curl -X POST $BASE/payments/invoices/<invoiceId> `
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" `
  -d '{\"mode\":\"upi\",\"amount\":250,\"txnRef\":\"UPI12345\"}'

# 8. After settle, hooks fire automatically:
#    - Inventory deducted via recipes
#    - Customer.visitCount / lifetimeValue / favorites updated
#    - Loyalty points earned
#    - Settlement SMS sent to guest

# 9. Owner end-of-day
curl $BASE/billing/day-close/preview -H "Authorization: Bearer $ACCESS"
curl $BASE/reports/kpi-dashboard -H "Authorization: Bearer $ACCESS"
curl "$BASE/reports/sales/export?format=xlsx&from=2026-06-01&to=2026-06-30" `
  -H "Authorization: Bearer $ACCESS" -o sales-june.xlsx
```

## Permissions summary

Built-in roles (seeded):

| Role | Scope |
|---|---|
| **Owner** | `*` — everything |
| **Manager** | Operational: menu, staff invites, billing, refunds, reports, discounts, day-close |
| **Cashier** | Billing, payments, lookup customers, redeem loyalty |
| **Waiter** | Take assisted orders, manage table state |
| **Kitchen** | KDS read/update, 86 toggle |
| **ReadOnly** | View-only across most modules |

Custom roles can be defined via `POST /api/v1/roles` from a registry of ~70 namespaced permissions (`menu:86`, `order:refund`, `day:close`, `discount:apply`, …). Use `GET /api/v1/roles/permissions` for the full list.

## License

Proprietary — Fixl Solutions.
