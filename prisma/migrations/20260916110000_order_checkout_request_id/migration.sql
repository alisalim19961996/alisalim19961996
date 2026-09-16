-- Checkout idempotency key.
--
-- `placeOrder` read the cart, wrote the order and emptied the cart in one
-- transaction — but Postgres runs at READ COMMITTED, so two submissions that
-- overlapped both saw the lines, both wrote an order and both deleted the same
-- rows. One basket, two orders, and the only thing in the way was a button the
-- browser disables, which a second tab or a double tap gets past.
--
-- This column stores the hash of the browser's per-page request id together
-- with the cart the server resolved for that request — never the raw id, so a
-- guessed id cannot replay somebody else's order back to whoever asked. The
-- unique index is what makes the replay check a guarantee rather than a race of
-- its own: even if two attempts get past the row lock, only one INSERT can land.
--
-- Additive and nullable: every existing order simply has no key, and a browser
-- that sends none still checks out (the cart row lock added alongside is what
-- stops the double order in that case). Rollback is
-- `ALTER TABLE "order" DROP COLUMN "checkoutRequestId";`.
ALTER TABLE "order" ADD COLUMN "checkoutRequestId" TEXT;
CREATE UNIQUE INDEX "order_checkoutRequestId_key" ON "order"("checkoutRequestId");

-- Recreated for the fifth time: Prisma cannot see a GIN trigram index in
-- schema.prisma, so `migrate dev` writes a DROP for each one into whatever
-- migration comes next, and it did so for this one too (§6).
CREATE INDEX IF NOT EXISTS "product_name_ar_trgm" ON "product" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "product_name_en_trgm" ON "product" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brand_name_ar_trgm" ON "brand" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brand_name_en_trgm" ON "brand" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "variant_sku_trgm" ON "product_variant" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "variant_label_ar_trgm" ON "product_variant" USING GIN ("labelAr" gin_trgm_ops);
