# MPS — Modern Phone Store

Bilingual (Arabic/English) e-commerce platform for the Iraqi phone market.

## Working language

**All explanations, reports and discussion with the project owner are written in
Arabic.** Technical terms — package names, file paths, code identifiers — stay in
English, because translating them harms clarity. Code, comments and commit
messages are in English.

## Non-negotiable rules

1. **Money is an `Int` of whole Iraqi dinars.** Never a float, never a Decimal.
   Iraq does not transact in fils. All money helpers live in `lib/money.ts` and
   throw on a fractional input rather than rounding silently.
2. **Never trust the client.** Server Actions accept ids and quantities only.
   Prices, totals and discounts are always recomputed from the database.
3. **Components never import Prisma.** The path is
   `UI → server/services/* → server/db/client`. Business logic lives in services.
4. **Availability is a status, not a count.** MPS does not track units.
   `Inventory.status` is the whole truth; `trackQuantity` exists per variant so
   counted stock can be switched on later without a migration. Both paths go
   through `lib/domain/availability.ts` — never read `onHand` directly. When
   counting is on, every change writes an `InventoryMovement` inside a
   transaction that locks the inventory row.
5. **No invented data.** No fabricated benchmarks, reviews, sales figures or
   stock levels. Demo data is clearly labelled and refuses to run in production.
6. **No hard-coded commercial information.** Prices, delivery fees, warranty
   terms and contact details come from `SiteSetting` / `DeliveryRate`.
7. **RTL is real.** Use Tailwind logical properties (`ms-`, `me-`, `ps-`, `pe-`,
   `start-`, `end-`). Never `ml-`/`mr-`/`left-`/`right-` for layout.
8. **Text lives in `messages/*.json`,** not inline in components. Both catalogues
   must stay at exactly the same key count.
9. **The catalogue is not phone-only.** MPS sells phones, tablets and
   accessories, and is built to sell anything later. Never add a phone-specific
   column to `Product`. A new specification is a row in `AttributeDefinition`
   plus a link in `ProductTypeAttribute` — data entry, never a migration.
10. **Variants are option-driven.** `ProductOption` / `ProductOptionValue` /
   `VariantOptionValue` define a variant. Never hard-code RAM, storage or
   colour columns: a cable has length, a case has device fit.

## Commands

```bash
pnpm dev           # development server
pnpm build         # production build
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
pnpm test          # vitest
pnpm db:migrate    # apply migrations
pnpm db:seed       # load DEMO data (development only)
```

## Version pins that matter

- `prisma` / `@prisma/client` are pinned to **7.10.0**. `npm i prisma@latest`
  installs an **8.0.0 release candidate** — do not take it.
- `eslint` is pinned to **9.x**. ESLint 10 breaks `eslint-plugin-react`, which
  `eslint-config-next@16` depends on.
- `vitest` is pinned to **4.x**, the range `better-auth` supports.

## Product model

```
ProductType ──< ProductTypeAttribute >── AttributeDefinition ──< AttributeOption
     │                                          │
  Product ──< ProductAttributeValue >───────────┘
     ├──< ProductOption ──< ProductOptionValue ──< VariantOptionValue
     ├──< ProductVariant ──1:1── Inventory (status-based)
     ├──< ProductImage
     └──< ProductVideo   (YouTube id + click-to-play facade)
```

Adding "laptops" to the store is: one `ProductType` row, a handful of
`AttributeDefinition` rows, and the links between them. No code change.

## Architecture

```
app/[locale]/(storefront)  storefront routes
app/[locale]/(admin)       admin routes
components/ui              design system primitives
features/                  domain UI, one folder per domain
server/services            business logic — the only place rules live
server/db                  Prisma client and seed
schemas/                   Zod, shared between client and server
i18n/                      locale routing and navigation
```
