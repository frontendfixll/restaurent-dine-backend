# SmartDine Backend — Masterplan

**Status:** ✅ Phases 0 – 12 complete. See [README.md](README.md) for the live API.

**Stack (as built):** Node.js 20+ · TypeScript · Express · MongoDB (Mongoose ODM) · **Agenda (Mongo-backed jobs, no Redis)** · Socket.IO (real-time) · JWT (auth)

**Architecture style:** Modular monolith — one Express app, one repository, organized by feature module (`src/modules/<feature>`). Easier to ship, simple to split later if needed.

---

## Cross-cutting foundations (built in Phase 0–1, used by every phase after)

- Centralized error handler, request validator (Zod or Joi), structured logger (pino), request-id correlation.
- Config layer (`.env` → typed config object).
- Mongo connection with replica-set support (needed for transactions on orders/payments).
- RBAC middleware (`requirePermission('order:refund')`) used by every protected route.
- Audit-log writer (a service every mutating action calls — price changes, discounts, voids, refunds, role changes, menu publishes).
- Soft-delete pattern on financial / menu entities (never hard-delete).
- API versioning: `/api/v1/...`.
- OpenAPI/Swagger generated from route definitions.

---

## Phase 0 — Project Bootstrap

**Goal:** Working skeleton you can `npm run dev` and hit `/health`.

**Deliverables:**
- `package.json`, ESLint + Prettier, nodemon dev script, Jest setup.
- Folder structure (`src/`, `src/modules/`, `src/middleware/`, `src/config/`, `src/utils/`, `src/jobs/`, `tests/`).
- `app.js` (Express) + `server.js` (HTTP + Socket.IO bootstrap).
- Mongo + Redis connection bootstrap.
- Global error handler, 404 handler, request logger, CORS, helmet, rate-limiter, body-parser.
- `/health` and `/api/v1/ping` endpoints.
- Dockerfile + docker-compose (Mongo + Redis + app) for local dev.
- `.env.example`, README skeleton (dev setup steps only).

---

## Phase 1 — Auth, Users, Roles, Audit Log

**Goal:** Staff can log in; every sensitive action gets audit-logged.

**Models:** `User`, `Role`, `Permission` (or permission strings embedded on role), `Session` (refresh tokens), `AuditLog`, `OtpCode` (collection with TTL index).

**Endpoints:**
- `POST /auth/staff/login` (email + password → access + refresh JWT)
- `POST /auth/staff/refresh`
- `POST /auth/staff/logout`
- `POST /auth/staff/2fa/setup` and `/2fa/verify` (TOTP or email OTP)
- `POST /auth/guest/otp/request` + `/verify` (phone OTP for takeaway)
- `GET/POST/PATCH/DELETE /users` (Owner/Manager only)
- `GET/POST/PATCH /roles` (custom roles with permission lists)
- `GET /audit-logs` (filter by user, action, date)

**Built-in seeded roles:** Owner, Manager, Cashier, Waiter, Kitchen, ReadOnly.

**Permissions** are namespaced strings: `menu:edit`, `order:refund`, `discount:apply.above_500`, `day:close`, etc.

**Session policy:** kitchen sessions auto-extend; cashier sessions idle-lock after N minutes.

---

## Phase 2 — Restaurant Profile & Settings

**Goal:** The single restaurant doc holds all config the rest of the system reads.

**Model:** `Restaurant` (singleton — only one document ever).
- Brand identity (name, logo URL, brand color, contact, location, opening hours).
- Tax profile (GSTIN, CGST/SGST/IGST rates, service charge %, rounding rule).
- Currency, time zone, supported languages.
- Receipt template (header/footer, FSSAI number, return policy).
- Payment methods enabled.
- Operating mode toggles: dine-in / takeaway / online-prepay ON/OFF.

**Endpoints:**
- `GET /restaurant`
- `PATCH /restaurant` (Owner only; audit-logged)
- `POST /restaurant/logo` (file upload)

---

## Phase 3 — Menu Management

**Goal:** Full CRUD for the menu graph that powers the guest app.

