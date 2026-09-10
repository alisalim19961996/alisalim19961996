/*
  Warnings:

  - You are about to drop the column `colorAr` on the `order_item` table. All the data in the column will be lost.
  - You are about to drop the column `colorEn` on the `order_item` table. All the data in the column will be lost.
  - You are about to drop the column `ramGb` on the `order_item` table. All the data in the column will be lost.
  - You are about to drop the column `storageGb` on the `order_item` table. All the data in the column will be lost.
  - You are about to drop the column `gamingNotesAr` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `gamingNotesEn` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `isGaming` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `colorAr` on the `product_variant` table. All the data in the column will be lost.
  - You are about to drop the column `colorEn` on the `product_variant` table. All the data in the column will be lost.
  - You are about to drop the column `colorHex` on the `product_variant` table. All the data in the column will be lost.
  - You are about to drop the column `ramGb` on the `product_variant` table. All the data in the column will be lost.
  - You are about to drop the column `region` on the `product_variant` table. All the data in the column will be lost.
  - You are about to drop the column `storageGb` on the `product_variant` table. All the data in the column will be lost.
  - You are about to drop the `product_spec` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `variantLabelAr` to the `order_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variantLabelEn` to the `order_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productTypeId` to the `product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `labelAr` to the `product_variant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `labelEn` to the `product_variant` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('INT', 'DECIMAL', 'TEXT', 'BOOLEAN', 'ENUM');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('YOUTUBE');

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'STATUS_CHANGED';

-- DropForeignKey
ALTER TABLE "product_spec" DROP CONSTRAINT "product_spec_productId_fkey";

-- DropIndex
DROP INDEX "brand_name_ar_trgm";

-- DropIndex
DROP INDEX "brand_name_en_trgm";

-- DropIndex
DROP INDEX "product_name_ar_trgm";

-- DropIndex
DROP INDEX "product_name_en_trgm";

-- DropIndex
DROP INDEX "product_variant_productId_ramGb_storageGb_colorEn_region_key";

-- DropIndex
DROP INDEX "variant_sku_trgm";

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "status" "StockStatus" NOT NULL DEFAULT 'IN_STOCK',
ADD COLUMN     "trackQuantity" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_item" DROP COLUMN "colorAr",
DROP COLUMN "colorEn",
DROP COLUMN "ramGb",
DROP COLUMN "storageGb",
ADD COLUMN     "variantLabelAr" TEXT NOT NULL,
ADD COLUMN     "variantLabelEn" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "product" DROP COLUMN "gamingNotesAr",
DROP COLUMN "gamingNotesEn",
DROP COLUMN "isGaming",
ADD COLUMN     "productTypeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "product_variant" DROP COLUMN "colorAr",
DROP COLUMN "colorEn",
DROP COLUMN "colorHex",
DROP COLUMN "ramGb",
DROP COLUMN "region",
DROP COLUMN "storageGb",
ADD COLUMN     "labelAr" TEXT NOT NULL,
ADD COLUMN     "labelEn" TEXT NOT NULL;

-- DropTable
DROP TABLE "product_spec";

-- CreateTable
CREATE TABLE "product_type" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_group" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attribute_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_definition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "type" "AttributeDataType" NOT NULL,
    "unit" TEXT,
    "groupId" TEXT,
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isComparable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_option" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attribute_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_type_attribute" (
    "id" TEXT NOT NULL,
    "productTypeId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_type_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_value" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "valueInt" INTEGER,
    "valueDecimal" DECIMAL(10,2),
    "valueText" TEXT,
    "valueBool" BOOLEAN,
    "optionId" TEXT,

    CONSTRAINT "product_attribute_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_video" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "provider" "VideoProvider" NOT NULL DEFAULT 'YOUTUBE',
    "videoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isColor" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_value" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "valueAr" TEXT NOT NULL,
    "valueEn" TEXT NOT NULL,
    "hex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_option_value" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,

    CONSTRAINT "variant_option_value_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_type_key_key" ON "product_type"("key");

-- CreateIndex
CREATE INDEX "product_type_isActive_sortOrder_idx" ON "product_type"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_group_key_key" ON "attribute_group"("key");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_definition_key_key" ON "attribute_definition"("key");

-- CreateIndex
CREATE INDEX "attribute_definition_isFilterable_idx" ON "attribute_definition"("isFilterable");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_option_definitionId_value_key" ON "attribute_option"("definitionId", "value");

-- CreateIndex
CREATE INDEX "product_type_attribute_productTypeId_sortOrder_idx" ON "product_type_attribute"("productTypeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_attribute_productTypeId_definitionId_key" ON "product_type_attribute"("productTypeId", "definitionId");

-- CreateIndex
CREATE INDEX "product_attribute_value_definitionId_valueInt_idx" ON "product_attribute_value"("definitionId", "valueInt");

-- CreateIndex
CREATE INDEX "product_attribute_value_definitionId_optionId_idx" ON "product_attribute_value"("definitionId", "optionId");

-- CreateIndex
CREATE INDEX "product_attribute_value_definitionId_valueBool_idx" ON "product_attribute_value"("definitionId", "valueBool");

-- CreateIndex
CREATE UNIQUE INDEX "product_attribute_value_productId_definitionId_key" ON "product_attribute_value"("productId", "definitionId");

-- CreateIndex
CREATE INDEX "product_video_productId_sortOrder_idx" ON "product_video"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_video_productId_provider_videoId_key" ON "product_video"("productId", "provider", "videoId");

-- CreateIndex
CREATE INDEX "product_option_productId_sortOrder_idx" ON "product_option"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_productId_nameEn_key" ON "product_option"("productId", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_value_optionId_valueEn_key" ON "product_option_value"("optionId", "valueEn");

-- CreateIndex
CREATE INDEX "variant_option_value_optionValueId_idx" ON "variant_option_value"("optionValueId");

-- CreateIndex
CREATE UNIQUE INDEX "variant_option_value_variantId_optionValueId_key" ON "variant_option_value"("variantId", "optionValueId");

-- CreateIndex
CREATE INDEX "inventory_status_idx" ON "inventory"("status");

-- CreateIndex
CREATE INDEX "product_productTypeId_isPublished_idx" ON "product"("productTypeId", "isPublished");

-- AddForeignKey
ALTER TABLE "attribute_definition" ADD CONSTRAINT "attribute_definition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "attribute_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_option" ADD CONSTRAINT "attribute_option_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "attribute_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_type_attribute" ADD CONSTRAINT "product_type_attribute_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "product_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_type_attribute" ADD CONSTRAINT "product_type_attribute_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "attribute_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_value" ADD CONSTRAINT "product_attribute_value_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_value" ADD CONSTRAINT "product_attribute_value_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "attribute_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_value" ADD CONSTRAINT "product_attribute_value_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "attribute_option"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_video" ADD CONSTRAINT "product_video_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option" ADD CONSTRAINT "product_option_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_value" ADD CONSTRAINT "product_option_value_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "product_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_option_value" ADD CONSTRAINT "variant_option_value_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_option_value" ADD CONSTRAINT "variant_option_value_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "product_option_value"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- INTEGRITY CONSTRAINTS FOR THE ATTRIBUTE SYSTEM
-- =============================================================================

-- An attribute value row that holds no value at all is meaningless, and would
-- render as a blank spec line on the product page.
ALTER TABLE "product_attribute_value"
  ADD CONSTRAINT "attribute_value_not_empty" CHECK (
    "valueInt" IS NOT NULL
    OR "valueDecimal" IS NOT NULL
    OR "valueText" IS NOT NULL
    OR "valueBool" IS NOT NULL
    OR "optionId" IS NOT NULL
  );

-- A video with no id cannot be embedded or thumbnailed.
ALTER TABLE "product_video"
  ADD CONSTRAINT "product_video_id_not_empty" CHECK (length(trim("videoId")) > 0);

-- Variant labels are what the customer sees in the cart and on the invoice.
ALTER TABLE "product_variant"
  ADD CONSTRAINT "variant_label_not_empty"
    CHECK (length(trim("labelAr")) > 0 AND length(trim("labelEn")) > 0);

-- Search index for the new variant label column.
CREATE INDEX "variant_label_ar_trgm" ON "product_variant" USING GIN ("labelAr" gin_trgm_ops);
