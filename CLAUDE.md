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
product type, brands, UI numbers, delivery fees, the line-quantity cap, what
the order path forbids, why the header must stay static, schema changes), plus
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
schemas/                    Zod, shared between client and server
config/                     nav.ts (all links) · ui.ts (tuned numbers)
lib/                        framework-free helpers
lib/domain/                 pure business logic, no imports from Next or Prisma runtime
i18n/                       locale routing and navigation
messages/                   ar.json / en.json — all UI text
```

**Rules that are never bent:**

- Components never import Prisma. Path is `UI → server/queries|services → server/db/client`.
- `server/queries/*` and `server/services/*` start with `import 'server-only'`.
- Filtering, sorting and pagination happen in SQL, never in JavaScript after fetching.
- Every query names its columns with `select`. No `include: { everything }`.

**These rules are enforced, not merely written down.** `tests/architecture.test.ts`
fails the build on a violation and `eslint.config.mjs` flags it while it is being
typed. A rule that only lives in a document is broken quietly by the next
contributor — or by an assistant whose context was compacted. See §17.

---

## 6. Database

44 tables, 12 enums, 28 CHECK constraints, 2 migrations. Schema: `prisma/schema.prisma`.

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
product and brand names and on SKU.

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
  20 requests/minute globally.
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
| `/[locale]/orders/[orderNumber]`           | Dynamic      | Confirmation + the order a customer returns to                           |
| `/[locale]/track`                          | SSG          | Public tracking form (number + phone)                                    |
| `/[locale]/sign-in`                        | Dynamic      | Sign-in; `?next=admin` honoured only for staff                           |
| `/[locale]/admin`                          | Dynamic      | Dashboard: work waiting, each tile a link to it                          |
| `/[locale]/admin/orders`                   | Dynamic      | Order queue: status tabs, search, paging                                 |
| `/[locale]/admin/orders/[orderNumber]`     | Dynamic      | One order: status controls, timeline, customer, money                    |
| `/[locale]/admin/products`                 | Dynamic      | Catalogue list: published/draft tabs, search, paging, publish toggle     |
| `/[locale]/admin/products/new`             | Dynamic      | Add a product                                                            |
| `/[locale]/admin/products/[id]`            | Dynamic      | Edit a product; delete refused once it has been sold                     |
| `/[locale]/admin/delivery`                 | Dynamic      | Per-governorate fee and ETA                                              |
| `/[locale]/admin/settings`                 | Dynamic      | Store settings (ADMIN only)                                              |
| `/api/auth/*`                              | Route        | better-auth; not locale-prefixed (`proxy.ts` excludes /api)              |
| `/api/admin/upload`                        | Route        | Product image upload (staff only); a route, not an action, for body size |
| `/api/session/claim-cart`                  | Route        | Where OAuth lands: merges the anonymous cart, then forwards              |
| `/sitemap.xml`, `/robots.txt`, `/icon.svg` | Static       |                                                                          |

Also: `app/[locale]/loading.tsx`, `error.tsx`, `not-found.tsx`, and a
catalogue-shaped `products/loading.tsx`.

**Linked but not built yet** (the footer still points at them, they 404
today): `/brands`, `/offers`, `/guides`, `/about`, `/contact`, `/account`,
`/wishlist`.

**The header and mobile drawer only link to routes that exist.** The account
icon points at `/sign-in`, not `/account`: there is no account page yet, so it
404'd and sign-in was unreachable from the UI entirely. `/sign-in` is right in
every state because that page already decides where a visitor belongs — form
when signed out, dashboard for staff, home for a signed-in customer. The header
cannot decide that itself without reading the session, which would opt every
route into dynamic rendering.

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
- `ProductCard` — server component; image, brand, name, tagline, price. Carries
  **`w-full`**: it sits inside `<li className="flex">`, where a flex item
  defaults to `flex: 0 1 auto` and sizes to its own content, so without it every
  card was as wide as its product name was long — and since the image box is
  `aspect-product`, a wider card meant a taller image. Four cards in one row
  measured 209, 219, 161 and 155px across the uniform 292px grid columns
  beneath them. `pnpm check:layout` now measures this.
- `VariantPicker` — client; keeps price, SKU and availability in sync;
  unreachable combinations are dimmed, never hidden.
- `ProductGallery` — client; images + videos in one strip, player created on
  click only.
- `MobileBuyBar` — client; appears after 520px of scroll, `lg:hidden`.

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
`OrderStatusBadge` (only PENDING is brand-coloured, because it is the only one
that means "act now"), `OrderActions` (buttons come from the state machine, so
an illegal move cannot be offered), `DeliveryRatesTable` (saves per row),
`SettingsForm`.

**Auth** — `features/auth/`: `SignInForm`, `GoogleSignInButton` (rendered only
when Google is configured; the mark lives in `public/brand/google.svg` because
its four colours belong to Google, are not design tokens, and must never enter
`@theme`), `SignOutButton`, `auth-client.ts`.

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

**Responsive**: mobile-first. Grid is 2 columns on phones, 3 at `md`, 4 at `xl`.
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
- **All UI text lives in `messages/*.json`.** Currently **481 keys, identical
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
keyed `user:<id>`. Signing in merges the anonymous cart into it, summing
quantities and re-clamping. **Reads never write cookies** — Next only allows
`cookies().set` in a Server Action or Route Handler — so `findCart()` returns
null for a visitor with none, and only the write path mints a token.

**Checkout and orders** — `server/services/order.ts`. The client sends
`variantId` and `quantity`; the schemas have nowhere to put money. Every figure
is recomputed inside the transaction from the variant rows and `DeliveryRate`.
One transaction writes the order, the snapshotted `OrderItem`s, the COD
`Payment`, the first `OrderEvent` and the stock ledger, then empties the cart —
the cart survives so the visitor keeps their token.

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

**Access to an order** is never the URL alone, because the numbers are
sequential. It needs the httpOnly `mps.recent_order` cookie written at checkout
(this browser ordered it), a session that owns it, or the phone number via the
tracking form. A wrong phone and a non-existent order return the same message,
so the form cannot be used to discover which numbers are real. Tracking is a
POST, not a GET: a phone number in a URL lands in history, logs and Referer.

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

**Phase 5.3 — Google sign-in**: optional, additive, and conditional on the
local account being verified before anything is linked (§7). Needs no schema
change — better-auth's `Account` table already carries the provider tokens.

### Partially complete

- **Demo imagery** — generated device silhouettes
  (`scripts/generate-demo-images.mjs` → `public/demo/products/*.jpg`), flagged
  `isDemo` and badged in the UI. The owner will supply real photography; the
  pipeline is ready for it.
- **Offers / coupons** — schema and constraints exist, no UI or service.
- **Reviews, wishlist, blog, banners, FAQ, homepage CMS** — schema only.

### Not started

Sign-in / account UI · admin dashboard (Phase 4) · wishlist, compare, reviews,
recommendations, blog, analytics (Phase 5) · accessibility audit, security
review, performance pass, e2e tests (Phase 6).

---

## 15. Known issues and technical debt

| Item                                               | Impact                                            | Plan                                                |
| -------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| No e2e tests                                       | Filter/variant behaviour verified manually        | Playwright in Phase 6                               |
| Buy-bar clearance still checked by hand            | Only the mobile bar's footer gap is unmeasured    | Fold into the Playwright suite in Phase 6           |
| No cache layer                                     | Catalogue runs 2 queries per visit                | `unstable_cache` + tags when the catalogue grows    |
| Uploaded images are never deleted from storage     | An image removed from a product leaves its object | Sweep by prefix when a product is deleted           |
| No image resizing or thumbnails on upload          | An 8 MB photo is served at 8 MB to `next/image`   | `next/image` optimises on the fly; revisit at scale |
| Coupons are schema-only                            | `discountIqd` is always 0                         | Phase 5; `orderTotals` already takes a discount     |
| Brands, categories and product types are seed-only | A new brand still needs Studio                    | Phase 5.3                                           |
| No sign-up or account pages                        | Customers order as guests; staff are seeded       | Phase 5                                             |
| Staff roles are set in the database                | No user management screen                         | Phase 5                                             |
| `server/db/seed-data/products.ts` is ~1050 lines   | Data, not logic, but unwieldy                     | Split to JSON if it grows                           |
| Header/footer link to unbuilt routes               | `/brands`, `/offers`, `/guides`, `/account`… 404  | Built in Phases 4–5                                 |
| No mail provider                                   | Password reset cannot send                        | `MailProvider` abstraction before launch            |
| Product page spec column is tall vs. short content | Whitespace on sparse products                     | Consider sticky panel                               |
| `as unknown` × 1, `eslint-disable` × 2             | All documented and justified                      | Keep                                                |

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

`pnpm test` — **229 tests**: 202 unit tests in `tests/unit/` (money, Iraqi
phones, Arabic search, order transitions, availability in both modes, YouTube
parsing, catalogue param parsing, cart and delivery arithmetic, order numbers,
product slugs, per-type attribute coercion, variant labels, option
combinations, both shapes of a Prisma unique-constraint error, and image
signatures including four ways of disguising an SVG) plus 27
architecture guardrail cases in `tests/architecture.test.ts`.

`pnpm test:integration` — **34 tests against a real Postgres** (order placement, concurrency, the admin order lifecycle — release on cancel, consume on delivery, payment settlement — and the catalogue: a brand-new product type saved by the same service, typed values landing in the right columns, variant ids surviving an edit, a sold variant deactivated rather than deleted, and deletion refused once a product appears in an order), run by
`pnpm check` and by CI. Order placement is the one path where being wrong costs
money, and what makes it correct — a transaction that must roll back whole, a
conditional UPDATE two checkouts race for, constraints Postgres enforces —
cannot be tested with a fake. `vitest.integration.config.mts` stubs
`server-only` so a service can be imported; a guardrail keeps that stub out of
every other config and out of application code. The concurrency test was
verified by replacing the atomic UPDATE with a read-then-write and watching it
sell one unit twice.

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

| Guardrail                                                  | Catches                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| Translation keys identical in `ar.json` / `en.json`        | A raw `nav.offers` shown to half the customers          |
| No empty translation strings                               | A label that renders as nothing                         |
| No `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`                | Arabic laid out mirrored, silently                      |
| No hex colours in UI files                                 | A second, slightly different red                        |
| No `aspect-[4/5]` literals                                 | A ratio that cannot be changed centrally                |
| No Prisma client imported from UI                          | Layer bypass that still "works" in review               |
| `lib/` imports neither `next` nor `server/`                | Pure logic that stops being testable                    |
| `components/ui` imports neither `features/` nor `server/`  | A Button that only works for products                   |
| Client components import from `server/` as types only      | Server code dragged into the browser bundle             |
| No literal IQD prices in UI                                | A price only a developer can change                     |
| No Arabic string literals in UI                            | Copy the owner cannot edit, with no English twin        |
| Every `config/` export has a consumer                      | A config file that lies about being the source          |
| No route file over 420 lines                               | Business logic hiding in `app/`                         |
| Every `server/` file starts with `import 'server-only'`    | Database code shipped to the browser                    |
| The `server-only` stub stays inside tests/integration      | Silently disabling that guard app-wide                  |
| better-auth imported only by its two seam modules          | An auth provider welded into feature code               |
| Every admin query/service export calls a guard             | Customer addresses exposed to anyone with the action id |
| No `hidden` beside a display utility in a template literal | A responsive class that silently hides nothing          |

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

Missing: e2e (Phase 6). `@playwright/test` is installed and Chromium is
available at `/opt/pw-browsers/chromium`.

**`pnpm check:layout`** measures the §10 claims against a running site: every
product card in a row identical in width and image height, and zero horizontal
overflow, across `/ar`, `/ar/products` and `/en` at 390px and 1440px. It exists
because a real bug survived every test and every review — cards sized to their
own product names — and was found by the owner looking at the page. The
footer's clearance under the mobile buy bar is still checked by hand.

Three measurement traps have already produced false bug reports here — check
against them before believing a failure:

- **`waitUntil: 'load'` is not "content is on screen".** Pages stream inside
  Suspense, so the DOM can still be empty when `load` fires. Wait for a real
  selector (`h1`), or you will "discover" that a page renders nothing.
- **Scroll to the bottom and wait for `scrollY` to settle** before reading
  rects. A mid-scroll reading once reported the footer's copyright line as
  covered by the buy bar when the true clearance is 51px.
- **`footer p:last-of-type` matches the tagline, not the copyright** — it is
  the last `p` among _its own_ siblings. Match on the text instead.

Also check the data before blaming the code: "related products" is empty on a
product with no same-type neighbour inside `RELATED_PRICE_SPREAD`, which is
correct behaviour, not a bug. `curl | grep` on built HTML is a poor cross-check
— the phrase you are grepping for also appears in the serialised next-intl
payload, and `grep -c` counts lines, which is meaningless on minified markup.

---

## 18. Environment and deployment

`.env` is gitignored and must never be committed, pasted into chat, or shared.
`.env.example` lists the variables with placeholder values.

| Variable                    | Purpose                                      |
| --------------------------- | -------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string                 |
| `BETTER_AUTH_SECRET`        | Session signing key, ≥32 chars               |
| `BETTER_AUTH_URL`           | Full site URL                                |
| `NEXT_PUBLIC_APP_URL`       | Full site URL, used for canonical/OG/JSON-LD |
| `SUPABASE_URL`              | Optional. Project URL for image upload       |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional. **Secret** — see below             |
| `SUPABASE_STORAGE_BUCKET`   | Defaults to `product-images`                 |
| `GOOGLE_CLIENT_ID`          | Optional. Enables "continue with Google"     |
| `GOOGLE_CLIENT_SECRET`      | Optional. **Secret** — server-side only      |

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

**Deployment notes**: `pnpm db:deploy` applies migrations (never `db:migrate` in
production); `pnpm db:seed` refuses to run when `NODE_ENV=production`; use a
**session pooler** connection string, not a direct connection; security headers
are set in `next.config.ts`; `dangerouslyAllowSVG` is deliberately **off**, and
uploads enforce that **by content, not by file name** — renaming an SVG to
`.jpg` is the whole attack, so the extension is never consulted.

**The repository is public.** Treat every commit as world-readable.

---

## 19. NEXT STEPS

**Phases 1–4 and 5.1–5.3 complete.** The store sells (cart, checkout, COD
orders, tracking), the owner runs it (sign-in, order queue, status changes with
stock and payment settlement, delivery pricing, store settings), **and the
owner owns the catalogue** (add, edit, publish, delete products; specifications
generated per product type; photographs uploaded to Supabase Storage).
Customers sign in with a password or with Google.

**Phase 5.4 — next:**

1. **Brands, categories and product types from the dashboard**, so adding
   "laptops" is complete without Studio. The services are the same shape as
   `admin-products.ts`; the schema already allows it.
2. **Sign-up and account pages** — order history for a signed-in customer,
   using the same `findOwnedOrder` path that already exists.
3. **User management** so staff can be created without touching the database.
4. Offers and coupons: `orderTotals` already takes a discount and the schema
   and constraints exist; nothing computes one yet.
5. Wishlist, compare, reviews, blog.

**Phase 6 — QA:** Playwright e2e (the flows currently driven by hand),
accessibility audit, security review, performance pass and a cache layer.

**Owner inputs still needed before launch:** real product photography, the two
Supabase storage values in `.env` (see `docs/extending-ar.md` §4.6), WhatsApp
and contact number, delivery fees per governorate, warranty policy text, a
production `DATABASE_URL`, a Google OAuth client (`docs/extending-ar.md` §9.6),
and a mail provider for password reset — which is also what unlocks email
verification, and with it the safe half of account linking for addresses that
already have a password here.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
