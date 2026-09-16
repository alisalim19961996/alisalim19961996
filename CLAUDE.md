# MPS — Modern Phone Store

Bilingual (Arabic/English) e-commerce platform for the Iraqi market.

> **This file is the project's memory.** It is written so that after a context
> compaction you can read it and continue development without re-deriving
> decisions or repeating mistakes already paid for. Keep it current: when a
> phase completes or a decision changes, update the relevant section in the
> same commit.

---

## 1. Purpose and scope

MPS sells **phones, tablets and accessories** to customers in Iraq, and is
built to sell other categories later without a rewrite. It is a real commercial
storefront, not a demo: Arabic-first, mobile-first, cash on delivery, delivery
across all 19 governorates.

The owner's priorities, in order: **UX → design → commerce correctness →
security → performance → SEO → maintainability.** Design quality is treated as
a requirement, not a finish.

---

## 2. Working language

**All explanations, reports and discussion with the project owner are written
in Arabic.** Technical terms — package names, file paths, code identifiers —
stay in English, because translating them harms clarity. Code, comments, commit
messages and this file are in English.

**The owner runs Windows PowerShell 5.1**, where `&&` is a parse error — it
arrived in PowerShell 7. Hand them one command per line, or `;` with the
warning that it runs the second even when the first fails. This does not apply
to the `&&` inside `package.json`: pnpm runs those through its own shell, so
`pnpm check` works for them unchanged. Their `.env` is CRLF for the same
reason, which §18 has already paid for twice.

---

## 3. Tech stack (versions are pinned for reasons — see §13)

| Package                 | Version         | Notes                                                |
| ----------------------- | --------------- | ---------------------------------------------------- |
| next                    | 16.3.4          | App Router. Uses `proxy.ts`, **not** `middleware.ts` |
| react / react-dom       | 19.3.0          |                                                      |
| typescript              | 5.9.3           | Not 7.x — lint ecosystem lags                        |
| tailwindcss             | 4.3.3           | CSS-first `@theme`, no `tailwind.config.js`          |
| prisma / @prisma/client | 7.10.0          | URL lives in `prisma.config.ts`, not the schema      |
| @prisma/adapter-pg + pg | 7.10.0 / 8.16.3 | Prisma 7 connects via driver adapter                 |
| better-auth             | 1.7.3           |                                                      |
| next-intl               | 4.14.2          |                                                      |
| zod                     | 4.6.0           |                                                      |
| eslint                  | 9.39.5          | Not 10 — breaks `eslint-plugin-react`                |
| vitest                  | 4.1.11          | Not 5 — outside `better-auth`'s peer range           |
| pnpm                    | 11.15.1         | Pinned via `packageManager`                          |

Runtime: Node ≥ 22.12, PostgreSQL 16.

---

## 4. Commands

```bash
pnpm setup         # guided first-time setup (env, db, migrations, seed)
pnpm keys          # fill the optional keys without editing .env by hand —
                   # asks one value at a time, catches the wrong one, writes
                   # it in place, then runs the live check
pnpm check:layout  # measure the layout claims in §10 against a running site:
                   # every card in a row the same size, no sideways scroll
pnpm check:services # prove the optional keys work — uploads a file to
                   # Supabase and deletes it, asks Google if the client
                   # id and secret are a pair. Secrets print masked.
pnpm dev           # development server
pnpm check         # typecheck + lint + format + tests + build — run before pushing
pnpm build         # production build
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
pnpm test          # vitest run (unit)
pnpm test:integration  # vitest against a real database (orders, concurrency)
pnpm test:e2e      # Playwright against the BUILT site — run `pnpm build` first.
                   # Buys something, fails to read someone else's order, drives
                   # the dashboard. Needs a browser: npx playwright install chromium
pnpm format        # prettier --write .
pnpm db:deploy     # apply migrations (production)
pnpm db:migrate    # create a migration (development)
pnpm db:seed       # load DEMO data (development only)
pnpm db:studio     # browse the database
```

`postinstall` runs `prisma generate`. Without it a fresh clone fails typecheck
and tests, because Prisma's enums only exist in the generated client.

Arabic guides for the owner live in `docs/`: `run-locally-ar.md`,
`database-setup-ar.md`, `vscode-setup-ar.md`, and **`extending-ar.md`** —
step-by-step recipes answering "I want to change X, where do I start?"
(text, colours, nav links, a new page, a new specification, a whole new
product type, brands, **writing a buying guide**, UI numbers, delivery fees, the
line-quantity cap, what the order path forbids, why the header must stay
static, schema changes), plus
the list of what the guardrails refuse. Every recipe names the exact file and how
to confirm the change landed.

---

## 5. Architecture

Modular monolith, server-first, with hard layer boundaries:

```
UI (app/, components/, features/)
   ↓  Server Components read · Server Actions write (Phase 3+)
server/queries/    read models, shaped for one screen
server/services/   business rules, transactions, authorization
server/db/client   Prisma
   ↓
PostgreSQL
```

```
app/[locale]/(storefront)   storefront routes
app/[locale]/(admin)        admin routes          — NOT BUILT YET (Phase 4)
components/ui               design-system primitives
components/layout           header, footer, nav, language switcher
features/<domain>/components  domain UI (product, catalogue, search, cart,
                              checkout, order)
features/<domain>/actions.ts  Server Actions — 'use server', async exports only
server/queries              catalogue · product · cart · order reads
server/services             cart + order logic — the only place rules live
server/db                   Prisma client, seed, seed-data
schemas/                    Zod — SERVER-side validation (see the rule below)
config/                     nav.ts (all links) · ui.ts (tuned numbers)
lib/                        framework-free helpers
lib/domain/                 pure business logic, no imports from Next or Prisma runtime
i18n/                       locale routing and navigation
messages/                   ar.json / en.json — all UI text
```

**Cache invalidation goes through `server/revalidate.ts`**, which builds a
literal path per locale. There were three conventions before it and two
invalidated nothing: `/admin/orders` (the route is `/ar/admin/orders`) and
`/[locale]/products/<slug>` (half a route pattern, half a value — a pattern
matches the route FILE, a literal matches one page, a mixture matches neither).
`revalidatePath` does not throw on a path that matches nothing; the action
reports success and the stale page stays on the shop floor. A guardrail now
fails on any `revalidatePath` in a UI file whose literal lacks the locale.

The same pass removed `revalidatePath('/', 'layout')` from every cart action.
Its comment said the header's count is on every page — which stopped being true
when the count moved into `CartCountBadge` (§8), precisely so a cart change
costs the storefront nothing. Settings keep the whole-tree purge, because
settings really do print everywhere and it is the rarest write in the dashboard.

**Rules that are never bent:**

- Components never import Prisma. Path is `UI → server/queries|services → server/db/client`.
- `server/queries/*` and `server/services/*` start with `import 'server-only'`.
- Filtering, sorting and pagination happen in SQL, never in JavaScript after fetching.
- Every query names its columns with `select`. No `include: { everything }`.
- **A client component never imports from `schemas/`.** Anything it needs — a
  list of sort values, a helper that edits a query string, a form check — goes
  in `lib/` and the schema imports it from there. The reason is measured, not
  stylistic: importing two pure functions from a module whose first line is
  `import { z } from 'zod'` put **353 kB of Zod in the browser**, a third of
  the catalogue page. `tests/e2e/performance.spec.ts` fails on it now.

**These rules are enforced, not merely written down.** `tests/architecture.test.ts`
fails the build on a violation and `eslint.config.mjs` flags it while it is being
typed. A rule that only lives in a document is broken quietly by the next
contributor — or by an assistant whose context was compacted. See §17.

---

## 6. Database

44 tables, 12 enums, 30 CHECK constraints, 4 migrations. Schema: `prisma/schema.prisma`.

### Core relationships

```
User(role) ─< Address, Order, Review, Cart, AuditLog, ProductView
           ─1 Wishlist ─< WishlistItem
Session / Account / Verification    → better-auth's required shape

ProductType ─< ProductTypeAttribute >─ AttributeDefinition ─< AttributeOption
     │                                        │
  Product ─< ProductAttributeValue >──────────┘
     ├─< ProductOption ─< ProductOptionValue ─< VariantOptionValue
     ├─< ProductVariant ─1:1 Inventory ─< InventoryMovement
     ├─< ProductImage
     ├─< ProductVideo        (YouTube id + click-to-play facade)
     ├── Brand, Category(self-referencing tree)
     └─< Review, ProductView, Offer

Cart ─< CartItem ─ ProductVariant
Order ─< OrderItem (price/name SNAPSHOT) ─< OrderEvent (timeline) ─1 Payment ─0:1 Shipment
Offer ─ Product|Category|Brand    Coupon ─< CouponUsage
Content: SiteSetting, DeliveryRate, HomepageSection, Banner, Faq, BlogPost
Ops: AuditLog, ProductView, SearchEvent
```

### Decisions encoded in the schema

- **Money is `Int` of whole Iraqi dinars.** No Float, no Decimal. Iraq does not
  transact in fils, so there is no minor unit. Helpers in `lib/money.ts` throw
  on a fractional input rather than rounding.
- **Availability is a status, not a count.** `Inventory.status` (IN_STOCK /
  OUT_OF_STOCK / PREORDER / DISCONTINUED) is the whole truth. MPS does not
  track units. `Inventory.trackQuantity` exists per variant so counted stock
  can be switched on later **without a migration** — both paths already work.
- **Specifications are data, not columns.** A new spec is an
  `AttributeDefinition` row plus a `ProductTypeAttribute` link. Adding
  "laptops" is one `ProductType` row and some attribute rows — **no code**.
- **Variants are option-driven.** `ProductOption` / `ProductOptionValue` /
  `VariantOptionValue`. A phone has storage and colour, a cable has length.
- **`OrderItem` snapshots price, name, SKU and variant label.** Editing a
  product tomorrow must never change last week's invoice.
- **Slugs**: one latin slug in both `slugAr` and `slugEn`, so
  `/ar/products/<slug>` and `/en/products/<slug>` stay stable for hreflang.

### CHECK constraints (in migration SQL, not expressible in Prisma)

`reserved <= onHand` · non-negative stock · `comparePriceIqd > priceIqd` (no
fake discounts) · `lineTotalIqd = unitPriceIqd * quantity` ·
`totalIqd = subtotal - discount + delivery` · rating 1–5 · coupon percentage
≤ 100 · non-empty attribute values, video ids and variant labels · single-row
`site_setting`.

Extensions `pg_trgm` and `unaccent` are created in the initial migration (not
via the `postgresqlExtensions` preview feature). Trigram indexes exist on
product and brand names, on SKU and on the variant label.

**They did not, for two migrations, while this paragraph said they did.**
`USING GIN (col gin_trgm_ops)` cannot be written in `schema.prisma`, so Prisma
cannot see those indexes — and what Prisma cannot see, it reads as drift and
writes a `DROP INDEX` for into the _next_ migration, whatever that migration
was about. Migration 2 dropped all five migration 1 created and restored one;
migration 3 was generated with a `DROP` for that survivor. By then the database
had **none**, and nothing was slow, because 16 demo products are fast without
an index. Catalogue search is `contains` + insensitive — `ILIKE '%value%'` —
which a B-tree cannot serve and a trigram index can, so this would have
surfaced as a slow shop rather than a broken one.

Migration 3 recreates all six with `IF NOT EXISTS`, and
`tests/architecture.test.ts` now fails if any trigram index a migration creates
is dropped and not put back. **After every `prisma migrate dev`, read the
generated SQL for `DROP INDEX` before committing it.**

- **`Order.guestAccessHash` / `guestAccessExpiresAt`** hold the hash of the
  grant that lets the browser which placed an order open it again, and when it
  stops working. Nullable, so every order that predates them simply has no
  guest grant and its buyer reaches it through tracking or their account. §12
  says why the order number could not go on being the credential.

- **`WishlistItem.productId` carried no foreign key at all** until the wishlist
  was built — the rows were already orphanable and nothing said so. It is
  `onDelete: Cascade`, not `SetNull`: a saved item _is_ the product, snapshots
  nothing the way an `OrderItem` does, and a row pointing at a deleted product
  has no history to protect and nothing to render.

---

## 7. Authentication and authorization

`better-auth` behind `server/auth/auth.ts` (server) and
`features/auth/auth-client.ts` (browser); guards in `server/auth/guards.ts`.
Those are the only two modules that may import better-auth — enforced by
`tests/architecture.test.ts`, with `server/db/seed.ts` exempted because it
writes the demo credential row using the provider's own hasher. Everything
under `server/auth/` carries `import 'server-only'`.

- Email + password, minimum 8 characters. Email verification is **off** until a
  mail provider is configured.
- **Mail is a seam, not a dependency.** `server/mail/provider.ts` exposes
  `getMailProvider()`, which returns a Resend sender when `RESEND_API_KEY` and
  `MAIL_FROM` are both set and **null** otherwise. Nothing outside that
  directory names Resend; a second provider is another function of the same
  shape and one line. It speaks REST over `fetch` for the reason
  `admin-storage.ts` does: one POST does not justify a dependency that must
  satisfy `minimumReleaseAge` and stay pinned for the life of the store.
- **Unconfigured mail is a supported state.** The store sells without it —
  checkout sends nothing, tracking needs no inbox, the account works on a
  password. Only _reset_ depends on it, and `/forgot-password` then renders no
  form at all and says why. A form that answers "check your inbox" for a
  message nobody sent is the worst option: the customer waits, retries, and
  concludes their account is gone.
- **The reset email says nothing about whether the address exists.**
  `/request-password-reset` answers identically either way, and the form shows
  the same confirmation for every submission — the same reasoning as the single
  sign-in error and the tracking form. A send failure is logged and swallowed
  for the same reason: a provider outage must not become an oracle for which
  addresses have accounts.
- **Reset copy is in `lib/domain/mail-templates.ts`, not `messages/*.json`.**
  next-intl resolves a locale from the request, and `sendResetPassword` runs
  inside better-auth's handler with no request context — reaching for one there
  is how the email goes out in whichever language the server booted in. It is
  Arabic, because the store is Arabic-first; writing the customer's own
  language needs a column on `User` first. Being pure, it is unit-tested, which
  matters for the one piece of UI nobody sees before a customer does.
- **Google sign-in is optional and additive.** Configured only when
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set; otherwise no
  provider is registered and no button is rendered. Email + password stays
  enabled either way — not every customer in Iraq has a Google account, and
  staff accounts are addresses on the shop's own domain.
- **Account linking is deliberately conditional**, in `server/auth/auth.ts`:
  `accountLinking: { enabled: true, trustedProviders: ['google'],
requireLocalEmailVerified: true }`. Google's word that an address is verified
  can be trusted. The _local_ account's cannot: `requireEmailVerification` is
  false, so anyone can register `victim@gmail.com` with a password they choose.
  Without `requireLocalEmailVerified`, the real owner of that address signing in
  with Google would land inside the attacker's account and see nothing unusual.
  With it, better-auth refuses and answers `account_not_linked`, which the
  sign-in page explains in the customer's own language. It is written out rather
  than left to its default because it is the entire safety property — **do not
  remove it when email verification is switched on.**