**Models:** `Category`, `Item`, `Variant` (embedded on item), `ModifierGroup`, `Modifier`, `Combo`.

**Item fields:** name, description, image, base price, prep-time, food-type (Veg/Non-Veg/Egg/Vegan), spice level, calories, allergens, HSN code, availability windows, is86 (out-of-stock flag), translations (embedded `{lang: {name, description}}`).

**Endpoints:**
- `GET/POST/PATCH/DELETE /categories` (with drag-order endpoint `PATCH /categories/reorder`)
- `GET/POST/PATCH/DELETE /items`
- `PATCH /items/:id/86` (instant out-of-stock toggle — broadcast over Socket.IO)
- `GET/POST/PATCH/DELETE /modifier-groups`
- `GET/POST/PATCH/DELETE /combos`
- `POST /menu/import` (CSV/Excel bulk)
- `GET /menu/export` (CSV)
- `GET /menu/public` (guest-facing — filters out 86'd, applies availability window, returns translations)

**Cross-cutting:** every menu mutation writes audit log + emits `menu:updated` Socket.IO event so guest apps refresh.

---

## Phase 4 — Tables & QR Codes

**Goal:** Generate / manage table QRs and window QRs; track table state.

**Models:** `Table` (number, zone, capacity, status: vacant/seated/ordered/awaiting_bill/cleaning, currentSessionId), `QrCode` (type: 'table' | 'window', targetUrl, style, scans, orders, slug for dynamic redirect), `TableSession` (open dine-in session on a table; multiple orders can attach).

**Endpoints:**
- `GET/POST/PATCH/DELETE /tables`
- `POST /tables/bulk` (generate N tables at once)
- `PATCH /tables/:id/merge`, `/split`, `/move`
- `GET/POST /qr-codes`
- `POST /qr-codes/:id/regenerate`
- `GET /qr-codes/:id/png|svg|pdf` (download formats)
- `GET /qr-codes/:id/analytics` (scans, orders, abandonment, avg bill)
- `GET /r/:slug` (dynamic QR redirector — increments scan count, redirects to live target)

---

## Phase 5 — Orders + Kitchen Display (CORE)

**Goal:** Dine-in, window/takeaway, and assisted (waiter) orders; real-time KDS; the heart of the system.

**Models:** `Order`, `OrderItem` (embedded), `KdsTicket` (one per station an order touches).

**Order fields:** orderNumber (sequential), channel (`dine_in`|`window`|`assisted`), tableId / sessionId / windowToken, customerId, items[{itemId, variantId, modifiers[], qty, notes, station}], status (`placed`|`accepted`|`preparing`|`ready`|`served`|`settled`|`cancelled`), timeline[{status, at, by}], totals (subtotal, tax, discount, charge, grand), paymentStatus.

**Endpoints:**
- `POST /orders` (guest places — no auth needed for dine-in; OTP for window)
- `POST /orders/:id/items` (additional rounds on same table)
- `PATCH /orders/:id/status` (staff transitions)
- `PATCH /orders/:id/items/:itemId/void` (manager PIN required)
- `POST /orders/:id/modify` (with reason; audit-logged)
- `GET /orders` (filter by status/channel/table/waiter/time)
- `GET /orders/:id`
- `POST /orders/:id/cancel`
- **Window-specific:** `POST /orders/window/token-scan` (cashier scans guest token to mark picked-up)
- **Guest pings:** `POST /orders/:id/request` (call waiter / request water / request bill — broadcast to staff)

**Socket.IO namespaces / rooms:**
- `/kds` — kitchen joins per-station rooms; receives `order:new`, `order:updated`, plays audio alert.
- `/staff` — managers, cashiers, waiters get full order pipeline updates.
- `/guest:<orderId>` — guest gets their own status updates.
- `/now-serving` — public "ready for pickup" board.

**Promised-time estimator:** simple algorithm — sum(item.prepTime * qty) + queue depth penalty; exposed to window flow.

**Offline tolerance on KDS:** server keeps last-known queue snapshot endpoint `GET /kds/snapshot` for reconnect resync.

---

## Phase 6 — Billing, Payments, Invoice (GST)

**Goal:** Settle orders, generate compliant invoices, handle split bills and split-tender payments.

**Models:** `Invoice` (immutable snapshot — sequentialInvoiceNo, lineItems, taxBreakup, totals, customer, restaurantSnapshot), `Payment` (mode, amount, txnRef, status), `CashSession` (open/close per cashier shift), `Refund`.

**Endpoints:**
- `POST /orders/:id/bill` (generate bill from order — applies tax, service charge, rounding)
- `POST /orders/:id/bill/split` (by item / equal / custom)
- `PATCH /orders/:id/bill/discount` (manager PIN)
- `POST /orders/:id/payments` (one or more — supports split tender)
- `POST /payments/upi/qr` (generate dynamic UPI QR for this bill)
- `POST /payments/webhook/:gateway` (Razorpay/PhonePe/Stripe callbacks → reconcile)
- `POST /orders/:id/settle` (finalize → emits Invoice with sequential number)
- `POST /invoices/:id/refund`
- `GET /invoices/:id/pdf`
- `POST /invoices/:id/share` (WhatsApp / SMS / Email)
- `POST /cash-session/open`, `/close` (end-of-day reconciliation)
- `POST /day-close` (manager flow — totals, variance, mode breakdown, emails to owner)

**Sequential invoice number:** allocated via Mongo `findOneAndUpdate` on a `Counter` doc inside a transaction — never reused, never skipped.

---

## Phase 7 — Inventory (Basic)

**Goal:** Track raw materials; auto-deduct via recipes when an order is settled.

**Models:** `InventoryItem` (name, unit, currentStock, threshold, supplierName), `Recipe` (itemId+variantId → [{inventoryItemId, qtyPerUnit}]), `StockMovement` (in/out/waste/adjustment with reason).

**Endpoints:**
- `GET/POST/PATCH/DELETE /inventory`
- `POST /inventory/:id/stock-in` (purchase entry)
- `POST /inventory/:id/stock-out` (wastage/transfer)
- `GET/POST /recipes`
- `GET /inventory/low-stock` (returns items below threshold)
- `GET /inventory/snapshot` (daily snapshot for variance)

**Deduction hook:** when `Order` transitions to `settled`, a worker computes raw-material deduction from recipes and writes `StockMovement` entries. Low-stock alerts queued to notifications.

---

## Phase 8 — Customers & Feedback

**Goal:** Auto-build customer DB, capture feedback.

**Models:** `Customer` (phone unique, name, email, tags, lifetimeValue, lastVisitAt, visitCount, favoriteItems), `Feedback` (orderId, rating 1–5, text, tagChips, replyText, repliedBy).

**Endpoints:**
- `GET/POST/PATCH /customers`
- `GET /customers/:id/history`
- `POST /customers/:id/tags`
- `POST /orders/:id/feedback` (guest submits post-settlement)
- `GET /feedback` (manager inbox; filters by rating, tag)
- `POST /feedback/:id/reply` (sends via SMS/WhatsApp)

---

## Phase 9 — Discounts, Coupons, Loyalty

**Goal:** Pricing rules applied at bill time.

**Models:** `Discount` (type: `percent`|`flat`; scope: `bill`|`item`|`category`; rules: minBill, timeWindow, daysOfWeek, maxUses), `Coupon` (code, discountRef, usageLimit, perUserLimit, expiry, usedCount), `LoyaltyAccount` (customerId, points, history[]), `LoyaltyConfig` (earnRate, redeemRate, minRedeem).

**Endpoints:**
- `GET/POST/PATCH/DELETE /discounts`
- `GET/POST/PATCH/DELETE /coupons`
- `POST /coupons/validate` (used at billing)
- `GET/PATCH /loyalty/config`
- `GET /loyalty/:customerId`
- `POST /loyalty/:customerId/redeem`

**Pricing engine** is a pure service: `calculateBill(order, restaurantConfig, appliedDiscounts, appliedCoupon, loyaltyRedemption)` → returns line-item breakup, tax, charges, grand total. Heavily unit-tested.

---

## Phase 10 — Notifications

**Goal:** Unified module powering SMS / WhatsApp / Email / Web-push.

**Models:** `NotificationTemplate` (channel, event key, body with `{{variables}}`), `NotificationLog` (sent attempts, delivery status).

**Provider abstraction:** `SmsProvider`, `WhatsappProvider`, `EmailProvider`, `PushProvider` interfaces → swappable implementations (Twilio / MSG91 / Gupshup / SendGrid / SES / Web Push).

**Events that fire notifications:**
- Order placed, accepted, ready, settled.
- OTP.
- Bill share.
- Low-stock alert to owner.
- Daily summary email to owner.
- Negative feedback alert to manager.

**Endpoints:**
- `GET/POST/PATCH /notification-templates`
- `POST /notifications/test` (preview render + send to test number)
- `GET /notifications/logs`

**Implementation:** BullMQ queue — emit event → enqueue job → worker resolves template + provider → sends → logs delivery.

---

## Phase 11 — Reports & Analytics

**Goal:** All reports from PRD §7.16 with CSV/PDF export.

**Endpoints (each accepts `from`, `to`, `channel`, `groupBy`):**
- `GET /reports/sales`
- `GET /reports/items` (top sellers, slow movers, profitability)
- `GET /reports/tax` (GST collected, ready for filing)
- `GET /reports/payments`
- `GET /reports/staff`
- `GET /reports/footfall` (dine-in vs takeaway, peak hours, dwell time)
- `GET /reports/inventory`
- `GET /reports/feedback`
- `GET /reports/kpi-dashboard` (top 7 numbers for home screen)
- `POST /reports/:type/export` (`csv` | `pdf` — queued job, emails link when ready)

**Implementation:** MongoDB aggregation pipelines. Heavy reports go to a BullMQ worker so the API stays snappy.

---

## Phase 12 — Hardening, Docs, Deploy

- Full integration test suite (Supertest + an in-memory mongodb-memory-server).
- Load test the order-place → KDS path (target: <3s p95).
- Security pass: rate limits per route, input sanitization, mongo-sanitize, JWT rotation, refresh-token revoke list, secrets via env, no PII in logs.
- Backup strategy for Mongo.
- Swagger/OpenAPI complete.
- Dockerfile production build + docker-compose.prod.yml.
- CI/CD config (GitHub Actions: lint → test → build → deploy).
- Monitoring hooks (health, metrics endpoint, optional Sentry).

---

## Data model summary (Mongo collections)

`users`, `roles`, `sessions`, `otpcodes`, `auditlogs`,
`restaurant` (singleton), `counters` (for invoice/order numbering),
`categories`, `items`, `modifiergroups`, `combos`,
`tables`, `qrcodes`, `tablesessions`,
`orders`, `kdstickets`,
`invoices`, `payments`, `cashsessions`, `refunds`,
`inventoryitems`, `recipes`, `stockmovements`,
`customers`, `feedbacks`,
`discounts`, `coupons`, `loyaltyaccounts`, `loyaltyconfig`,
`notificationtemplates`, `notificationlogs`.

---

## Suggested module folder structure

```
backend/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   ├── middleware/        # auth, rbac, validate, error, audit
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── restaurant/
│   │   ├── menu/
│   │   ├── tables/
│   │   ├── qr/
│   │   ├── orders/
│   │   ├── kds/           # socket gateway
│   │   ├── billing/
│   │   ├── payments/
│   │   ├── inventory/
│   │   ├── customers/
│   │   ├── feedback/
│   │   ├── discounts/
│   │   ├── loyalty/
│   │   ├── notifications/
│   │   ├── reports/
│   │   └── audit/
│   ├── jobs/              # BullMQ workers
│   ├── sockets/           # Socket.IO bootstrap
│   ├── providers/         # sms, whatsapp, email, payment, storage
│   ├── utils/
│   └── db/
│       ├── connect.js
│       └── seed.js
├── tests/
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── package.json
```

Each module exposes: `routes.js`, `controller.js`, `service.js`, `model.js`, `validators.js`, `*.test.js`.
