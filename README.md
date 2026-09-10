# MPS — Modern Phone Store

A bilingual (Arabic / English) e-commerce platform for the Iraqi phone market.
Arabic-first with full RTL support, English with LTR, built on Next.js 16 with a
PostgreSQL commerce core.

> **Status: Phase 1 (Foundation) complete.** The storefront catalogue, cart,
> checkout and admin dashboard are not built yet — see the roadmap below.

## Requirements

- Node.js ≥ 22.12
- PostgreSQL 16
- pnpm

> **بالعربي:** دليل التشغيل خطوة بخطوة في `docs/run-locally-ar.md`،
> ودليل ربط قاعدة البيانات في `docs/database-setup-ar.md`.

## Getting started

```bash
pnpm install
docker compose up -d      # optional: local PostgreSQL
cp .env.example .env      # then fill in DATABASE_URL and BETTER_AUTH_SECRET
pnpm db:deploy            # create the schema
pnpm db:seed              # load demo data (development only)
pnpm dev
```

The site runs at `http://localhost:3000` and redirects to `/ar`.
English is at `/en`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Load demo data |
| `pnpm db:studio` | Browse the database |

## Demo data

Everything loaded by `pnpm db:seed` is **demo data for development**: placeholder
delivery rates, brands and categories. It is not MPS's real commercial
information, and the seed refuses to run when `NODE_ENV=production`.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: design system, i18n/RTL, database, auth, RBAC | Complete |
| 2 | Storefront: homepage, catalogue, filters, search, product page | Not started |
| 3 | Commerce: cart, checkout, COD, orders, inventory, tracking | Not started |
| 4 | Admin: dashboard, products, inventory, orders, customers | Not started |
| 5 | Advanced: wishlist, compare, reviews, blog, offers, analytics | Not started |
| 6 | QA: responsive, accessibility, security, performance, SEO | Not started |

## Licence

Private and proprietary.