- An OAuth sign-in returns through `/api/session/claim-cart`, which folds the
  anonymous cart into the account and revalidates, so a Google sign-in and a
  password sign-in leave the cart in the same state. Its `next` parameter is
  rejected unless it is a same-site path — `//evil.example` is a
  protocol-relative URL that a "starts with /" check would honour.
- Sessions in the database, 30 days, cookie prefix `mps`, `httpOnly` +
  `sameSite=lax`. **`Secure` follows `BETTER_AUTH_URL`'s scheme, not
  `NODE_ENV`.** Keying it off NODE_ENV meant `pnpm build && pnpm start` on
  http://localhost issued `__Secure-` cookies the browser silently refused to
  store: sign-in appeared to succeed, no session existed, and every guarded
  page bounced back to the form. curl stores them regardless, so the API
  looked healthy while the browser was broken.
- **Every cookie MPS sets goes through `appCookieOptions()`**
  (`server/cookies.ts`), which derives `secure` from `BETTER_AUTH_URL`'s scheme
  exactly as the session cookie does. The rule below was written for the
  session cookie and fixed only there: `mps.cart_token` and the order cookie
  still keyed off NODE_ENV, so under `pnpm start` on http://localhost the
  browser silently discarded them — the cart was re-minted empty on every
  click, and a guest could not open the confirmation page for the order they
  had just placed. A guardrail now fails on `secure: process.env.NODE_ENV`.
- **Signing out deletes `mps.order_grant`.** That cookie means "this BROWSER
  ordered it", not "this account did", and it outlived the session: on a shared
  computer the next person could open the previous customer's order and read
  their name, phone and address. The owner loses nothing — the order is in
  their account.
- **A guard reads `role` and `isActive` from the ROW, never from the session.**
  `session.cookieCache` is on at five minutes, which is what keeps
  `getCurrentUser()` off the database on every render — and it meant a
  dismissed employee kept the dashboard for another five minutes and a demoted
  one kept their powers. `requireRole()` now takes identity from the session
  and authority from one read by primary key. `getCurrentUser()` and
  `requireUser()` are untouched, so the storefront and the cart still cost
  nothing.
- **The password-reset rate limit named an endpoint that does not exist.** The
  rule was keyed `/forget-password`; better-auth 1.7 serves
  `/request-password-reset`, and custom rules match by exact path, so the
  documented "3 per 5 minutes" was never applied — the library's own default of
  3/60s was quietly doing the work. A rate limit that fails by matching nothing
  is the worst way for one to fail.
- **Sign-up goes over HTTP too**, through the same client, so "3 sign-ups per
  5 minutes" is enforced rather than merely documented. Verified by tripping
  it: the form answers 429 with the Arabic "too many attempts".
- **Sign-in goes over HTTP through `/api/auth/*`, never a direct
  `auth.api.signInEmail()` call.** better-auth applies its rate limits in the
  router's `onRequest`, which only runs for requests through that handler — a
  direct call from a Server Action bypasses them entirely, leaving the limits
  below documented but unenforced. Over HTTP the limiter also sees the real
  client IP, so one attacker cannot lock every customer out.
- **`BETTER_AUTH_URL` must match the origin the site is served from**, or
  better-auth's origin check answers every sign-in with 403. The form logs the
  real cause to the console in development, because to a user a 403 is
  indistinguishable from a wrong password.
- Rate limits: 5 sign-ins/minute, 3 sign-ups/5 min, 3 password resets/5 min,
  20 requests/minute globally. **Those cover `/api/auth/*` only** — better-auth
  applies them in its router, and a Server Action is a different door. Order
  tracking is the one public action that answers with a customer's name and
  address, so it has its own limiter (§12).
- **A guard is not "any guard".** The rule is `requireStaff()` or
  `requireAdmin()` in every admin export; the guardrail that enforces it used
  to accept `requireUser()` and `requireRole()` as well, which would have
  waved through a module every signed-in CUSTOMER could call. No module was
  ever wrong — the rule was, and a rule that admits the failure it exists to
  prevent is not enforcement.
- Roles: `CUSTOMER` | `STAFF` | `ADMIN`. **Role is server-owned** — declared
  with `input: false`, never accepted from a client payload.
- Guards: `getCurrentUser()` (never throws), `requireUser()`, `requireRole()`,
  `requireStaff()` (STAFF+ADMIN), `requireAdmin()`, `hasRole()`.
- A deactivated account (`isActive: false`) is rejected even with a valid
  session cookie.
- **Middleware protects the route; the guard protects the data.** Every admin
  service call re-checks. Route protection alone is bypassed the moment a
  Server Action is invoked directly.

---

## 8. Routes

Locale-prefixed always: `/ar/...` and `/en/...`. `/` redirects to `/ar`.

| Route                                      | Rendering    | Purpose                                                                  |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------ |
| `/[locale]`                                | SSG          | Homepage: hero, shop-by-type, trust, 3 product rails, brands, final CTA  |
| `/[locale]/products`                       | Dynamic      | Catalogue: filters, sort, pagination, search results (`?q=`)             |
| `/[locale]/products/[slug]`                | SSG per slug | Product detail                                                           |
| `/[locale]/cart`                           | Dynamic      | Cart: lines, quantities, subtotal                                        |
| `/[locale]/checkout`                       | Dynamic      | Six fields, live delivery quote, COD                                     |
| `/[locale]/orders/[orderNumber]`           | Dynamic      | Confirmation + the order a customer returns to; greets by STATUS         |
| `/[locale]/brands`                         | SSG          | Every brand, with product counts, linking into the catalogue             |
| `/[locale]/offers`                         | Dynamic      | Everything discounted — the catalogue query with `onOfferOnly`           |
| `/[locale]/guides`                         | SSG          | The owner's articles, then entry points built from real types and brands |
| `/[locale]/guides/[slug]`                  | SSG per slug | One buying guide                                                         |
| `/[locale]/about`                          | SSG          | What the shop is and how buying works                                    |
| `/[locale]/contact`                        | SSG          | Channels from `SiteSetting`; says so plainly when none are set           |
| `/[locale]/track`                          | SSG          | Public tracking form (number + phone)                                    |
| `/[locale]/sign-in`                        | Dynamic      | Sign-in; `?next=admin` honoured only for staff                           |
| `/[locale]/sign-up`                        | Dynamic      | Create an account; optional — checkout never requires one                |
| `/[locale]/account`                        | Dynamic      | The customer's details and recent orders                                 |
| `/[locale]/wishlist`                       | Dynamic      | The products this customer saved; signed-in only, never indexed          |
| `/[locale]/compare`                        | Dynamic      | Two to four products side by side, entirely from `?ids=`; not indexed    |
| `/[locale]/account/orders`                 | Dynamic      | Full order history, paginated                                            |
| `/[locale]/admin`                          | Dynamic      | Dashboard: work waiting, each tile a link to it                          |
| `/[locale]/admin/orders`                   | Dynamic      | Order queue: status tabs, search, paging                                 |
| `/[locale]/admin/orders/[orderNumber]`     | Dynamic      | One order: status controls, timeline, customer, money                    |
| `/[locale]/admin/products`                 | Dynamic      | Catalogue list: published/draft tabs, search, paging, publish toggle     |
| `/[locale]/admin/products/new`             | Dynamic      | Add a product                                                            |
| `/[locale]/admin/products/[id]`            | Dynamic      | Edit a product; delete refused once it has been sold                     |
| `/[locale]/admin/brands`                   | Dynamic      | Brands: list, add, edit; delete refused once products use one            |
| `/[locale]/admin/categories`               | Dynamic      | Category tree; a category cannot descend from itself                     |
| `/[locale]/admin/product-types`            | Dynamic      | Product types, and which specifications each one asks for                |
| `/[locale]/admin/attributes`               | Dynamic      | Specification definitions; the value type locks once values exist        |
| `/[locale]/admin/blog`                     | Dynamic      | Buying guides: published/draft tabs, publish toggle                      |
| `/[locale]/admin/blog/new`                 | Dynamic      | Write a guide                                                            |
| `/[locale]/admin/blog/[id]`                | Dynamic      | Edit a guide; delete is a real delete — nothing points at an article     |
| `/[locale]/admin/coupons`                  | Dynamic      | Discount codes, each shown against its usage limit                       |
| `/[locale]/admin/coupons/new`              | Dynamic      | Create a code                                                            |
| `/[locale]/admin/coupons/[id]`             | Dynamic      | Edit a code; delete refused once an order has used it                    |
| `/[locale]/admin/reviews`                  | Dynamic      | Moderation queue: waiting / published / rejected, oldest first           |
| `/[locale]/admin/users`                    | Dynamic      | Roles and access (ADMIN only); no password is ever typed here            |
| `/[locale]/admin/delivery`                 | Dynamic      | Per-governorate fee and ETA                                              |
| `/[locale]/admin/settings`                 | Dynamic      | Store settings (ADMIN only)                                              |
| `/api/auth/*`                              | Route        | better-auth; not locale-prefixed (`proxy.ts` excludes /api)              |
| `/api/admin/upload`                        | Route        | Product image upload (staff only); a route, not an action, for body size |
| `/api/session/claim-cart`                  | Route        | Where OAuth lands: merges the anonymous cart, then forwards              |
| `/sitemap.xml`, `/robots.txt`, `/icon.svg` | Static       |                                                                          |

Also: `app/[locale]/loading.tsx`, `error.tsx`, `not-found.tsx`, and a
catalogue-shaped `products/loading.tsx`.

**Every link in the header and footer now resolves.** `/brands`, `/offers`,
`/guides`, `/about` and `/contact` were linked from the footer and 404'd — and
`/brands` and `/offers` were in `sitemap.xml` as well, so the site was handing
Google two dead URLs. The account icon points at `/account` now that it exists;
`/account` sends a signed-out visitor to `/sign-in?next=account` and they land
back on it, so the common case — already signed in — costs no redirect.
`/wishlist` was the last link the header withheld, and it is built now, so
every icon in the header resolves.

**The header and mobile drawer only link to routes that exist**, which is why
the account icon pointed at `/sign-in` for as long as `/account` 404'd. The
header still reads no session — that would opt every route into dynamic
rendering — so the link is the same for everyone and the destination decides.

**Redirects around the dashboard distinguish two cases**, because conflating
them produced a loop: _not signed in_ goes to `/sign-in?next=admin`, while
_signed in but not staff_ goes home. The sign-in page honours `?next=admin`
only for a user who can actually open the dashboard.

**The header must stay static.** It lives in the root layout, so any
`cookies()` read inside it opts _every_ route into dynamic rendering — that
turned the homepage and all 32 product pages into per-request renders when the
cart count was first added server-side. The count is therefore the one part of
the header that loads after hydration (`CartCountBadge`). Check the build
output for `●` on `/ar` and the product pages before assuming a change is
free.

### Catalogue URL contract

State lives in the URL so results are shareable, back-button-correct and
indexable. Parsed and clamped in `schemas/catalogue.ts` — params come from the
address bar, so they come from anyone.

```
?type=phone            product type key
&brand=tecno,samsung   csv
&category=flagship     csv
&ram=8,12  &storage=256   csv of integers
&min=200000 &max=900000   whole IQD (reversed range is swapped, not emptied)
&stock=1  &offer=1        strictly "1"
&q=سامسونج              search term
&sort=newest|price_asc|price_desc|best_selling
&page=1
```

Changing any filter resets to page 1. Invalid values fall back instead of
throwing.

---

## 9. Reusable components

**Primitives** — `components/ui/`: `Button` (variants primary/secondary/outline/
ghost/danger/link; sizes sm/md/lg/icon, 44px touch target), `Badge`, `Card`,
`Input`, `Skeleton`.

**Layout** — `components/layout/`: `SiteHeader` (server; only search, language
switcher and mobile nav ship JS. **Conditional classes go through `cn()`** —
`hidden sm:inline-flex` appended to a template literal already containing
`inline-flex` hid nothing, because CSS source order decides, not the order in
the string; the phone header carried 13 controls and customers tapped the
language switch while aiming for their account), `SiteFooter` (reserves bottom space for the
mobile buy bar), `MobileNav`, `LanguageSwitcher` (preserves path **and** query),
`Logo`.

**Product** — `features/product/components/`:

- `ProductPrice` — **the only place a price is rendered.** Wraps prices in
  `.numeric` (LTR isolation) so Arabic bidi cannot reorder digits.
- `ProductCard` — server component; image, brand, name, tagline, price, and one
  client control (the heart). It is an **`<article>`, no longer a `<Link>`
  wrapping everything**: a `<button>` inside an `<a>` is invalid HTML and breaks
  keyboard navigation, so the link moved onto the product name and stretches
  over the card with `after:absolute after:inset-0 after:z-0`, while the heart
  sits on `z-10` above it. `scripts/check-layout.mjs` selects `li > article`
  and had to move with it — a measurement tool that finds no cards reports a
  clean run. Carries
  **`w-full`**: it sits inside `<li className="flex">`, where a flex item
  defaults to `flex: 0 1 auto` and sizes to its own content, so without it every
  card was as wide as its product name was long — and since the image box is
  `aspect-product`, a wider card meant a taller image. Four cards in one row
  measured 209, 219, 161 and 155px across the uniform 292px grid columns
  beneath them. `pnpm check:layout` now measures this. Its text block is
  deliberately tight (`gap-1 p-3`, `leading-tight`, both lines clamped): at the
  five-column width a two-line Arabic name would otherwise push the card past
  half the viewport height.
- `ProductPurchase` — the page's **one** client island, and the only thing that
  knows which variant is selected. The picker and the mobile buy bar are two
  controls for one decision and used to hold it separately: the picker kept its
  own state, and the page handed the bar `product.variants[0]`, which it called
  `cheapest` although that query orders by `sortOrder`. So a shopper who chose
  256GB in Blue scrolled down and added 128GB in Black at a different price, and
  a product whose first variant was sold out showed a permanently disabled bar
  under a page that was selling fine. The page stays a Server Component and
  stays prerendered — this takes plain props, and the bar is `fixed` so its
  position in the markup does not matter. `tests/e2e/buy-bar.spec.ts` drives it
  at 390px and fails against the old wiring with the two prices it found.
- `VariantPicker` — client, and now controlled by `useVariantSelection`; keeps
  price, SKU and availability in sync; unreachable combinations are dimmed,
  never hidden. "Buy now" goes to `/checkout`, not `/cart`: a "buy now" that
  stops to ask again is "add to cart" with a longer name.
- `ProductGallery` — client; images + videos in one strip, player created on
  click only.
- `MobileBuyBar` — client; appears after 520px of scroll, `lg:hidden`.

**Wishlist** — `features/wishlist/`: `WishlistButton` (the heart, in an icon
shape for a card and a labelled one beside add-to-cart), `WishlistRefresher`
(only on `/wishlist`, so unsaving there removes the card and not just the
icon), `wishlist-store.ts` (one shared read per page — see §12).

**Compare** — `features/compare/`: `CompareToggle` (the tick, stacked under the
heart in the card's corner), `CompareTray` (in the storefront layout, renders
null until something is ticked, **sticky** so it can never cover the footer),
`CompareClearLink`, `compare-store.ts` (an external store over `localStorage`
— see §12).

