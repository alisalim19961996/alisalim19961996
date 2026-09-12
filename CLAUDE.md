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
pnpm dev           # development server
pnpm check         # typecheck + lint + format + tests + build — run before pushing
pnpm build         # production build
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
pnpm test          # vitest run
pnpm format        # prettier --write .
pnpm db:deploy     # apply migrations (production)
pnpm db:migrate    # create a migration (development)
pnpm db:seed       # load DEMO data (development only)
pnpm db:studio     # browse the database
```

`postinstall` runs `prisma generate`. Without it a fresh clone fails typecheck
and tests, because Prisma's enums only exist in the generated client.

Arabic guides for the owner live in `docs/`: `run-locally-ar.md`,
`database-setup-ar.md`, `vscode-setup-ar.md`, and **`extending-ar.md`** — 12
step-by-step recipes answering "I want to change X, where do I start?"
(text, colours, nav links, a new page, a new specification, a whole new
product type, brands, UI numbers, commercial data, schema changes), plus the
list of what the guardrails refuse. Every recipe names the exact file and how
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
features/<domain>/components  domain UI (product, catalogue, search)
server/queries              catalogue + product reads
server/services             business logic — the only place rules live
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

`better-auth` behind `server/auth/auth.ts`; guards in `server/auth/guards.ts`.
Application code never imports better-auth directly, so the provider is
swappable.

- Email + password, minimum 8 characters. Email verification is **off** until a
  mail provider is configured.
- Sessions in the database, 30 days, cookie prefix `mps`, `httpOnly` +
  `sameSite=lax`, `Secure` in production.
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

| Route                                      | Rendering    | Purpose                                                                 |
| ------------------------------------------ | ------------ | ----------------------------------------------------------------------- |
| `/[locale]`                                | SSG          | Homepage: hero, shop-by-type, trust, 3 product rails, brands, final CTA |
| `/[locale]/products`                       | Dynamic      | Catalogue: filters, sort, pagination, search results (`?q=`)            |
| `/[locale]/products/[slug]`                | SSG per slug | Product detail                                                          |
| `/sitemap.xml`, `/robots.txt`, `/icon.svg` | Static       |                                                                         |

Also: `app/[locale]/loading.tsx`, `error.tsx`, `not-found.tsx`, and a
catalogue-shaped `products/loading.tsx`.

**Linked but not built yet** (header/footer point at them, they 404 today):
`/brands`, `/offers`, `/guides`, `/about`, `/contact`, `/cart`, `/account`,
`/wishlist`.

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
switcher and mobile nav ship JS), `SiteFooter` (reserves bottom space for the
mobile buy bar), `MobileNav`, `LanguageSwitcher` (preserves path **and** query),
`Logo`.

**Product** — `features/product/components/`:

- `ProductPrice` — **the only place a price is rendered.** Wraps prices in
  `.numeric` (LTR isolation) so Arabic bidi cannot reorder digits.
- `ProductCard` — server component; image, brand, name, tagline, price.
- `VariantPicker` — client; keeps price, SKU and availability in sync;
  unreachable combinations are dimmed, never hidden.
- `ProductGallery` — client; images + videos in one strip, player created on
  click only.
- `MobileBuyBar` — client; appears after 520px of scroll, `lg:hidden`.

**Catalogue** — `features/catalogue/components/`: `FilterPanel`,
`ActiveFilters`, `SortSelect`, `MobileFilterButton`, `Pagination`.

**Search** — `features/search/components/search-box.tsx`: `SearchBox`,
`HeaderSearch`.

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
- **All UI text lives in `messages/*.json`.** Currently **159 keys, identical
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

**Cart / checkout / payment** — schema exists, **logic not built** (Phase 3).
When built: the client sends `variantId` and `quantity` only; every price and
total is recomputed on the server; COD first, behind a payment-provider
abstraction so an Iraqi gateway can be added without touching order code.

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

### Partially complete

- **Buy buttons render but are disabled** — deliberate, so the page's real
  layout and mobile bar height are honest before Phase 3.
- **Demo imagery** — generated device silhouettes
  (`scripts/generate-demo-images.mjs` → `public/demo/products/*.jpg`), flagged
  `isDemo` and badged in the UI. The owner will supply real photography; the
  pipeline is ready for it.
- **Offers / coupons** — schema and constraints exist, no UI or service.
- **Reviews, wishlist, blog, banners, FAQ, homepage CMS** — schema only.

### Not started

Cart, checkout, orders, order tracking (Phase 3) · admin dashboard (Phase 4) ·
wishlist, compare, reviews, recommendations, blog, analytics (Phase 5) ·
accessibility audit, security review, performance pass, e2e tests (Phase 6).

---

## 15. Known issues and technical debt

| Item                                               | Impact                                        | Plan                                             |
| -------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| No e2e tests                                       | Filter/variant behaviour verified manually    | Playwright in Phase 6                            |
| Layout checks are manual                           | Overflow + buy-bar clearance driven by hand   | Fold into the Playwright suite in Phase 6        |
| No cache layer                                     | Catalogue runs 2 queries per visit            | `unstable_cache` + tags when the catalogue grows |
| `server/db/seed-data/products.ts` is ~1050 lines   | Data, not logic, but unwieldy                 | Split to JSON if it grows                        |
| Header/footer link to unbuilt routes               | `/brands`, `/offers`, `/guides`, `/cart`… 404 | Built in Phases 3–5                              |
| No mail provider                                   | Password reset cannot send                    | `MailProvider` abstraction before launch         |
| Product page spec column is tall vs. short content | Whitespace on sparse products                 | Consider sticky panel                            |
| `as unknown` × 1, `eslint-disable` × 1             | Both documented and justified                 | Keep                                             |

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
  Currently 9 client files to 21 server files.
- No `as never` / `as any` to silence the compiler. Dynamic hrefs are typed
  template literals.
- Never mark a script's edit "done" without asserting the change actually
  landed — silent no-op replacements have happened here before.

---

## 17. Testing and enforcement

`pnpm test` — **88 tests**: 72 unit tests in `tests/unit/` (money, Iraqi phones,
Arabic search, order transitions, availability in both modes, YouTube parsing,
catalogue param parsing) plus 15 architecture guardrails in
`tests/architecture.test.ts` (16 cases — two are `it.each`).

**Anything touching money, stock, order state or permissions needs a test
before it ships.** Tests target pure functions in `lib/`, which is why that
logic is framework-free. Anything under `server/` carries `import 'server-only'`
and therefore _cannot_ be imported by a test — that is the deciding question
for where a file goes: pure logic that wants a unit test belongs in
`lib/domain/`, and only code that genuinely touches the database belongs in
`server/`.

### Architecture guardrails

The rules in this file are only real if breaking them fails something. These
turn the important ones into failures, each message naming the **file, line and
fix** — a guardrail that only says "violation found" costs more time than it
saves. Comments are stripped before matching, so a rule quoted in a comment is
not a false hit.

| Guardrail                                                 | Catches                                          |
| --------------------------------------------------------- | ------------------------------------------------ |
| Translation keys identical in `ar.json` / `en.json`       | A raw `nav.offers` shown to half the customers   |
| No empty translation strings                              | A label that renders as nothing                  |
| No `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`               | Arabic laid out mirrored, silently               |
| No hex colours in UI files                                | A second, slightly different red                 |
| No `aspect-[4/5]` literals                                | A ratio that cannot be changed centrally         |
| No Prisma client imported from UI                         | Layer bypass that still "works" in review        |
| `lib/` imports neither `next` nor `server/`               | Pure logic that stops being testable             |
| `components/ui` imports neither `features/` nor `server/` | A Button that only works for products            |
| Client components import from `server/` as types only     | Server code dragged into the browser bundle      |
| No literal IQD prices in UI                               | A price only a developer can change              |
| No Arabic string literals in UI                           | Copy the owner cannot edit, with no English twin |
| Every `config/` export has a consumer                     | A config file that lies about being the source   |
| No route file over 420 lines                              | Business logic hiding in `app/`                  |
| Every `server/` file starts with `import 'server-only'`   | Database code shipped to the browser             |

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
available at `/opt/pw-browsers/chromium`. Layout facts that matter — zero
horizontal overflow at 390px and 1440px, and the footer's clearance under the
mobile buy bar — are currently verified by driving the built site with
Playwright by hand. Three measurement traps have already produced false bug
reports here — check against them before believing a failure:

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

| Variable              | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string                 |
| `BETTER_AUTH_SECRET`  | Session signing key, ≥32 chars               |
| `BETTER_AUTH_URL`     | Full site URL                                |
| `NEXT_PUBLIC_APP_URL` | Full site URL, used for canonical/OG/JSON-LD |

`config/env.ts` validates these at boot with Zod and fails loudly, with each
error naming its own fix.

**Deployment notes**: `pnpm db:deploy` applies migrations (never `db:migrate` in
production); `pnpm db:seed` refuses to run when `NODE_ENV=production`; use a
**session pooler** connection string, not a direct connection; security headers
are set in `next.config.ts`; `dangerouslyAllowSVG` is deliberately **off**, so
admin image uploads must reject SVG.

**The repository is public.** Treat every commit as world-readable.

---

## 19. NEXT STEPS

**Phase 3 — Commerce (next):**

1. `Cart` + `CartItem` service — anonymous cart keyed by an httpOnly token,
   merged into the user's cart on login.
2. Server Actions for add / update / remove — accept `variantId` + `quantity`
   only, recompute everything server-side.
3. Cart page and header cart count; enable the currently disabled buy buttons
   and the mobile buy bar.
4. Checkout: 6 fields (name, phone, governorate, city, address, notes), guest
   and account, delivery fee from `DeliveryRate`.
5. Order creation in a transaction: snapshot prices into `OrderItem`, write
   `Payment` (COD), emit the first `OrderEvent`, generate the order number.
   Reserve stock only for variants with `trackQuantity` on.
6. Order confirmation and public tracking by order number + phone.
7. Tests: cart maths, delivery fee, order creation, state transitions,
   concurrent checkout.

When Phase 3 lands, two constants come back to `config/ui.ts` with real
consumers: a maximum line quantity (a typo guard, not a policy) and the cart
cookie's lifetime. They were deliberately removed rather than left unused —
see §13.16.

Then Phase 4 (admin), 5 (wishlist/compare/reviews/blog), 6 (QA).

**Owner inputs still needed before launch:** real product photography, WhatsApp
and contact number, delivery fees per governorate, warranty policy text, a
production `DATABASE_URL`, and a mail provider for password reset.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
