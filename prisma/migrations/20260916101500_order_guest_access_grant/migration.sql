-- Guest Order Grant.
--
-- The confirmation page used to authorise a guest with `mps.recent_order`, an
-- httpOnly cookie holding the ORDER NUMBER. httpOnly stops JavaScript reading a
-- cookie; it does not stop a client setting one — and order numbers are
-- sequential by design, so anyone could walk a day's four digits and read back
-- each customer's name, phone number and home address.
--
-- These two columns hold the replacement: the SHA-256 of a 256-bit random grant
-- handed to the browser that placed the order (or that passed the tracking
-- form), and when it stops working. Only the hash is stored, so a leaked backup
-- of this table is not a set of working keys. NULL means no guest may open the
-- order at all, which is how a grant is revoked.
--
-- Additive and nullable: every existing order simply has no guest grant, and
-- its buyer reaches it through the tracking form or their account, exactly as
-- before. Rollback is `ALTER TABLE "order" DROP COLUMN ...` for both.
ALTER TABLE "order" ADD COLUMN "guestAccessHash" TEXT;
ALTER TABLE "order" ADD COLUMN "guestAccessExpiresAt" TIMESTAMP(3);

-- Unique so two orders can never share a grant, and so the lookup that
-- authorises a page view is an index seek rather than a scan.
CREATE UNIQUE INDEX "order_guestAccessHash_key" ON "order"("guestAccessHash");

-- Prisma cannot see a GIN trigram index in schema.prisma, so `migrate dev`
-- writes a DROP for each one into whatever migration comes next — it did so for
-- this one too (§6). They are recreated here, exactly as migration 3 does, so
-- that applying this file leaves search working. IF NOT EXISTS because on any
-- database that already has them this is a no-op.
CREATE INDEX IF NOT EXISTS "product_name_ar_trgm" ON "product" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "product_name_en_trgm" ON "product" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brand_name_ar_trgm" ON "brand" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brand_name_en_trgm" ON "brand" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "variant_sku_trgm" ON "product_variant" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "variant_label_ar_trgm" ON "product_variant" USING GIN ("labelAr" gin_trgm_ops);