**Reviews** — `features/review/`: `StarRating` (a server component; the partial
star is a clipped overlay, so 4.2 looks like 4.2 instead of rounding itself to
4.5 on the way to the screen), `ReviewSection` (the average, the 5-to-1
breakdown and the approved list — all of it the same for every visitor, so all
of it stays in the static half of a prerendered page), `ReviewComposer` (the
one part that knows who is looking, and therefore the only part that loads
after hydration), `ReviewForm` (a radio group wearing stars, because a radio
group is arrowable and announced as "3 of 5" and no number of `role`
attributes on a div matches that). `ReviewModeration` is in
`features/admin/components/`.

**Catalogue** — `features/catalogue/components/`: `FilterPanel`,
`ActiveFilters`, `SortSelect`, `MobileFilterButton`, `Pagination`.

**Search** — `features/search/components/search-box.tsx`: `SearchBox`,
`HeaderSearch`.

**Cart / checkout / order** — `features/cart|checkout|order/`:
`AddToCartButton` (one control for every surface; `redirectTo` turns it into
"buy now"), `CartLines`, `CartCountBadge` (client-side; see §8),
`CheckoutForm`, `OrderDetail`, `TrackForm`.

**Admin** — `features/admin/components/`: `form-fields.tsx` (`FormSection`,
`CollapsibleSection`, `Field`, `TextArea`, `Select`, `Checkbox`,
`RepeatableRow` — one definition shared by every admin form, so a second form
cannot quietly lose the invalid state or a label's `htmlFor`), `ProductForm`
(add + edit in one component), `ProductAttributeFields` (**the specification
inputs are generated from the chosen type's `ProductTypeAttribute` rows — this
file knows nothing about phones**), `ProductVariantsEditor` (options, then the
variants they generate), `ProductMediaEditor`, `ProductPublishToggle` /
`ProductDeleteButton` / `ProductRowDelete` (delete straight from the list; a
sold product renders as a disabled marker carrying the reason rather than an
absent control, so a row that cannot be deleted does not read as a missing
feature — the service refuses it again regardless), `AdminShell` (plain by design —
density beats atmosphere for someone processing forty orders a day),
`AdminRecordForm` (the frame all five single-record forms sit in — submit,
save state, translated errors, and a delete control that shows the reason it is
refused rather than going missing; it was `TaxonomyForm` until the guide editor
joined, and the name moved rather than the meaning quietly widening underneath
it), `BlogPostForm` + `BlogPublishToggle` (write a buying guide; delete here is
a real delete, because nothing points at an article),
`BrandForm` / `CategoryForm` / `ProductTypeForm` /
`AttributeForm` (the category parent picker never offers a category's own
descendants, and the product-type form is where a new type's specifications are
chosen — see §12),
`OrderActions` (buttons come from the state machine, so
an illegal move cannot be offered), `DeliveryRatesTable` (saves per row),
`SettingsForm`.

`OrderStatusBadge` lives in `features/order/`, not here: it describes an order,
not an administrator, and the customer's own history renders the same badge.
Only PENDING is brand-coloured, because it is the only one that means "act
now".

**Auth** — `features/auth/`: `SignInForm`, `SignUpForm`, `ForgotPasswordForm`,
`ResetPasswordForm`, `GoogleSignInButton` (rendered only
when Google is configured; the mark lives in `public/brand/google.svg` because
its four colours belong to Google, are not design tokens, and must never enter
`@theme`), `SignOutButton` (also drops `mps.recent_order` — see §7),
`auth-client.ts`.

**Order** — `features/order/`: `OrderDetail`, `TrackForm`, `OrderStatusBadge`,
`OrderHistory` (the account's list; every row links to `/orders/<number>`,
which checks ownership itself, so there is no second detail view).

**Domain helpers** — `lib/`: `money.ts`, `phone.ts` (Iraqi E.164 normalisation),
`search.ts` (Arabic folding + transliteration), `video.ts` (YouTube id
extraction), `domain/availability.ts`.

---

## 10. Design system

Tokens are defined once in `app/globals.css` under `@theme`. **No component
hard-codes a hex value.**

```
--color-primary       #e11b22   CTA, sale, active state — ONLY
--color-primary-hover #c4141b
--color-primary-soft  #fdecec
--color-ink           #0a0a0b   headings, primary text
--color-ink-soft      #2c2c30
--color-muted         #6b7280   secondary text
--color-subtle        #9ca3af
--color-surface       #ffffff   cards
--color-canvas        #fafafa   page ground
--color-border        #e7e7e9
--color-border-strong #d3d3d7
--color-success #0f8a4a   --color-warning #b45309   --color-danger #c4141b
                (each with a -soft companion)
--radius-control 0.5rem   --radius-card 0.75rem   --radius-panel 1rem
--shadow-card, --shadow-raised     (two shadows only, used sparingly)
--container-page 80rem
--spacing-section 4rem    --spacing-section-lg 6rem
--mobile-buy-bar-height 72px   reserved by the footer; bar measures 69px
--aspect-product 4 / 5    every product image, so the grid never reflows
```

`--mobile-buy-bar-height` and `--aspect-product` are owned by CSS **only**.
A mirrored TypeScript constant was removed because nothing read it and it
would have drifted; and an interpolated `aspect-[${value}]` would never be
generated at all, since Tailwind scans class names statically.

Brand colours (TECNO blue, Infinix green …) appear **only** as small identity
dots. They never become backgrounds.

**Typography**: IBM Plex Sans Arabic (Arabic) + Inter (Latin), self-hosted via
`next/font`. Arabic gets `line-height: 1.75` and **never** negative
letter-spacing — that is the detail that makes Arabic type look cheap.

**Custom utilities**: `container-page` (responsive gutters), `numeric` (tabular
figures + LTR isolation for prices/SKUs/phones), `flip-rtl` (mirrors
directional icons).

**Tokens are written `rounded-card`, `shadow-raised`, `accent-primary` — never
`rounded-[--radius-card]`.** That second spelling is Tailwind 3's shorthand for
`var(…)`. Tailwind 4 takes the arbitrary value literally, so it compiles to
`border-radius: --radius-card`, which is invalid and which **the browser drops
without an error**.

There were **159 of them**. Every card, button, input and panel in the shop had
square corners, both shadows did nothing, and every checkbox rendered in the
browser's default blue instead of the brand red — while the source read exactly
as intended and nothing failed. It was found by reading the compiled CSS
(`grep -o "border-radius:[^;}]*" .next/static/chunks/*.css`), which is now the
way to check any claim about what a class actually did. A guardrail fails on
`-[--` in any UI file, and it names the file and line.

`app/globals.css` imports Tailwind with **`source(none)`** and lists `app`,
`components` and `features` explicitly. Tailwind 4 otherwise scans the whole
project, including `docs/` and `tests/` — so the documentation explaining that
the broken spelling is broken was, by quoting it, compiling it into the
stylesheet.

**Responsive**: mobile-first. The catalogue grid is 2 columns on phones, 3 at
`md`, **5 at `xl`**; a homepage rail is 2, 4, then 5. Five, not four, because
four columns at 1280px made a card 292×502px — with the 4:5 image frame, half
the viewport for a single product, under two cards per screen. Five puts the
card at 230×445 and still ends every breakpoint on a full row: `RAIL_SIZE` is 5
and the fifth card is `hidden xl:flex`, so the four-column range never shows a
lonely card. The square frame was tried first and rejected — `1 / 1` crops the
tops off the phones.
Filters are a sidebar at `lg`, a bottom drawer below it. Every page must have
**zero horizontal overflow** at 390px and 1440px — verified with Playwright, not
assumed.

**Motion**: 150–250ms, ease-out, `prefers-reduced-motion` respected.

---

## 11. Bilingual / RTL

- Locales `ar` (default) and `en`, prefix **always** present.
- `dir` is set on `<html>` in `app/[locale]/layout.tsx`.
- **Layout uses logical properties only** — `ms-`, `me-`, `ps-`, `pe-`,
  `start-`, `end-`. Never `ml-`/`mr-`/`left-`/`right-`.
- Directional icons use `flip-rtl`. Logos and product images never flip.
- **Prices, SKUs and phone numbers render in Latin digits inside `.numeric`**
  in both locales — that is how Iraqi commerce is written, and bidi would
  otherwise reorder them.
- **All UI text lives in `messages/*.json`.** Currently **829 keys, identical
  in both files.** Parity is enforced by inspection before every commit; a key
  added to one file must be added to the other.
- Arabic copy is written natively, never machine-translated from English.
- `setRequestLocale(locale)` must be called in **every** layout and page that
  renders translated content, or the whole subtree opts out of static
  rendering.

---

## 12. Business logic

**Pricing** — `lib/money.ts`. Whole IQD integers. Percentage discounts round
**down** so the customer never pays more than the advertised saving.
`discountPercentage()` returns 0 when `comparePrice <= price`, so a fake
discount cannot render.

**Availability** — `lib/domain/availability.ts` is the single answer to "can
this be bought". Never read `onHand` directly. A product card shows "out of
stock" only when **no** variant is purchasable.

**Which variant a surface speaks for is in that module too**, because three
places answered it differently and each looked right alone:
`cheapestPurchasable()` picks **by price, not by position** — the card was
relying on the catalogue query ordering variants by price, which the product
page's query does not do — and `pricesDiffer()` decides whether a card says
"from". `null` when nothing is buyable, so the caller chooses whether to print
an unbuyable price under its own "out of stock" (a card must) or nothing.

**A status transition is a compare-and-set.** `advanceOrder` read the status,
checked the transition and wrote with `where: { id }` — so two staff in two tabs
both read PENDING, both found CONFIRMED legal and both wrote it. The order
landed in the right state by luck while everything that follows happened twice:
two timeline events for one move, a cancel releasing the same reservation twice,
a delivery settling the payment twice. The expected status is in the WHERE
clause now and `count === 1` is checked before any side effect; the loser is
told the order moved (`statusChanged`) instead of acting on a state that is
gone. Three integration tests fail against the old version — the fourth, a
double release, was already caught by the inventory UPDATE's own condition,
which is what "enforced twice" is for.

**Orders** — `lib/domain/order-state.ts`:

```
PENDING → CONFIRMED → PROCESSING → READY_FOR_SHIPMENT → OUT_FOR_DELIVERY → DELIVERED → RETURNED
   └──────────── CANCELLED from any pre-delivery state ────────────┘
```

Backwards and skipped transitions are rejected. DELIVERED cannot be cancelled —
only RETURNED. CANCELLED and RETURNED are terminal.

**Iraq specifics** — 19 governorates in the `Governorate` enum; per-governorate
`DeliveryRate` with fee and ETA; phone numbers normalised to E.164
(`+9647XXXXXXXX`), accepting `07…`, `+964…`, `00964…`, spaced, dashed and
Arabic-Indic digits; prefixes 75–79.

**Search** — `lib/search.ts` folds Arabic variants (أ إ آ → ا, ة → ه, ى → ي,
strips diacritics and tatweel) and maps common transliterations
(سامسونج → samsung, تكنو → tecno, ايفون → iphone …). Verified live: سامسونج
returns 4 products, تكنو returns 2.

**Cart** — `server/services/cart.ts`. Anonymous carts are keyed by an httpOnly
token (`mps.cart_token`, 32 CSPRNG bytes, 30 days); a signed-in user's cart is
keyed `user:<id>` **in the same column**, which is why every guest read now
carries `userId: null` and the cookie reader refuses anything that is not 43
base64url characters. Without both, a visitor who set
`mps.cart_token=user:<someone's id>` was handed that account's cart — they could
read it, add to it, and check out with it. Two halves rather than one because
either alone is a single `where` clause away from being lost again. Signing in merges the anonymous cart into it, summing
quantities and re-clamping. **Reads never write cookies** — Next only allows
`cookies().set` in a Server Action or Route Handler — so `findCart()` returns
null for a visitor with none, and only the write path mints a token.

**Checkout and orders** — `server/services/order.ts`. The client sends
`variantId` and `quantity`; the schemas have nowhere to put money. Every figure
is recomputed inside the transaction from the variant rows and `DeliveryRate`.
One transaction writes the order, the snapshotted `OrderItem`s, the COD
`Payment`, the first `OrderEvent` and the stock ledger, then empties the cart —
the cart survives so the visitor keeps their token.

**One confirmation is one order, and it took two guards.** Postgres runs at
READ COMMITTED, so two submissions that overlapped both read the lines, both
wrote an order and both deleted the same rows: the customer paid twice for one
basket, and the only thing in the way was a button the browser disables — which
a second tab, a slow network or a double tap all get past.

- The transaction opens by taking a **row lock on the cart**
  (`SELECT … FOR UPDATE`). The second submission waits there and then finds an
  empty cart, which is a refusal rather than a second order. This half depends
  on nothing the client sends.
- Waiting and then answering "your cart is empty" reads as a failure to
  somebody whose order DID go through, so an attempt carrying a key already
  used is handed the order it created. The browser generates one
  `crypto.randomUUID()` per checkout page; what is stored is the **hash of that
  id together with the cart id** (`lib/domain/checkout-request.ts`), because a
  bare client-chosen id would let a guess replay somebody else's order number
  back to whoever asked. The unique index on `Order.checkoutRequestId` is what
  makes the replay check a guarantee rather than a race of its own.
- **Only the lines the order snapshotted are deleted**, not the whole cart: the
  row lock stops a second checkout, not a second tab adding a cable. That one
  is argued rather than measured — a test that tried to land an insert inside
  the window passed against the broken code every time, so it was deleted
  rather than kept as a test that cannot fail (§17).

**`quoteDeliveryFor` takes the transaction client.** It used the global `db`
while being called from inside `placeOrder`'s transaction, so the fee an order
was written with came from a second connection, outside the transaction's
snapshot and outside the pool budget §18 sets for a build.

**Stock reservation is atomic.** Only variants with `trackQuantity` reserve
anything, and they do it with a conditional UPDATE:

```sql
UPDATE "inventory" SET "reserved" = "reserved" + $n
 WHERE "variantId" = $id AND "trackQuantity" = true
   AND "onHand" - "reserved" >= $n
```

A read-then-write in JavaScript lets two checkouts for the last phone both
pass, because both read before either writes — and the `reserved <= onHand`
CHECK does _not_ catch it, since both write the same value. An integration test
reproduces exactly that: with the naive version it sells one unit twice.

**Order numbers** — `lib/domain/order-number.ts`. `MPS-<YY><DDD>-<NNNN>`, e.g.
`MPS-26091-0042`. Never the database id: a cuid is unusable read aloud to a
courier, and exposing row identity invites enumeration. Tracking accepts what
people actually type — lowercase, spaced, prefix omitted, Arabic-Indic digits,
en dash.

**Allocating that number was wrong in two ways, and both cost a customer their
checkout.** Found while building coupons, by refusing to believe a concurrency
test that passed.

- **It counted the day's orders.** Delete one from the middle of a day — which
  is exactly what a test suite tidying up after itself does — and the count
  drops while the numbers above it stay, so the next order is handed one that
  already exists. It now reads the **highest number issued that day** and adds
  one (`sequenceFromOrderNumber`). Deleting the highest order does free its
  number again, which is fine: nothing holds it.
- **The retry loop could not work.** Two simultaneous checkouts both built the
  same number and the second `INSERT` violated the unique index — at which
  point **Postgres aborts the whole transaction** (25P02, "current transaction
  is aborted, commands ignored until end of transaction block"). The next
  attempt then ran against a dead transaction and threw something unrelated, so
  the customer met "something went wrong" on an order that should simply have
  been numbered one higher. A transaction-scoped advisory lock
  (`pg_advisory_xact_lock`, keyed on the day) removes the race instead of
  reacting to it, and releases on commit or rollback. An integration test
  places two orders at once and asserts two different numbers; it fails against
  the old code with the constraint error itself.

**Coupons** — `lib/domain/coupon.ts` for the rules,
`server/services/order.ts` for applying them, `admin-coupons.ts` for writing
them.

- **The client sends the code, never an amount** (§13.7). `evaluateCoupon` is
  the only thing that decides what a code is worth, it takes the clock as an
  argument so a test can pin it, and the order transaction runs it again from
  the row — so what was quoted and what is charged come from one function.
- **A quote never consumes a use.** Refreshing the checkout page would
  otherwise burn a single-use code.
- **"No such code", "switched off" and "out of season" answer identically.**
  Distinguishing them turns the box into a way to discover the shop's codes and
  when they run — the same reasoning as the single sign-in error and the
  tracking form. The refusals that do name a reason are the ones about the
  customer's own order: too small, exhausted, already used.
- **A bad code fails the whole order** rather than being dropped. Placing it at
  full price is worse: the customer pressed the button expecting a discount and
  would find out when the courier asked for more money.
- **The per-user limit only binds a signed-in customer.** `CouponUsage.userId`
  is the only identity a usage row carries, and a guest checkout has none. The
  global `usageLimit` still applies and is the control that actually bounds the
  cost. Written down rather than faked — keying it on a phone number would be a
  new column and a claim that phone numbers are accounts.
- **The use is claimed with a conditional UPDATE**, the shape stock reservation
  uses. Measured honestly: the advisory lock above already serialises checkout
  for the day, so a read-then-write passes the concurrency test too. It stays
  because the invariant — a ten-use code is used ten times — must not depend on
  where an unrelated lock happens to sit, exactly as `reserved <= onHand` is
  enforced twice.
- **Deleting a used code is refused.** `CouponUsage.couponId` cascades, so the
  delete would erase the record of which orders were discounted while the
  discounts stay on those orders — money missing from the books with nothing
  left to explain it. Deactivating is the answer.

**`Offer` is still schema-only, deliberately.** It would be a _second_ way for a
product to have a discounted price, beside `comparePriceIqd` — which is what
the storefront, `/offers` and the "no fake discounts" CHECK constraint already
use. Two mechanisms mean deciding which wins on every product page, every card
and every line of a cart, and getting that wrong shows a customer one price and
charges another. Coupons do not have that problem: they price an order, not a
product. Revisit when the owner actually needs a campaign that
`comparePriceIqd` cannot express.

**Order tracking is rate limited per phone number**, five attempts a quarter
hour, in `server/rate-limit.ts` with the window arithmetic in
`lib/domain/rate-limit.ts`. The numbers are sequential by design — they have to
be readable aloud to a courier — so anyone who knew a customer's phone could
walk a day's four digits and read back their name and address; ten thousand
requests is an afternoon. The key is the **phone**, not the IP, because that is
the value the attack cannot vary, while an IP rotates freely and behind a proxy
is only as trustworthy as a header anyone can write. A customer needs one
attempt, or two after a typo. The counter is in process, so it does not survive
a restart and is not shared between instances: an honest limit while the store
is one Next process, and a counter table the day it is not. Verified by
tripping it on the built site — the sixth attempt answers "too many attempts"
in Arabic.

**Access to an order** is never the URL alone, because the numbers are
sequential. It needs a **Guest Order Grant**, a session that owns it, or the
phone number via the tracking form. A wrong phone and a non-existent order
return the same message, so the form cannot be used to discover which numbers
are real. Tracking is a POST, not a GET: a phone number in a URL lands in
history, logs and Referer.

**The grant replaced a cookie that carried the order number itself**, and that
cookie was the live hole this file described as a control. `mps.recent_order`
held `MPS-26091-0042`, and the check was that it equalled the number in the
URL. `httpOnly` stops JavaScript READING a cookie; it does nothing about a
client SETTING one — so anybody could type a number into their own browser and
walk a day's four digits, reading back each customer's name, phone and home
address. Ten thousand requests is an afternoon, which is exactly the argument
that put a rate limit on tracking; tracking was hardened and this was not.

- `mps.order_grant` now carries **32 CSPRNG bytes** (`lib/domain/order-grant.ts`),
  issued at checkout and again after a successful tracking lookup — the two
  moments somebody proves the order is theirs.
- **Only the SHA-256 is stored**, on `Order.guestAccessHash`, for the reason a
  password hash exists: a leaked backup of the `order` table must not be a set
  of working keys. It is a unique index, so the lookup is a seek.
- **The hash is matched in SQL**, never compared in JavaScript against a row
  fetched first. The unauthorised answer is then identical to the answer for an
  order number that was never issued, and there is no string comparison to time.
- **Clearing the column is the revocation**, and `guestAccessExpiresAt` bounds
  it to a day regardless. Issuing a new grant replaces the old one, so the most
  recent browser to prove ownership is the one that holds it.
- **A browser still holding `mps.recent_order` gets nothing**, which is the
  correct answer for a credential that has been withdrawn: an order number is
  not a grant shape, so it is refused before the database is asked.

Payment is COD only today, behind `PaymentMethod`, so an Iraqi gateway can be
added without touching order code.

**Editing the catalogue** — `server/services/admin-products.ts`, with the pure
parts in `lib/domain/product.ts`. One transaction per save; a product whose
variants were written but whose specifications were not would render an empty
spec table with nothing to say it failed.

- **Specifications are routed by their own definition.** `parseAttributeValue`
  decides which of the five typed columns a value lands in, from the
  `AttributeDefinition.type`. A key the chosen product type does not declare is
  rejected rather than stored — a stray row would never render (the product
  page reads through `ProductTypeAttribute`) and would survive every later
  edit unseen. A cleared optional attribute loses its row; an absent
  specification is hidden, while one stored empty renders a blank line.
- **An option value is identified by its option, not by its name.**
  `writeOptions` returned one flat map keyed on `valueEn` across every option,
  so "Standard" as an edition and "Standard" as a warranty collided: the second
  row overwrote the first, and every variant referencing the first was linked to
  the second option's row. The product then rendered a picker whose combinations
  did not exist, and the variant a customer chose was not the one they saw. The
  schema allows the duplication on purpose — a strap and a case can both be
  Black — so the fix is identity, not a ban on the name.
- **Options are replaced wholesale; variants never are.** Options carry no
  history. Variants are referenced by `CartItem` (cascade) and `OrderItem`
  (set null), so they are matched by id then SKU and updated in place. A
  removed variant that was never ordered is deleted; one that **was** ordered
  is deactivated instead, and the count is reported so the owner is told rather
  than left guessing.
- **`minPriceIqd` is recomputed from what was actually written**, not from what
  the form claimed, and excludes inactive variants — a price nobody can buy is
  a bait price.
- **Deleting a product that appears in any order is refused.** `SetNull` would
  cut past invoices loose from the row they were sold from; the snapshot keeps
  them rendering, which is exactly what makes the damage invisible.
  Unpublishing is the reversible answer, and the error says so.
- **A unique-constraint violation names its own field.** Which field _is_ the
  message, and only the constraint name distinguishes slug from SKU. Reading it
  is `server/db/diagnose.ts`'s job, because Prisma reports it in two different
  shapes and **the pg driver adapter this project uses leaves `meta.target`
  undefined** — a reader that only knows `target` passes every unit test and
  then silently degrades to "something went wrong" against the real database.
  That is exactly how it was found here.

**Shaping the catalogue** — `server/services/admin-taxonomy.ts`, with the pure
parts in `lib/domain/taxonomy.ts`. This is what finally makes §6's "adding
laptops is one `ProductType` row and some attribute rows — no code" reachable:
it was true and useless, because it needed a database client. Brands,
categories, product types and attribute definitions are now created from the
dashboard, and the product form grows the new type's fields without a line
changing — verified by driving the built site, where inventing a type and
linking two new specifications made the product form ask for exactly those two,
and switching to "phone" swapped them for its 19.

- **A row something points at is never deleted, it is deactivated.** Brands,
  categories and product types are referenced by products, and products by
  orders. Each delete counts the rows in the way first and refuses with that
  number, because Postgres would refuse it too — as a foreign-key error nobody
  can read. Deleting a category with children is refused for a different
  reason: `CategoryTree` is `SetNull`, so it would silently promote them to the
  top level, and the grouping would be gone with nothing saying so.
- **A category cannot descend from itself.** Not a crash if allowed — the loop
  detaches from every root, so the branch disappears from the tree and from the
  storefront's navigation with its products still attached. The parent picker
  never offers a descendant, and the service refuses it again.
- **An attribute's `type` locks once values exist.** `parseAttributeValue`
  routes a value into one of five typed columns from it, so changing it strands
  every stored value in the wrong column — present, invisible on the page, and
  surviving every later edit unseen. The form disables the control and says how
  many values are in the way; a new attribute is the answer.
- **Product-type attribute links are replaced wholesale; attribute options
  never are.** A `ProductTypeAttribute` carries no history — the stored value
  lives on `ProductAttributeValue`, which points at the _definition_ — so
  unlinking hides the field and keeps the data, and re-linking brings it back.
  An `AttributeOption` **is** pointed at, by `ProductAttributeValue.optionId`,
  so options are matched by value and updated in place, and one still in use is
  left alone rather than deleted.
- **A unique violation names slug or key by the column, not the word.**
  Postgres calls the index on `Brand.slug` `brand_slug_key`, so an
  `includes('key')` test reported every duplicate slug as a duplicate key and
  sent the owner to fix the wrong field. `collidingField()` in
  `lib/domain/taxonomy.ts` strips that suffix first. An integration test caught
  it; no unit test could have, because the index name only exists once Postgres
  has refused the write — so both tests now exist, and the unit one covers the
  shapes.

**The pages around the store** — `/brands`, `/offers`, `/guides`, `/about`,
`/contact`. All five were linked from the footer and 404'd; two were in the
sitemap as well. They are built to the same rule: **nothing on them is written
in code that belongs to the owner.**

- `/brands` and `/offers` reuse `getBrands()` and `getCatalogue({ onOfferOnly })`
  rather than querying for themselves, so filtering and paging stay in SQL (§5)
  and a brand added from the dashboard appears with no further work. "On offer"
  needs no judgement: a `comparePriceIqd` may only exist when it is strictly
  greater than the price, which a CHECK constraint enforces.
- `/guides` is **articles first, then the shop's own data** — and the order
  records the history. There were no articles for a long time: `BlogPost` sat
  in the schema with no screen to write into it, and a guides page backed by an
  empty table is a permanently empty page. So it was built from live data —
  real product types, real brands, and budget bands computed from the real
  minimum and maximum price by `lib/domain/price-bands.ts`. Now the owner can
  write (`/admin/blog`), the articles go above that, **and the entry points
  stay**: with nothing published the page is exactly what it was. Nothing on it
  can render empty, and no buying advice lives in code where the owner cannot
  correct it (§13.12, §13.13).
- `/contact` reads `server/queries/site.ts`, a **public** read that names its
  columns, separate from the `requireAdmin()` one in `admin-settings.ts`. Every
  channel is optional because the row genuinely starts empty: a `tel:` link to
  nothing is worse than a line saying the number is not published yet, so the
  page says so and points at order tracking, which needs no phone call.
- `/about` states only what is true of the software as built — cash on
  delivery, delivery to every governorate, prices in dinars. No claim about
  experience, volume or reputation (§13.12). The governorate count is read from
  the enum, so it cannot drift from what checkout offers.

**Writing the guides** — `server/services/admin-blog.ts` and
`server/queries/blog.ts`, with the format in `lib/domain/blog.ts`.

- **The body is parsed into blocks, never into HTML.** `## ` opens a
  subheading, `- ` a bullet, anything else is a paragraph, and the result is
  rendered as React elements. A Markdown library would be a dependency to pin,
  an XSS surface to argue about and a third thing for the CSP to accommodate —
  for a page whose whole requirement is headings, paragraphs and bullets. What
  the owner types is text **by construction**: there is no code path from the
  parser to markup, so a pasted `<script>` is a sentence.
- **Two columns decide whether an article is live**, and both are checked in
  SQL: `isPublished` is the owner's decision, `publishedAt` is when it takes
  effect. A guide dated next Friday is published and still hidden, which is
  what lets three be written on a Sunday and let out one at a time.
- **The public read cannot return a draft**, because it has no parameter that
  could ask for one. `server/queries/blog.ts` is a separate module from
  `admin-blog.ts` rather than a shared function with an `includeDrafts` flag —
  a flag is one wrong argument away from putting an unfinished article on the
  shop floor. Nine integration tests say so against a real database.
- **One slug in both locale columns**, exactly as products do it, so
  `/ar/guides/<slug>` and `/en/guides/<slug>` are the same URL and hreflang has
  something to pair.
- **Delete is a real delete.** Nothing points at a `BlogPost` — no order, no
  cart, no product — so the "deactivate, never remove" rule that governs the
  catalogue has nothing to protect here. That is the only way this service
  differs in shape from `admin-taxonomy.ts`.

**The wishlist** — `server/services/wishlist.ts`, `server/queries/wishlist.ts`,
and `features/wishlist/` for the button. It holds no money, no stock and no
promise, so only the non-obvious rules are written down.

- **It belongs to an account, and that is the schema's decision.**
  `Wishlist.userId` is required and unique: there is no anonymous list and no
  token to guess, so nothing merges on sign-in the way a cart does. The heart
  therefore renders as a **link to sign in** for a signed-out visitor rather
  than a button that quietly does nothing.
- **That link does not carry the product in `?next=`.** The sign-in page
  compares `next` against the literal "admin" and never uses it as a redirect
  target, which is exactly what stops a crafted value bouncing a visitor
  off-site (§8). Saving one navigation is not worth turning it into a real
  destination.
- **Only a published product can be saved.** The id arrives from a button, so
  it arrives from anyone. The new foreign key guarantees the product exists;
  this guarantees it is one the customer was allowed to see.
- **An unpublished product is hidden from the list and counted, not dropped.**
  Its page is off the shop floor, so its card would be a dead link — and
  vanishing in silence is worse, because the customer saved it and would decide
  the list lost it. The row stays and republishing brings the card back.
- **The heart reads its state after hydration, once per page.** The homepage
  and all 32 product pages are prerendered, and a `cookies()` read during
  render would turn every one of them into a per-request render (§8) — the same
  constraint that put `CartCountBadge` on the client. A catalogue page has 24
  hearts, so the promise is cached at module scope in `wishlist-store.ts`: the
  first button to ask starts the request, every other one awaits it. Module
  scope rather than a React context, for the reason `cart-events.ts` gives.
- **The flip is optimistic and the write is not confirmed by it.** A heart that
  waits for a round trip before filling in reads as a broken button. The cost
  is real and accepted: navigating in the same instant cancels the request, and
  nothing is saved. The e2e test was written believing the optimistic flip and
  failed for exactly that reason (§17).
- **Nothing in the browser is authorization.** The cached set decides which
  icon is drawn. Which list is read and written is decided in the service, from
  the session, every time — four integration tests exist to say so, two of them
  about one account reaching another's list.

**Comparing products** — `lib/domain/compare-url.ts` and `lib/domain/compare.ts`
for the rules, `server/queries/compare.ts` for the read, `features/compare/`
for the tick and the tray.

- **The comparison is the URL; the selection is not.** `?ids=slug,slug` is the
  whole state of the page, because a comparison is a thing worth sending to
  somebody — "which of these two, then?" is why it exists. The ticks being
  assembled across the catalogue, a homepage rail and the wishlist are a
  different thing: a per-viewer convenience with nothing to share, so they live
  in `localStorage`. An e2e test opens the finished link in a **second browser
  context**, which is the only way to prove the page does not depend on them.
- **Slugs, not ids.** They are stable by design (§6), they read in a shared
  link, and they do not expose row identity the way a cuid does.
- **Four.** A fifth column leaves 78 pixels per product at 390px. The tick says
  so when the list is full rather than silently refusing — a control that does
  nothing is indistinguishable from one that is broken.
- **The rows come from the products' own specifications**, reached through
  their product type's `ProductTypeAttribute` links, so nothing here knows what
  a phone is and a type invented from the dashboard compares on its own
  specifications with no code changing (§6).
- **The union, not the intersection.** Comparing a phone with a cable is a thin
  table, not an error; an intersection would render an empty page and read as
  broken. Rows where the products agree are shown but not emphasised, and a
  product with **no** value is a dash — a missing specification is missing
  information, not a difference, and highlighting it would point the shopper at
  whichever product simply has fewer fields filled in.
- **The tray is `sticky`, not `fixed`, and that is the whole clearance story.**
  The footer's gap under the mobile buy bar was a real bug that shipped and
  went unmeasured for a phase (§15); a second fixed bar would be a second
  chance at it, with a spacer whose height has to track content that wraps.
  Sitting in normal flow between `main` and the footer, it cannot cover
  anything and there is no number to keep in step. An e2e test measures it, and
  was proved by switching to `fixed` — 482px of the footer covered.
- **`localStorage` is read through `useSyncExternalStore`**, not in an effect.
  It cannot be touched during render without a hydration mismatch, and reading
  it in an effect to call `setState` is the pattern
  `react-hooks/set-state-in-effect` exists to stop. The store also listens for
  the `storage` event, so two open tabs cannot disagree about what is ticked.
- **The table is the one element allowed to scroll sideways**, inside its own
  box: four columns of specifications do not fit a phone, and shrinking the
  text until they do is worse. The page itself still has zero horizontal
  overflow, which the layout spec checks.
- **Not indexed** (`robots: index: false, follow: true`). The page is one
  combination of `?ids=` out of a factorial number of them, each a thin
  rearrangement of pages Google already has.

**Reviews** — `lib/domain/review.ts` for the arithmetic,
`server/services/review.ts` for writing one, `admin-reviews.ts` for moderating,
and `server/queries/review.ts` for both reads.

- **Only a customer with a DELIVERED order for the product may write one.**
  This is the decision the whole feature turns on, and it is not what the
  schema's own comment anticipated — `isVerifiedPurchase` was written as a
  badge on reviews anybody with an account could leave. That is the wrong trade
  here: email verification is off (§7), so an account costs nothing to create,
  and a competitor with ten of them can fill the queue faster than one person
  reads it. Requiring delivery makes every review genuine by construction and
  bounds the queue by actual sales.
- **`isVerifiedPurchase` is still written, and still true every time**, for the
  reason `Inventory.trackQuantity` exists: it is the column that stops the
  other rule being a schema change. Relaxing the requirement later is one line
  in the service.
- **The eligibility rule has exactly one copy**, `hasDeliveredOrderFor()`, and
  it had two until a deliberate break went unnoticed. The query decides what to
  RENDER and the service decides what to ACCEPT; with the join written twice,
  loosening the service's copy left the page still saying no while the write
  went through, and the test meant to catch it passed because it only exercised
  the other copy (§13.16).
- **A review arrives PENDING and nothing a customer types reaches a product
  page until a human has read it.** The customer is told so before they write,
  and told why: to keep out advertising and abuse, not to hide criticism.
- **`Product.ratingCount` and `ratingSum`, not an average.** An average column
  bakes a rounding decision into storage, and 4.666 stored as 4.7 cannot be
  added to. The average is derived where it is shown, by a pure function that
  returns **null** for a product with no reviews — never 0.0, which is a rating
  nobody can give and a claim the shop would be inventing (§13.12).
- **The aggregates are recomputed from the rows inside the moderating
  transaction**, never adjusted by a delta: a delta is right until it is
  applied twice, and then the number is wrong forever with nothing to say when
  it drifted. Two CHECK constraints refuse an impossible result — a negative
  count, or a sum outside `[count, count × 5]` — so a broken recompute fails
  loudly rather than rendering a seven-star product.
- **Rejecting and deleting answer different questions.** Rejecting hides the
  review and keeps the record of who decided and when; deleting is for text
  that should not be stored at all — a phone number, an address, abuse aimed at
  a person. Both recompute, because rejecting one that was approved has to take
  its stars back out.
- **What a customer typed is rendered by React**, in a paragraph, with
  `whitespace-pre-line` for their own line breaks. There is no path from the
  body to markup, so a pasted `<script>` is a sentence — the same property the
  buying guides have by construction.
- **The public read cannot return an unapproved review**, because it has no
  parameter that could ask for one; moderation reads through a separate module
  behind `requireStaff()`. And it never selects an email: the page is public.
- **There is no "highest rated" sort, deliberately.** One five-star review
  would outrank fifty averaging 4.8. That needs a weighted average, and a
  weighted average needs enough reviews to weight — revisit when the catalogue
  has them, with `minPriceIqd` as the precedent for a column to sort on.
- **No stars on the product card, yet.** A rating line rendered only for
  products that have one makes cards different heights, which is the exact bug
  `pnpm check:layout` exists to catch (§9); reserving the line for every card
  wastes it on a shop where most products have no reviews. Revisit when most
  of them do.

**Handing out access** — `server/services/admin-users.ts`, with the rules in
`lib/domain/user-roles.ts`.

- **There is no "create a staff account".** The employee registers at
  `/sign-up` and an admin promotes them. The alternative is an admin typing
  somebody else's password into a form, which means knowing a credential that
  is not theirs and would put hashing in this module rather than better-auth's
  (§7). One extra step for the employee buys that, and the screen says so — an
  absent "add user" button otherwise reads as a missing feature.
- **Four things are refused, all unrecoverable from inside the app**: changing
  your own role, deactivating yourself, and demoting or deactivating the last
  active admin. A store with no reachable ADMIN needs a database client to fix,
  which is the situation this screen exists to end. Changing your own role is
  refused even when other admins exist — the click cannot be undone from where
  you are standing, and "ask a colleague" is not a recovery path for a shop
  with two staff.
- **Self is checked before the count**, so the last admin demoting themselves
  reads "you cannot change your own role" rather than being sent to look for a
  second account they do not need.
- **Only ACTIVE admins count.** An inactive one cannot sign in to unlock
  anything (§7), so counting it would let the store be emptied.
- **Deactivating deletes the sessions too.** The guard already rejects an
  inactive user holding a valid cookie; this is the difference between "cannot
  act" and "is signed out", and a dismissed employee should see the latter
  immediately.

---

## 13. DO NOT CHANGE without explicit owner approval

1. **Money as `Int` whole IQD.** Not Decimal, not Float, not fils.
2. **Availability is a status.** Do not reintroduce quantity as the primary
   mechanism; `trackQuantity` is the opt-in path.
3. **No phone-specific columns on `Product`.** New specs are
   `AttributeDefinition` rows.
4. **Variants stay option-driven.** No `ramGb` / `storageGb` / `colorAr`
   columns — those were removed once already.
5. **All text in `messages/*.json`**, both files at equal key count.
6. **Logical CSS properties only** for layout.
7. **Server recomputes every price.** The client never sends money.
8. **Components never import Prisma.**
9. **Version pins**: prisma 7 (8.x is a release candidate), eslint 9 (10 breaks
   `eslint-plugin-react` via `eslint-config-next`), vitest 4 (`better-auth`
   peer range), pnpm 11 via `packageManager`.
10. **pnpm 11 config lives in `pnpm-workspace.yaml`**, and the install-scripts
    allowlist is `allowBuilds` — the `pnpm` field in package.json is ignored.
11. **pnpm 11's `minimumReleaseAge` policy is never relaxed.** If the lockfile
    holds a package published in the last 24 hours, rebuild the lockfile.
12. **No invented data.** No fabricated benchmarks, reviews, sales figures or
    stock levels. Demo data is labelled and refuses to run in production.
13. **No hard-coded commercial information.** Prices, delivery fees, warranty
    terms and contact details come from `SiteSetting` / `DeliveryRate`.
14. **Next 16 uses `proxy.ts`**, not `middleware.ts`.
15. **Guardrails are never weakened to make a change pass.** If
    `tests/architecture.test.ts` or an ESLint boundary rejects your code, the
    code is wrong, not the rule. Changing a guardrail needs the same owner
    approval as anything else on this list — that is the entire point of
    writing them down as tests.
16. **One source of truth per value.** A design token lives in `@theme`, a
    tuned number in `config/ui.ts`, a link in `config/nav.ts`, commercial data
    in the database. Mirroring a value into a second file is how the two copies
    start disagreeing; a constant with no consumer is the same bug, waiting.

---

## 14. Implementation status

### Complete

**Phase 1 — Foundation**: project setup, design tokens, i18n + RTL, full
database schema with constraints, better-auth + RBAC, seed, guided `pnpm setup`,
editor config, Arabic docs.

**Phase 2 — Storefront**: homepage (hero, shop-by-type, trust, featured / new /
best-seller rails, brands, final CTA); catalogue with 6 filter dimensions,
4 sorts, facet counts and pagination; Arabic + English search; product detail
with dynamic per-type specification table, variant picker, gallery with video,
sticky mobile buy bar, related products; Product JSON-LD; dynamic sitemap and
robots; 32 product pages pre-generated.

**Phase 2.5 — Maintainability**: the layer that makes later change cheap and
safe. 15 architecture guardrails in `tests/architecture.test.ts`; per-directory
import boundaries in `eslint.config.mjs`; navigation consolidated into
`config/nav.ts` (header, mobile drawer and footer previously kept three copies
in step by hand); tuned numbers into `config/ui.ts`, each with a consumer and a
test proving it; buy-bar height and product aspect ratio promoted to `@theme`
tokens with their duplicate TS constants removed; CI running the full
`pnpm check` against a real database; and `docs/extending-ar.md` so the owner
can make routine changes without reading code.

**Phase 3 — Commerce**: anonymous + signed-in cart with an httpOnly token and
login merge; Server Actions taking ids and quantities only; cart page with
live quantity control; header count; checkout in six fields with a live
delivery quote from `DeliveryRate`; order placement in one transaction with
price snapshots, COD payment, timeline event and atomic stock reservation;
confirmation page and public tracking by number + phone. Verified end to end by
driving the built site: add → badge → cart → quantity → checkout → order →
tracking, plus a second browser proving an order does not leak.

**Phase 5.1 — the catalogue in the owner's hands**: add, edit, publish and
delete products from the dashboard. The specification fields are _generated_
from `ProductTypeAttribute`, so a new product type is data entry and this code
does not change — proved by an integration test that invents a product type
with its own integer, text and enum specifications and saves a product of it
through the ordinary service. Options and the variants they generate are edited
together, with a one-click matrix generator. Editing never destroys history: a
variant is matched by id then SKU and updated in place so live carts and past
order lines keep pointing at it, a removed variant that was sold is deactivated
rather than deleted, and deleting a product that appears in any order is
refused outright. Verified by driving the built site: signing in, switching the
product type and watching 19 phone specifications become 6 accessory ones,
generating variants, saving, and finding the product live on the storefront
with its specs, options and price.

**Phase 5.2 — photography**: images upload to **Supabase Storage** through
MPS, never from the browser directly. A signed URL handed to the client would
move the "is this really a photograph?" question to the client, where it is
advice; proxying keeps it an answer. What a file _is_ is decided from its own
bytes in `lib/domain/image-file.ts` — an allowlist of raster signatures, so a
renamed SVG is refused and a format nobody thought about is refused by default.
The stored object reuses nothing the uploader chose: the folder is the
product's slug, the name is 16 random bytes, the extension and `Content-Type`
come from the format actually detected. Uploads are **optional**: with no keys
configured the form asks for a path under `public/`, which is all a local
machine needs.

**Verified against the owner's real Supabase project**, not just in code:
`pnpm check:services` uploaded a file and deleted it again, which is the pair
that matters — writing proves the key, deleting proves it is the privileged
one and that the bucket's policies are what §18 describes. The dashboard's
"upload an image" button works on their machine.

**Phase 5.3 — Google sign-in**: optional, additive, and conditional on the
local account being verified before anything is linked (§7). Needs no schema
change — better-auth's `Account` table already carries the provider tokens.

**Phase 5.4a — the catalogue's shape in the owner's hands**: brands,
categories, product types and specification definitions, all from the
dashboard. Adding "laptops" is now genuinely complete without a database
client: create the specifications, create the type, tick the ones it asks for,
and the product form draws them. Proved twice — by an integration suite that
invents a type through the ordinary services and asserts the product form's
reference data grows, and by driving the built site through sign-in, two new
specifications (one decimal with a unit, one enum with options), a new type,
and a product form that then asked for exactly those two and swapped them for
19 on switching to "phone".

**Phase 6 (part) — the flows are no longer driven by hand**: a Playwright
suite in `tests/e2e/` drives the built site — buy a phone and track it, fail to
read somebody else's order, run the dashboard — plus the two layout claims that
could regress silently. It runs in CI after the build. Every test was checked
against a deliberate break before being believed: the cart's line total, the
footer's reserved gap and the copy guardrail were each violated on purpose and
the right test went red.

**Phase 6 (part) — the security review**: a pass over every Server Action,
route handler, admin query and service, the headers, and what reaches the
browser. It found one live vulnerability and three things that were a change
away from being one:

- **An open redirect**, exploitable without signing in.
  `/api/session/claim-cart?next=/\evil.example` answered
  `Location: http://evil.example/` — the check was `startsWith('/') &&
!startsWith('//')` and the URL parser reads a backslash as a slash, so the
  one shape it was written to stop got through in a second spelling.
  `lib/safe-redirect.ts` now asks that same parser instead of out-guessing it:
  resolve against a throwaway origin, accept only if the origin survived.
- **JSON-LD serialised with `JSON.stringify`**, which leaves `</script>`
  intact. Measured on the built site it does **not** execute — the tag is
  inserted client-side, and a script inserted that way never runs — so this was
  hardening, not a hole. But the comment beside it read "never from user
  input", and Phase 5.1 made that false: staff type product names now.
- **No CSP, no HSTS.** Both now built in `lib/security-headers.ts`, with the
  nonce deliberately refused (§18).
- **Order tracking had no rate limit** — the one public action that answers
  with a name and an address, against order numbers that are sequential by
  design (§12).

A guardrail was also found admitting the failure it existed to prevent: it
accepted `requireUser()` in an admin module. No module was ever wrong; the rule
was. Each fix was proved by putting the old code back and watching the right
test go red.

**Phase 6 (part) — the performance pass**, which began by measuring and
therefore did the opposite of what was planned.

The plan was a cache layer; §15 had carried "catalogue runs 2 queries per
visit" as the reason. Both halves were wrong. The catalogue runs **12**
queries — and they cost **4.8 ms of a 34 ms response**, so a cache would have
bought about five milliseconds at the price of serving a stale price or a
draft product. It was refused, with the numbers written down (§15).

What the measuring actually found was **1048 kB of JavaScript on the
catalogue**, a third of it Zod. Three client components imported two pure URL
helpers from `schemas/catalogue.ts`, and importing anything from a module that
imports Zod ships Zod. The same mistake in `schemas/auth.ts` — a module whose
header said it validated on both sides, which **nothing on the server
imported** — cost every auth page and the whole dashboard another 432 kB.

| page           | before  | after   |
| -------------- | ------- | ------- |
| `/ar/products` | 1048 kB | 670 kB  |
| `/ar/sign-in`  | 1074 kB | 642 kB  |
| `/ar/admin/*`  | 1645 kB | 1213 kB |

Zod is now absent from every page a customer opens. The pure parts live in
`lib/domain/catalogue-url.ts` and `lib/domain/auth-form.ts`, unit-tested in
plain Node; the schemas that guard the server did not move and did not change.
Two e2e tests hold the line — a byte budget and an explicit "no validation
library in the browser" — and both were proved by putting the import back and
watching them report 1048 kB again.

**Phase 5.5 — the buying guides the owner asked for**: `BlogPost` had been in
the schema since Phase 1 with no screen to write into it, which is exactly why
`/guides` was built from live data instead. The editor is now at `/admin/blog`
— write, publish, schedule, delete — and the articles appear above the entry
points, which stay. With nothing published the page is unchanged, so it could
ship before a single guide was written. Verified by driving the built site:
signing in, writing a guide in both languages, publishing it, and finding it on
`/ar/guides`, at `/ar/guides/<slug>` and at `/en/guides/<slug>` with its
headings and bullets intact.

**Phase 5.6 — offers and coupons**: a discount code box at checkout, and the
screens to write the codes at `/admin/coupons`. `orderTotals` has taken a
`discountIqd` since Phase 3 and nothing ever computed one; it does now. The
rules are pure and take the clock as an argument
(`lib/domain/coupon.ts`), the order transaction runs them again from the row
rather than trusting the quote, and the use is claimed with the same
conditional UPDATE shape as stock. `Offer` stays schema-only deliberately, for
a reason §12 states rather than leaves implied.

This phase also paid for **three bugs on the money path, all found by refusing
to believe a concurrency test that passed** (§12): order numbers allocated by
counting a day's orders, so deleting one from the middle handed the next
customer a number that already existed; a retry loop that could not run,
because a unique violation aborts the whole Postgres transaction (25P02); and a
read-then-write coupon claim. Each was proved by putting the old code back and
watching a test fail with the constraint error itself. Verified end to end on
the built site: a 15% code took a 68,000 subtotal down by 10,200, delivery
added 5,000, and the order was placed at 62,800 with the discount on its own
line — in the cart summary, on the confirmation page and in the dashboard. That
pass is now a Playwright test rather than a memory: the seed writes one demo
code (`server/db/seed-data/coupon.ts`, unlimited and a year wide, so a test run
cannot exhaust or expire it), and `tests/e2e/coupon.spec.ts` raises a cart over
the code's minimum, is refused generically for a code that does not exist,
applies the real one, and then compares every figure on the confirmation
page — which came out of Postgres — against what the checkout quoted. It was
believed only after two deliberate breaks: writing the order at `discountIqd:
0` while the quote still showed the discount (it reported the three figures it
found instead of four), and naming a specific reason for an unknown code (the
generic refusal never appeared).

**Phase 5.7 — the wishlist**: the heart on every product card and on the
product page, `/wishlist`, and the header icon `config/nav.ts` had been
withholding since Phase 2 because an icon that 404s promises a feature and then
breaks. It cost a schema change and a card restructure, and turned up a
third thing nobody was looking for:

- **`WishlistItem.productId` had no foreign key**, so the rows were already
  orphanable (§6).
- **The card had to stop being a `<Link>` wrapping everything**, because a
  button inside an anchor is invalid HTML (§9). Verified with the tool that
  caught the original card bug: `pnpm check:layout` reports every card
  identical and no sideways scroll at both widths, and the e2e layout spec
  agrees.
- **Five trigram indexes the schema section claimed had not existed for two
  migrations** (§6). `prisma migrate dev` writes `DROP INDEX` for anything it
  cannot see in `schema.prisma`, and it had been quietly doing so; it wrote one
  into this migration too. They are restored, and a guardrail now fails if a
  trigram index is ever dropped without being recreated — proved by putting a
  `DROP` back and watching it name the index and the migration.

Driven in a browser: signed out the heart offers sign-in and `/wishlist`
redirects; signed in it saves, the product appears on the list, and unsaving
removes the card rather than just emptying the icon.

**Phase 5.8 — comparing products**: a tick on every product card, a tray that
shows what is held, and `/compare?ids=…` — two to four products side by side,
with the rows generated from each product's own specifications, so this code
knows nothing about phones.

The comparison lives in the URL and the ticks live in `localStorage`, and the
split is the design: a finished comparison is a link worth sending, a selection
being assembled is not. An e2e test opens the link in a **second browser
context** to prove the page does not secretly depend on the ticks — it does
fail when the URL stops driving the table.

Two things were paid for here:

- **A bar pinned to the bottom of the viewport is the shape of a bug that has
  already shipped once.** The tray is `sticky` rather than `fixed`, so it
  cannot cover the footer and needs no spacer to keep in step with wrapping
  content. Measured, and the measurement was proved by switching it to
  `fixed`: 482px of the footer covered.
- **The first version of that measurement passed against the broken build.**
  It scrolled with a single `scrollTo`, which lands short while images are
  still loading, so the footer was below the viewport and the arithmetic came
  out negative. §17 already listed mid-scroll readings as a trap; the settling
  helper is now shared from `tests/e2e/fixtures.ts` rather than living in one
  spec.

**Phase 5.9 — reviews**: a rating and a written review on every product page, a
moderation queue at `/admin/reviews`, and two denormalised columns on
`Product` so the average is a read rather than a join.

The design decision is who may write one, and it is **not** what the schema's
comment anticipated: only a customer with a **DELIVERED order** for that
product, not anybody with an account (§12). `isVerifiedPurchase` is kept and
written anyway, because it is the column that stops relaxing the rule being a
schema change — the same reason `Inventory.trackQuantity` exists.

Three things were found by the usual method:

- **`prisma migrate dev` wrote six `DROP INDEX` lines into this migration**,
  exactly as §6 says it does — and this time the guardrail added with the
  wishlist caught it before it reached the repository. The migration was
  supposed to add two integer columns; the first attempt generated NOTHING but
  the six drops.
- **The eligibility rule was written twice**, once in the query that renders
  the form and once in the service that accepts the write. A deliberate break
  to the service's copy passed every test, because the test only exercised the
  query's. One copy now (§12), and the break fails.
- **The e2e suite had outgrown the sign-in rate limit.** Seven tests needed a
  signed-in page and better-auth allows five sign-ins a minute per IP (§7);
  the seventh met "too many attempts" and timed out on the form. The limit is
  correct, so the suite signs in once per account and restores those cookies
  afterwards — a real session, kept in the database, not a pretend one.

### Partially complete

- **Demo imagery** — generated device silhouettes
  (`scripts/generate-demo-images.mjs` → `public/demo/products/*.jpg`), flagged
  `isDemo` and badged in the UI. The owner will supply real photography; the
  pipeline is ready for it.
- **Offers** — `Offer` is schema-only and stays that way on purpose (§12);
  coupons are built.
- **Banners, FAQ, homepage CMS** — schema only.

### Not started

Recommendations and analytics. **Phase 6 is
complete** — e2e, the security review and the performance pass are all done
(§14); the cache layer was refused on measurement (§15). The accessibility
pass has been done once — see §19 for exactly what it did and did not check.

---

## 15. Known issues and technical debt

**Deactivating a `DeliveryRate` has never meant "we do not deliver here."**
`quoteDeliveryFor` looks for an ACTIVE rate and falls back to the default fee
when it finds none, so unticking a governorate changes its price and nothing
else. The tick was labelled "active", which reads as the opposite; it says
"custom fee" now and the screen shows the default it falls back to. Switching a
governorate off entirely would be a new column and a new refusal at checkout —
a business decision for the owner, not a rename.

| Item                                               | Impact                                                                                                                                  | Plan                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| e2e covers the flows, not the filters              | Buying, order privacy, the dashboard and the layout claims are driven; catalogue filters and the variant picker's dimming still are not | Extend `tests/e2e/` when a filter bug actually appears      |
| Rate limiting is in process                        | The tracking limiter does not survive a restart or span a second instance                                                               | A counter table the day there is a second instance          |
| No cache layer, deliberately                       | The catalogue runs 12 queries in 4.8 ms of a 34 ms response — measured, on 16 products                                                  | Revisit when database time passes ~40% of the response      |
| Uploaded images are never deleted from storage     | An image removed from a product leaves its object                                                                                       | Sweep by prefix when a product is deleted                   |
| No image resizing or thumbnails on upload          | An 8 MB photo is served at 8 MB to `next/image`                                                                                         | `next/image` optimises on the fly; revisit at scale         |
| A coupon's per-user limit does not bind a guest    | `CouponUsage` identifies by `userId` and a guest checkout has none; the global `usageLimit` still bounds the cost                       | Deliberate — see §12                                        |
| `Offer` is schema-only                             | A campaign `comparePriceIqd` cannot express has nowhere to live                                                                         | Deliberate — a second pricing mechanism (§12)               |
| Attribute _groups_ are still seed-only             | A new specification can be ungrouped or reuse an existing group                                                                         | Rare enough to wait; the form offers the groups that exist  |
| No address book or profile editing                 | The account shows details and orders; changing them means getting in touch                                                              | Phase 5.5                                                   |
| Staff cannot be invited, only promoted             | Someone must register first; an admin never types another person's password                                                             | Deliberate — see §12                                        |
| Demo admin password is still the weak default      | Dev only — `db:seed` refuses in production, but the dashboard it opens is the real one                                                  | Owner deferred it knowingly; revisit before any deployment  |
| `server/db/seed-data/products.ts` is ~1050 lines   | Data, not logic, but unwieldy                                                                                                           | Split to JSON if it grows                                   |
| A save lost to an instant navigation               | The heart flips optimistically; clicking and leaving in the same moment cancels the request and saves nothing                           | Inherent to optimistic UI — see §12                         |
| No rating on a product card                        | A line rendered only for products that have a rating makes cards different heights — the bug `check:layout` exists for                  | Revisit when most products have reviews (§12)               |
| No "highest rated" sort                            | One five-star review would outrank fifty averaging 4.8                                                                                  | Needs a weighted average, which needs reviews (§12)         |
| Compare ticks are per browser                      | They live in `localStorage`, so a selection does not follow the customer to their phone; the finished comparison is a link, which does  | Deliberate — see §12                                        |
| Mail is built but unconfigured                     | "Forgot your password?" says so instead of promising an email; email verification stays off                                             | The owner adds `RESEND_API_KEY` + `MAIL_FROM` (`pnpm keys`) |
| Product page spec column is tall vs. short content | Whitespace on sparse products                                                                                                           | Consider sticky panel                                       |
| `as unknown` × 1, `eslint-disable` × 2             | All documented and justified                                                                                                            | Keep                                                        |

**Zero `any`. Zero type suppressions.**

---

## 16. Conventions

- TypeScript `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
- ESLint: `no-explicit-any: error`, `consistent-type-imports` (inline type
  imports), unused vars must be `_`-prefixed.
- Prettier: single quotes, semicolons, trailing commas, 88 columns,
  `prettier-plugin-tailwindcss` sorts classes (knows `cn()` and `cva()`).
  `messages/` and `prisma/migrations/` are ignored.
- Comments explain **why**, not what. Document the decision and the failure it
  prevents.
- Server Components by default; `'use client'` only for genuine interaction.
  Currently 14 client files to 26 server files.
- No `as never` / `as any` to silence the compiler. Dynamic hrefs are typed
  template literals.
- Never mark a script's edit "done" without asserting the change actually
  landed — silent no-op replacements have happened here before.

---

## 17. Testing and enforcement

`pnpm test` — **478 tests**: 437 unit tests in `tests/unit/` (money, Iraqi
phones, Arabic search, order transitions, availability in both modes, YouTube
parsing, catalogue param parsing, cart and delivery arithmetic, order numbers,
product slugs, per-type attribute coercion, variant labels, option
combinations, both shapes of a Prisma unique-constraint error, image
signatures including four ways of disguising an SVG, the `.env` editor
against **both** LF and CRLF files, and the taxonomy rules — keys, a category
tree that terminates on a cycle, and which field a unique violation names,
hreflang alternates, the buying guide's price bands, and the reset email in
both languages including an escaped hostile display name, and the four
refusals that keep a store from losing its last reachable admin, and what a
discount code is worth and every reason it is refused — rounded down, capped
twice, and evaluated against a clock the test supplies rather than the one on
the wall, the comparison — what a `?ids=` value from the address bar is
allowed to mean, and the alignment of values to columns, which is a bug a
reader would believe rather than notice — and the rating arithmetic, where the
interesting case is that a product with no reviews has NO average rather than
0.0) plus 39
architecture guardrail cases in `tests/architecture.test.ts`.

`pnpm test:integration` — **114 tests** (order placement, concurrency, the admin order lifecycle — release on cancel, consume on delivery, payment settlement — and the catalogue: a brand-new product type saved by the same service, typed values landing in the right columns, variant ids surviving an edit, a sold variant deactivated rather than deleted, and deletion refused once a product appears in an order; and the taxonomy: a
product type invented through the services with its own decimal and enum
specifications, the product form's reference data growing to match, the value
type locking once values exist, an option row keeping its id across a rename,
and every delete that would orphan a product refused; and a customer's order
history, which is six assertions that it shows NOTHING belonging to anybody
else — another account's order, a guest order sharing the phone number, and
anything at all when nobody is signed in; and access, where the counts are
global and therefore read from Postgres inside the same call that acts on
them — the last active admin cannot be demoted or deactivated, and an
inactive one does not count towards keeping the store reachable; and coupons,
where every claim this file makes about them is a row in Postgres rather than
an argument — a quote that consumes nothing, a bad code that fails the whole
order, two checkouts at the same moment taking two different order numbers,
exactly one of them taking the last use of a code, and a number that does not
collide after an order is deleted from the middle of a day; and the wishlist,
which is mostly negatives — one account cannot read another's saved products
and cannot delete out of their list, a draft cannot be saved, an unpublished
product leaves the page but not the row, and deleting a product takes its
saved items with it, which the column had no foreign key to do until this
phase; and reviews, which are three joins deep — order to item to variant to
product, because `OrderItem` carries no productId of its own — so the tests
are mostly about who may NOT write one: a stranger's delivered order, a guest
order, an order that has not arrived yet, and a second review of the same
product; plus the rating columns moving on approval and back on rejection, and
the storefront read never returning anything unapproved). Six of the 114 need no database at
all — the Resend sender, with `fetch` replaced, asserting what MPS posts rather
than what Resend does with it; they live here only because this config is where
`server-only` is stubbed. Run by
`pnpm check` and by CI. Order placement is the one path where being wrong costs
money, and what makes it correct — a transaction that must roll back whole, a
conditional UPDATE two checkouts race for, constraints Postgres enforces —
cannot be tested with a fake. `vitest.integration.config.mts` stubs
`server-only` so a service can be imported; a guardrail keeps that stub out of
every other config and out of application code. The concurrency test was
verified by replacing the atomic UPDATE with a read-then-write and watching it
sell one unit twice.

**An integration fixture that mutates a row it did not create must restore it
in `afterEach`, not `afterAll`.** The users suite parks every existing ADMIN as
a CUSTOMER so the "last admin" refusals can fire at all — the counts are global
— and an early version restored them only at the end. An interrupted run left
the dev database with **zero active admins**: exactly the state the feature
under test exists to prevent, reached by the test for it. `afterEach` narrows
the window to one test, and `pnpm db:seed` is the recovery, because its upsert
sets `admin@mps.local`'s role every time.

`pnpm test:e2e` — **27 Playwright tests** in `tests/e2e/`, driving the BUILT
site in a real browser: buying a phone and tracking it, an unavailable variant
that cannot be added, a stranger who cannot open somebody else's order, a
tracking form that answers identically for a wrong phone and a number that was
never issued, a sign-out that takes `mps.recent_order` with it, unpublishing a
product and watching it leave the shop floor, specification fields that change
with the product type, a dashboard a signed-out visitor cannot reach, **a
discount code applied at checkout and then charged as quoted** — the one claim
no unit or integration test can make, because the quote and the charge are
computed at two different times and only a page shows both — **a heart that
does not know its own state until after hydration**, **a comparison opened in a
second browser context**, so a page that secretly depended on this browser's
ticks would fail, **a review form that is not offered to somebody who did not
buy the thing**, the two
layout claims below, the headers — every page loaded with a listener on
`securitypolicyviolation`, so a policy that silently blocks the product video
or a stylesheet fails rather than shipping — and **a budget for the JavaScript
a customer downloads**, which is the only thing that would have caught 353 kB
of Zod arriving in the browser behind a tidy-looking import. Not in `pnpm check`: it needs a browser that has to be
installed once (`npx playwright install chromium`), and `check` must keep
working on a machine that has not. **CI runs it after `pnpm check`**, against
the `.next` that step produced.

Three rules hold it together, each paid for during the build:

- **No Arabic copy is written in a test.** Every label comes from
  `messages/ar.json` through `t()` in `tests/e2e/fixtures.ts` — a hard-coded
  "أضف إلى السلة" would break on a rewording, which is not a defect, and would
  keep passing if the page ever rendered a raw key, which is. A guardrail
  enforces it; `fixtures.ts` is exempt because the address it submits at
  checkout is the test's own input, not UI copy.
- **A fresh server per run, never a reused one.** `reuseExistingServer` is
  false, so a leftover `next start` is a port-in-use error instead of the
  previous build quietly answering the tests — a trap listed with the others
  further down.
- **One real sign-in per account, then its cookies.** better-auth allows five
  sign-ins a minute per IP and a test runner is one IP: the seventh test that
  needed a signed-in page met "too many attempts" and timed out on the form.
  Raising the limit to suit the tests would weaken the thing the tests exist to
  protect, so `signIn()` keeps the session and restores it — which is a real
  session, because better-auth keeps them in the database.
- **A test is not believed until it has failed on purpose.** The cart's
  `lineTotalIqd` was broken to a unit price and the suite stayed green, which
  is how the subtotal-only assertion was found to be blind — the line price is
  computed separately from the summary. The test now reads both. The footer's
  buy-bar reservation was removed and the clearance test reported a 21.25px
  overlap. The copy guardrail was given an Arabic literal and named the file
  and line. The wishlist spec believed the heart's OPTIMISTIC flip, navigated
  on it, and the browser cancelled the save on the way out — the assertion
  passed and the list was empty. It waits for the button to be enabled again
  now, which is the transition ending rather than a timeout in disguise.

**Anything touching money, stock, order state or permissions needs a test
before it ships.** Tests target pure functions in `lib/`, which is why that
logic is framework-free.

`server/queries`, `server/services` and `server/auth` all carry
`import 'server-only'` and therefore _cannot_ be imported by a unit test — that
is the deciding question for where a file goes: pure logic that wants a unit
test belongs in `lib/domain/`. `server/db` is deliberately **not** sealed,
because the seed and one-off scripts run outside Next; that is why
`server/db/diagnose.ts` has ordinary unit tests.

### Architecture guardrails

The rules in this file are only real if breaking them fails something. These
turn the important ones into failures, each message naming the **file, line and
fix** — a guardrail that only says "violation found" costs more time than it
saves. Comments are stripped before matching, so a rule quoted in a comment is
not a false hit.

| Guardrail                                                  | Catches                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| Translation keys identical in `ar.json` / `en.json`        | A raw `nav.offers` shown to half the customers            |
| No empty translation strings                               | A label that renders as nothing                           |
| No `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`                | Arabic laid out mirrored, silently                        |
| No hex colours in UI files                                 | A second, slightly different red                          |
| No `aspect-[4/5]` literals                                 | A ratio that cannot be changed centrally                  |
| No `-[--token]` anywhere in UI                             | 159 corners, two shadows and every checkbox, silently off |
| `revalidatePath` literals carry their locale               | A cache purge that matches nothing and reports success    |
| No Prisma client imported from UI                          | Layer bypass that still "works" in review                 |
| `lib/` imports neither `next` nor `server/`                | Pure logic that stops being testable                      |
| `components/ui` imports neither `features/` nor `server/`  | A Button that only works for products                     |
| Client components import from `server/` as types only      | Server code dragged into the browser bundle               |
| No literal IQD prices in UI                                | A price only a developer can change                       |
| No Arabic string literals in UI                            | Copy the owner cannot edit, with no English twin          |
| Every `config/` export has a consumer                      | A config file that lies about being the source            |
| No route file over 420 lines                               | Business logic hiding in `app/`                           |
| Every `server/` file starts with `import 'server-only'`    | Database code shipped to the browser                      |
| The `server-only` stub stays inside tests/integration      | Silently disabling that guard app-wide                    |
| better-auth imported only by its two seam modules          | An auth provider welded into feature code                 |
| Every admin export calls `requireStaff` / `requireAdmin`   | Customer addresses exposed to anyone with the action id   |
| No `hidden` beside a display utility in a template literal | A responsive class that silently hides nothing            |
| No storefront page renders its own `<main>`                | A landmark nested in the layout's, invalid and confusing  |
| No cookie sets `secure` from `NODE_ENV`                    | A cookie the browser discards on http, with no error      |
| No Arabic string literals in an e2e spec                   | A test asserting a second copy of the owner's own copy    |
| Every trigram index a migration creates still stands       | `prisma migrate dev` dropping an index it cannot see      |

`eslint.config.mjs` duplicates the layer-boundary rules on purpose: the test is
the gate that blocks a push, the lint rule is the red squiggle that stops the
mistake being written. Each boundary was verified by deliberately violating it
and confirming the intended message appeared.

### CI

`.github/workflows/ci.yml` runs the whole of `pnpm check` on every push and
pull request, against a throwaway PostgreSQL 16 service — `pnpm check` ends in
`next build`, which pre-renders 32 product pages and therefore needs a real
database. `pnpm install --frozen-lockfile` makes the lockfile a control rather
than a suggestion, and the session secret is generated per run with
`openssl rand`, never stored in the repository.

CI then installs Chromium only — one project, so three browsers would triple
the slowest step for nothing — and runs `pnpm test:e2e` against the build
`pnpm check` just produced. `DEMO_ADMIN_PASSWORD` is generated per run and
masked, the same treatment as the session secret, because the suite signs in as
staff and the seed has to agree with it. On failure the HTML report is uploaded:
a trace and a screenshot of the exact moment beat "a test went red on a machine
you cannot see".

**`pnpm check:layout`** measures the §10 claims against a running site: every
product card in a row identical in width and image height, and zero horizontal
overflow, across `/ar`, `/ar/products` and `/en` at 390px and 1440px. It exists
because a real bug survived every test and every review — cards sized to their
own product names — and was found by the owner looking at the page. The
footer's clearance under the mobile buy bar is still checked by hand.

It measures **width and image height across the whole grid** (both come from
the column, so they must match everywhere) but **card height only within one
visual row**, grouping cards by their top edge — a grid item stretches to the
tallest card beside it, not to the tallest on the page. Cards the browser is
not painting are excluded via `checkVisibility()`, because a rail renders five
and hides the fifth below `xl`; a card that collapsed to nothing while still
displayed is the bug it exists to catch, so anything it cannot interrogate
counts as visible and fails. Comparisons carry a **1px tolerance** — verified
by stripping `w-full` in a live page, where the real bug still shows a 59px
spread.

Five measurement traps have already produced false bug reports here — check
against them before believing a failure:

- **`waitUntil: 'load'` is not "content is on screen".** Pages stream inside
  Suspense, so the DOM can still be empty when `load` fires. Wait for a real
  selector (`h1`), or you will "discover" that a page renders nothing.
- **Scroll to the bottom and wait for `scrollY` to settle** before reading
  rects. A mid-scroll reading once reported the footer's copyright line as
  covered by the buy bar when the true clearance is 51px.
- **`footer p:last-of-type` matches the tagline, not the copyright** — it is
  the last `p` among _its own_ siblings. Match on the text instead.
- **`Math.round` manufactures inequality.** Five `1fr` columns across 1216px
  come out as 230.391 and 230.406 alternating — a sixty-fourth of a pixel —
  and rounding turned one image into 285 and its neighbour 286. Compare raw
  values with a tolerance, and print the decimals in the failure.
- **A `display: none` card has no box.** Comparing its zeros against four real
  cards reports a row as broken when it is exactly as designed.
- **"A heading is visible" is not "the page is rendered."** The layout renders
  outside the Suspense boundary, and the footer's section headings are on
  screen while `main` still holds the skeleton from `products/loading.tsx` —
  which has no heading of its own. A catalogue search counted zero products
  that way and reported a published product as missing from the shop. Wait for
  a heading **inside `main`**; `gotoRendered()` in `tests/e2e/fixtures.ts` is
  the one place that does it.
- **A status tab and a status badge carry the same word.** The products list
  has tabs labelled "منشور" and "مسودة" above a table whose rows carry badges
  saying the same, so `getByText(draft).first()` matched the **tab** and passed
  the instant the page loaded — before the row had flipped. The storefront was
  then read too early and the test failed about one run in ten, blaming the
  shop. Scope a status assertion to the row (`tbody tr` filtered by the name,
  last cell), and poll anything that depends on the server having caught up.
- **An Arabic label can be a SUBSTRING of another one.** Playwright matches
  accessible names by substring, and قارن ("compare") sits inside المقارنة
  ("the comparison"), so the tray's one button resolved to fifteen elements —
  every card's compare tick — and the assertion that the tray is absent before
  anything is ticked failed against the ticks themselves. Use `exact: true`
  whenever a short Arabic word is also a stem.
- **One `scrollTo` is not "at the bottom".** Images finish loading and the
  document grows underneath, so a single call lands short and the footer is
  still below the viewport — where a clearance measurement comes out negative
  and PASSES against a bar that is covering it. That is how the compare tray's
  first clearance test passed on a deliberately broken build.
  `scrollToSettledBottom()` in `tests/e2e/fixtures.ts` is the one copy; it
  keeps scrolling until two readings agree.
- **A `next start` you did not just start is serving the previous build.** It
  has been mistaken here for a code bug more than once: the fix was already
  applied, the page still showed the old behaviour, and the hunt went into the
  source. Kill it by PID and check the process is younger than the build before
  measuring anything. `playwright.config.ts` sets `reuseExistingServer: false`
  so the suite refuses rather than inheriting one.

### Measuring, so the next performance pass starts from numbers

The one before it did not, and planned a cache for a problem that was 4.8 ms
wide. Three measurements, in the order they are worth taking:

1. **What the browser downloads.** Load the page with Playwright and sum the
   bodies of every `script` response. `tests/e2e/performance.spec.ts` does
   exactly this and prints the number in its failure, so `pnpm test:e2e` is the
   measurement. Compression is on (`next start` gzips, roughly 3.2:1), so
   divide by three for what crosses the network.
2. **Server time.** `curl -s -o /dev/null -w "%{time_starttransfer}"` against
   the built site, five times, warm. The catalogue was 34 ms.
3. **How much of that is the database.** `ALTER SYSTEM SET
log_min_duration_statement = 0`, reload, hit the page, then sum the
   `duration:` lines the request produced. **Reset it afterwards** — it logs
   every parameter of every query and the file grows fast.

The fonts are the largest fixed asset: **183 kB on every page**, four weights
of IBM Plex Sans Arabic plus Inter. All four are used (`font-medium` 84 times,
`font-bold` 57, `font-semibold` 52, plus body text at 400), so dropping one is
a design decision for the owner, not a free optimisation — it is written here
so the number is known rather than rediscovered.

**`pnpm check:layout` and the e2e layout spec do not overlap.** `check:layout`
is the interactive tool: it measures card widths and image heights against a
dev server the owner already has open, and it is the one that caught the real
bug. The spec in `tests/e2e/layout.spec.ts` takes the two claims that can
regress with nobody looking — the buy bar's clearance above the footer, which
§15 listed as unmeasured from the day it was built, and zero horizontal
overflow — and puts them in CI, where no running dev server is available.

Also check the data before blaming the code: "related products" is empty on a
product with no same-type neighbour inside `RELATED_PRICE_SPREAD`, which is
correct behaviour, not a bug. `curl | grep` on built HTML is a poor cross-check
— the phrase you are grepping for also appears in the serialised next-intl
payload, and `grep -c` counts lines, which is meaningless on minified markup.

---

## 18. Environment and deployment

`.env` is gitignored and must never be committed, pasted into chat, or shared.
`.env.example` lists the variables with placeholder values.

| Variable                    | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string                  |
| `BETTER_AUTH_SECRET`        | Session signing key, ≥32 chars                |
| `BETTER_AUTH_URL`           | Full site URL                                 |
| `NEXT_PUBLIC_APP_URL`       | Full site URL, used for canonical/OG/JSON-LD  |
| `SUPABASE_URL`              | Optional. Project URL for image upload        |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional. **Secret** — see below              |
| `SUPABASE_STORAGE_BUCKET`   | Defaults to `product-images`                  |
| `GOOGLE_CLIENT_ID`          | Optional. Enables "continue with Google"      |
| `GOOGLE_CLIENT_SECRET`      | Optional. **Secret** — server-side only       |
| `RESEND_API_KEY`            | Optional. **Secret** — enables password reset |
| `MAIL_FROM`                 | Optional. Sender address on a verified domain |

**Every optional variable is preprocessed through `blankToUndefined`**
(`lib/env-value.ts`). An empty string means "not set", which is not how a Zod
schema reads it: `z.string().min(10).optional()` accepts a _missing_ variable
and rejects an empty one — so `GOOGLE_CLIENT_ID=""`, exactly how
`.env.example` ships every optional key, failed validation and took the whole
site down at boot with an error about a feature nobody had configured. That
happened. A unit test guards it.

`config/env.ts` validates these at boot with Zod and fails loudly, with each
error naming its own fix — including a `DATABASE_URL` that is **still the
template**. Copying `.env.example` and never filling it in is the most common
first-run failure, and a placeholder passes a "non-empty string" check happily;
it then surfaces three layers down as `Authentication failed … for \`user\``,
which names the database rather than the file. `lib/database-url.ts` matches the
tokens in position (`://USER:`, not the bare word) so a deployment whose role
really is called `user` is not refused.

**A correct `.env` is not a working database.** `server/db/diagnose.ts` rewrites
setup-shaped Prisma failures — P1000/P1001/P1002/P1003/P1017 (unreachable, wrong
password, no such database) and P2021/P2022 (missing table or column) — into a
message that names the cause and the command that fixes it, per platform. It is
wired into the client with `$extends({ query: { $allOperations } })`, so it
covers every model.

Ordinary query errors pass through as the **same object**, deliberately:
`server/services/order.ts` catches P2002 by `instanceof` and `code` to retry an
order number, and a wrapper around every error would break that silently. A
test asserts the identity holds.

Without this, a stopped PostgreSQL surfaces on the homepage as a stack trace
inside `product.findMany()` — the first query that happens to run, and the one
thing that is not wrong. `docs/extending-ar.md` §9.9 has the owner-facing
version, including starting the Windows service.

**`SUPABASE_SERVICE_ROLE_KEY` bypasses every row-level policy in the project.**
It holds whichever privileged key the project has: Supabase's legacy
`service_role` JWT, or the current `sb_secret_...`. Requests carry it in
**both** `Authorization: Bearer` and `apikey`, because the legacy key
authenticates through the first and the current one through the second —
sending both is what Supabase's own client does, and it means the owner never
has to know which generation their dashboard is showing them. The publishable
and `anon` keys are not interchangeable with it: they cannot write.
It is read in exactly one module — `server/services/admin-storage.ts`, which is
`server-only` and calls `requireStaff()` — and never reaches the browser under
any name. The bucket `product-images` is public for reads (product photos are
public anyway) and writable only by that key: RLS is on for `storage.objects`
with **no** policies, so anon and authenticated clients cannot write to it at
all. If the key leaks, reset it in the Supabase dashboard; nothing else has to
change.

**The `.env` tooling is tested against Windows line endings, and must stay
that way.** The owner is on Windows, so their `.env` is CRLF, and JavaScript
treats a lone `\r` as a line terminator. Two bugs shipped from that, both
invisible on Linux and both in code that edits the owner's only copy of their
database URL:

- `check-services.mjs` carried its **own** parser ending in `(.*)$`. `.` does
  not match `\r`, so it matched **nothing** on a CRLF file and reported a
  perfectly good `.env` as having no variables — then advised `pnpm setup`,
  which would have overwritten it. The shared module's header had already
  warned against a second copy of this logic; the warning was ignored, and
  that copy is what lied. There is now one parser, in `scripts/lib/env-file.mjs`.
- `writeEnvValue` used `^\s*KEY\s*=.*$` with the `m` flag. `^` also matches
  after `\r`, so the leading `\s*` ate the `\n` before the line being
  replaced and glued two variables onto one line, losing both. It now rebuilds
  the lines instead of letting a pattern near a line boundary.

`parseEnv` splits on `\r\n`, `\r` **and** `\n`, which also means the
repaired tools can still read a file the old writer already damaged — recovery
is a rewrite, not a retype. `writeEnvValue` preserves whichever convention the
file uses. `pnpm keys` copies `.env` to `.env.bak` before its first change and
refuses to save a rewrite that would lose a variable (`assertNoKeysLost`).
`.gitignore` sweeps `.env*` with `!.env.example`, because `.env.bak` matched
none of the three patterns that were there and this repository is public.

**A pooler caps CLIENTS, and `next build` opens one per worker.** Supabase's
session pooler allows 15 for the whole project; Next prerenders with one worker
per core — 23 on the owner's machine — and each opens its own Prisma client
with `pg`'s default pool of 10. The build died partway through with
`(EMAXCONNSESSION) max clients reached in session mode`, naming whichever page
happened to be rendering, which was never the problem. It surfaced the day five
new statically-rendered pages pushed the concurrency past the ceiling.

`poolingPlanFor()` in `lib/database-url.ts` returns **both** numbers, because
only their product is the constraint: 4 workers × a pool of 3 = 12, with
headroom for a dev server or `db:studio` open alongside. A direct connection
gets no cap at all — Postgres allows a hundred clients and the build should use
the machine; CI is unaffected for the same reason. A pooler is recognised by
`pgbouncer=true`, a `.pooler.supabase.com` host, or port 6543; `BUILD_WORKERS`
and `DATABASE_POOL_MAX` override each half for anything that announces itself a
fourth way. A test asserts the product fits under the ceiling — setting the two
numbers sensibly but separately is exactly how this bug was written.

**Security headers are built in `lib/security-headers.ts`**, not written out in
the config, so the policy can be unit-tested — a CSP that blocks the product
video and one that allows everything look identical in a config file.

**The Content-Security-Policy deliberately carries no nonce.** Next's own guide
builds a strict `script-src` from a per-request nonce and states that doing so
**requires dynamic rendering**. This store is built the other way round: the
homepage and all 32 product pages are prerendered, and §8 records what keeping
them that way costs — the header cannot read a cookie without turning every
route dynamic. So `'unsafe-inline'` stays on `script-src`, and the policy is
honest about not stopping inline script in an app that renders no user HTML
(React escapes everything; the single `dangerouslySetInnerHTML` is JSON-LD,
serialised by `jsonLdScript()` so it cannot close its own tag). What it does
stop is the rest: no `'unsafe-eval'` and no remote script origin, `base-uri
'self'` so an injected `<base>` cannot repoint the checkout form, `form-action
'self'` so a form cannot be aimed at another host, `frame-ancestors 'none'`,
`object-src 'none'`, and allow-lists — not wildcards — for the storage bucket
and the two YouTube origins `lib/video.ts` uses. Revisit the nonce if the
storefront ever becomes dynamic for another reason; then it is free.

`Strict-Transport-Security` follows the scheme, like every cookie (§7), and
carries **no `preload`**: submitting a domain to the browsers' preload list is
close to irreversible and this store has no domain yet.

**The one violation the policy produces is Zod's JIT probe.** Zod 4 compiles
validators with `new Function` when it can and finds out by trying; without
`'unsafe-eval'` that throws, Zod catches it and falls back to the interpreted
path. Every form still validates. `tests/e2e/security.spec.ts` names that one
violation explicitly and fails on any other, so a script from a new origin or a
blocked frame is still caught.

**Deployment notes**: `pnpm db:deploy` applies migrations (never `db:migrate` in
production); `pnpm db:seed` refuses to run when `NODE_ENV=production`; use a
**session pooler** connection string, not a direct connection; `dangerouslyAllowSVG` is deliberately **off**, and
uploads enforce that **by content, not by file name** — renaming an SVG to
`.jpg` is the whole attack, so the extension is never consulted.

**The repository is public.** Treat every commit as world-readable.

---

## 19. NEXT STEPS

**Phases 1–4, 5.1–5.3 and 5.4a complete.** The store sells (cart, checkout,
COD orders, tracking), the owner runs it (sign-in, order queue, status changes
with stock and payment settlement, delivery pricing, store settings), **owns
the catalogue** (add, edit, publish, delete products; specifications generated
per product type; photographs uploaded to Supabase Storage) **and owns its
shape** (brands, categories, product types and the specifications each type
asks for — so selling a category nobody planned for is data entry, not a
release). Customers sign in with a password or with Google.

**Phase 5.4 is finished.** Wishlist, compare and reviews are all built.

**Phase 5.5 — buying guides** (§14) closed the item that had been first on this
list since Phase 2: the owner writes articles at `/admin/blog` and they appear
on `/guides` above the live-data entry points, which stay so the page can never
render empty.

**Phase 5.6 — offers and coupons** (§14) closed the second: discount codes are
written at `/admin/coupons` and applied at checkout, priced by the server from
the code alone. `Offer` is left schema-only, and §12 says why rather than
leaving it looking unfinished — it would be a second way for a product to have
a discounted price beside `comparePriceIqd`, and two mechanisms is how a
customer is shown one price and charged another. The phase's real cost was
elsewhere: it uncovered two order-numbering bugs and a coupon claim that could
lose an update, none of which the passing concurrency test had noticed.

**Phase 5.7 — the wishlist** (§14) took the first of those three and, as
usual, the feature was the cheap part: it uncovered a foreign key that had
never existed and five search indexes that had been silently dropped two
migrations ago while this file said they were there. Both are fixed and both
now fail a test if they regress.

**Phase 5.8 — comparing products** (§14) took the second. The comparison is
the URL and the ticks are `localStorage`, which is the split worth remembering:
the finished thing is a link, the selection being assembled is not.

**Phase 5.9 — reviews** (§14) closed the list. A rating and a written review
on every product page, a moderation queue, and one rule that decides the whole
feature: only a customer with a delivered order may write one, so every review
on the shop is from somebody who received the thing.

**Every feature this file has planned since Phase 1 is now built.** What
remains is not code: the owner's inputs below. The two things worth doing to
the software when there is real traffic are named in §15 — a rating on the
product card, and a "highest rated" sort — and both are waiting for the same
thing, which is enough reviews to be worth sorting by.

**What reviews settled**, since this section asked the questions: the schema's
`isVerifiedPurchase` comment anticipated letting anybody with an account write
one and badging the buyers. That was refused — an account costs nothing while
email verification is off, so the requirement is a delivered order and the
column stays as the switch for relaxing it later. `Product` gained
`ratingCount` and `ratingSum` rather than an average, so nothing rounds in
storage. Sorting the catalogue by rating is still not built, and §15 says
why.

**The build's connection budget is settled** (§18): a pooled `DATABASE_URL` now
caps build workers and the pool together, after `pnpm build` died against
Supabase's 15-client session pooler. Verified on the owner's machine.

**Phase 5.4b — the customer's own account**: registration and an account
area. Sign-up goes over the same HTTP router as sign-in, so its rate limit is
real — verified by tripping it. `/account` shows the customer's details and
their orders, `/account/orders` pages through the rest, and both link into the
`/orders/<number>` page that already checks ownership, so there is no second
detail view where an address could leak. An account stays optional: checkout
has never required one and still does not. Driving this found two cookie bugs
that had nothing to do with accounts and everything to do with commerce — see
§7.

**Phase 5.4d — user management**: roles and access from the dashboard, ADMIN
only. Four refusals guard the one state the app cannot recover from — a store
with no reachable admin — and each is unit-tested for the rule and
integration-tested for the count, which is read from Postgres inside the same
call that acts on it.

**Phase 5.4c — password reset** (**verified on the owner's own machine**: they
registered, asked for a link, received it, set a new password and signed in
with it — the same standard of proof as the Supabase upload, and for the same
reason, because a key that is written is not a key that works): a
`MailProvider` seam with a Resend sender,
`/forgot-password` and `/reset-password`, and a reset email written natively in
Arabic. Optional like every other integration: with no key the form says reset
is unavailable rather than promising an inbox, and `pnpm check:services` proves
the key the same way it proves the Supabase one — by asking Resend, which
distinguishes a bad key from an unverified sender domain. **This is also what
unlocks `requireEmailVerification`**, and with it the safe half of account
linking (§7) for addresses that already have a password here.

**Phase 6 — QA:** the Playwright suite is in (`tests/e2e/`, run by CI after
the build), so the flows that used to be driven by hand before each phase are
driven by a machine instead — including the footer's clearance under the mobile
buy bar, which §15 had listed as unmeasured since it was built. **The security
review is done** (§14): one live open redirect fixed, a CSP and HSTS added with
the nonce refused for a stated reason (§18), order tracking rate limited (§12),
and a guardrail tightened that had been admitting the failure it existed to
prevent. **The performance pass is done too** (§14), and it refused the cache
layer this file had been planning since Phase 2.5: the database is 4.8 ms of a
34 ms catalogue response, while the browser was downloading 1048 kB of script.
Zod is out of the storefront, the sign-in pages and the dashboard, and a budget
test keeps it out. **Phase 6 is complete.**

What the review did **not** cover, so nobody reads it as more than it is:
dependency auditing beyond the `minimumReleaseAge` policy, anything about the
host or the network the store will eventually run on, and the Supabase
project's own configuration beyond the bucket policy §18 describes. It is a
review of this repository's code.

**An accessibility pass has been done once**, by reading the DOM of the built
site rather than by eye, and it found three real defects that had survived
every review: gallery thumbnails with no accessible name, four pages nesting
`<main>` inside the layout's, and the catalogue jumping h1 → h3. All three are
fixed and the nested landmark now fails a guardrail. What that scan checks —
landmarks, heading order, accessible names, alt text, horizontal overflow — is
clean across eleven pages in both languages. It is not a full audit: contrast
ratios, focus order and keyboard traps have not been measured, and screen
readers have not been used.

**Owner inputs still needed before launch** — this list is a reminder, not the
authority. `.env` lives on the owner's machine and is never in the repository,
so **run `pnpm check:services` before telling the owner a key is missing**: it
uploads a file to Supabase and deletes it, and asks Google whether the id and
secret are a pair. Saying "you still need to fill X" when they filled it last
week wastes their time and makes the rest of the list look equally stale. A
key being _written_ is not the same as a key that _works_, which is the other
half of why the check exists. Remaining: real product photography, WhatsApp
and contact number, delivery fees per governorate, warranty policy text, a
production `DATABASE_URL`, a Google OAuth client (`docs/extending-ar.md` §9.6),
and **a domain**. That one item now blocks three things at once: the site has
to be served from somewhere, `MAIL_FROM` needs a sender on a domain verified
with Resend, and until then mail goes out from Resend's shared
`onboarding@resend.dev`, **which delivers only to the account owner's own
address**. Which is also why `requireEmailVerification` must stay off for now:
switching it on while only the owner can receive mail would lock every other
customer out of their account at the first sign-in. The mail keys themselves
are done and proven.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
