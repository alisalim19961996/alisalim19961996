-- A saved item IS the product, so the column finally gets the foreign key it
-- never had: without one, deleting a product left wishlist rows pointing at
-- nothing, and the list could not be read in a single query.
CREATE INDEX "wishlist_item_productId_idx" ON "wishlist_item"("productId");

ALTER TABLE "wishlist_item"
  ADD CONSTRAINT "wishlist_item_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Restore the trigram indexes search actually runs on.
--
-- `prisma migrate dev` wrote `DROP INDEX "variant_label_ar_trgm"` into this
-- file on its own, and that is not a one-off: an index created in hand-written
-- SQL does not exist in schema.prisma, so Prisma reads it as drift and removes
-- it on the NEXT migration, whatever that migration was about. It had already
-- happened once — migration 2 dropped all five indexes migration 1 created and
-- put back only the variant label — so by the time this migration ran, the
-- database had NONE of them, while CLAUDE.md §6 still said five.
--
-- They are not decoration. Catalogue search is `contains` + insensitive, which
-- is `ILIKE '%value%'`: a B-tree cannot serve a leading wildcard and a GIN
-- trigram index can. On 16 demo products nothing is slow either way, which is
-- exactly why their absence went unseen.
--
-- IF NOT EXISTS so this is safe on a database that still has them.
CREATE INDEX IF NOT EXISTS "product_name_ar_trgm" ON "product" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "product_name_en_trgm" ON "product" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brand_name_ar_trgm" ON "brand" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brand_name_en_trgm" ON "brand" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "variant_sku_trgm" ON "product_variant" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "variant_label_ar_trgm" ON "product_variant" USING GIN ("labelAr" gin_trgm_ops);
