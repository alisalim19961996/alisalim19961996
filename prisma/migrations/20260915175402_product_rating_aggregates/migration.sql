-- Denormalised from APPROVED reviews only, recomputed inside the transaction
-- that approves or rejects one. Sum and count rather than an average: an
-- average column bakes a rounding decision into storage, and 4.666 stored as
-- 4.7 cannot be added to.
ALTER TABLE "product"
  ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ratingSum"   INTEGER NOT NULL DEFAULT 0;

-- The aggregates have to be arithmetic that holds: a count cannot be negative,
-- and a sum of N ratings each between 1 and 5 lies between N and 5N. A bug in
-- the recompute shows up here as a refused write rather than as a product with
-- a 7-star average.
ALTER TABLE "product"
  ADD CONSTRAINT "product_rating_count_non_negative" CHECK ("ratingCount" >= 0),
  ADD CONSTRAINT "product_rating_sum_in_range"
    CHECK ("ratingSum" >= "ratingCount" AND "ratingSum" <= "ratingCount" * 5);

-- ---------------------------------------------------------------------------
-- Restore the trigram indexes search runs on — AGAIN.
--
-- `prisma migrate dev` wrote six `DROP INDEX` lines into this migration on its
-- own, exactly as CLAUDE.md §6 says it does: `USING GIN (col gin_trgm_ops)`
-- cannot be expressed in schema.prisma, so Prisma reads those indexes as drift
-- and removes them in whatever migration comes next. This one was about adding
-- two integer columns.
--
-- The guardrail added with the wishlist caught it this time, which is the only
-- reason it is not in the repository.
CREATE INDEX IF NOT EXISTS "product_name_ar_trgm" ON "product" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "product_name_en_trgm" ON "product" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brand_name_ar_trgm" ON "brand" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brand_name_en_trgm" ON "brand" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "variant_sku_trgm" ON "product_variant" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "variant_label_ar_trgm" ON "product_variant" USING GIN ("labelAr" gin_trgm_ops);
