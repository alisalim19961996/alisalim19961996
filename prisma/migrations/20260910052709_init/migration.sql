-- Extensions required for Arabic/English fuzzy search.
-- Declared here rather than via the `postgresqlExtensions` preview feature.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH_ON_DELIVERY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('STOCK_ADDED', 'STOCK_REMOVED', 'ORDER_RESERVED', 'ORDER_RELEASED', 'ORDER_FULFILLED', 'MANUAL_ADJUSTMENT', 'RETURNED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "OfferScope" AS ENUM ('PRODUCT', 'CATEGORY', 'BRAND', 'ALL');

-- CreateEnum
CREATE TYPE "Governorate" AS ENUM ('BAGHDAD', 'BASRA', 'NINAWA', 'ERBIL', 'SULAYMANIYAH', 'DUHOK', 'KIRKUK', 'DIYALA', 'ANBAR', 'BABIL', 'KARBALA', 'NAJAF', 'WASIT', 'MAYSAN', 'DHI_QAR', 'MUTHANNA', 'QADISIYYAH', 'SALAH_AL_DIN', 'HALABJA');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "governorate" "Governorate" NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "landmark" TEXT,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "logoUrl" TEXT,
    "accentColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "imageUrl" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "slugAr" TEXT NOT NULL,
    "slugEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "taglineAr" TEXT,
    "taglineEn" TEXT,
    "overviewAr" TEXT,
    "overviewEn" TEXT,
    "keyFeaturesAr" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyFeaturesEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prosAr" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prosEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consAr" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whoIsItForAr" TEXT,
    "whoIsItForEn" TEXT,
    "thingsToKnowAr" TEXT,
    "thingsToKnowEn" TEXT,
    "gamingNotesAr" TEXT,
    "gamingNotesEn" TEXT,
    "brandId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isNewArrival" BOOLEAN NOT NULL DEFAULT false,
    "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
    "isGaming" BOOLEAN NOT NULL DEFAULT false,
    "minPriceIqd" INTEGER,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 12,
    "warrantyNoteAr" TEXT,
    "warrantyNoteEn" TEXT,
    "metaTitleAr" TEXT,
    "metaTitleEn" TEXT,
    "metaDescriptionAr" TEXT,
    "metaDescriptionEn" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_spec" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "displaySizeInch" DOUBLE PRECISION,
    "displayType" TEXT,
    "displayRefreshHz" INTEGER,
    "displayResolution" TEXT,
    "chipset" TEXT,
    "chipsetBrand" TEXT,
    "cpuCores" INTEGER,
    "batteryMah" INTEGER,
    "chargingWatt" INTEGER,
    "mainCameraMp" INTEGER,
    "frontCameraMp" INTEGER,
    "cameraNoteAr" TEXT,
    "cameraNoteEn" TEXT,
    "os" TEXT,
    "osVersion" TEXT,
    "simSlots" INTEGER,
    "has5g" BOOLEAN NOT NULL DEFAULT false,
    "hasNfc" BOOLEAN NOT NULL DEFAULT false,
    "hasHeadphoneJack" BOOLEAN NOT NULL DEFAULT false,
    "waterResistance" TEXT,
    "weightGrams" INTEGER,
    "extra" JSONB,

    CONSTRAINT "product_spec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_image" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altAr" TEXT,
    "altEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "colorAr" TEXT NOT NULL,
    "colorEn" TEXT NOT NULL,
    "colorHex" TEXT,
    "region" TEXT,
    "priceIqd" INTEGER NOT NULL,
    "comparePriceIqd" INTEGER,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movement" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "onHandAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "governorate" "Governorate" NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "landmark" TEXT,
    "notes" TEXT,
    "subtotalIqd" INTEGER NOT NULL,
    "discountIqd" INTEGER NOT NULL DEFAULT 0,
    "deliveryIqd" INTEGER NOT NULL DEFAULT 0,
    "totalIqd" INTEGER NOT NULL,
    "couponCode" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT,
    "productNameAr" TEXT NOT NULL,
    "productNameEn" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "colorAr" TEXT NOT NULL,
    "colorEn" TEXT NOT NULL,
    "imageUrl" TEXT,
    "unitPriceIqd" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalIqd" INTEGER NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_event" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH_ON_DELIVERY',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountIqd" INTEGER NOT NULL,
    "providerRef" TEXT,
    "providerPayload" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrierName" TEXT,
    "trackingRef" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "titleAr" TEXT,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_item" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "scope" "OfferScope" NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "brandId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "minOrderIqd" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountIqd" INTEGER,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usage" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT NOT NULL,
    "discountIqd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_setting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "storeNameAr" TEXT NOT NULL DEFAULT 'متجر الهواتف الحديث',
    "storeNameEn" TEXT NOT NULL DEFAULT 'Modern Phone Store',
    "logoUrl" TEXT,
    "contactPhone" TEXT,
    "whatsappNumber" TEXT,
    "contactEmail" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "defaultDeliveryIqd" INTEGER NOT NULL DEFAULT 5000,
    "freeDeliveryOverIqd" INTEGER,
    "warrantyNoteAr" TEXT,
    "warrantyNoteEn" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_rate" (
    "id" TEXT NOT NULL,
    "governorate" "Governorate" NOT NULL,
    "feeIqd" INTEGER NOT NULL,
    "etaMinDays" INTEGER NOT NULL DEFAULT 1,
    "etaMaxDays" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_section" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "subtitleAr" TEXT,
    "subtitleEn" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner" (
    "id" TEXT NOT NULL,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "subtitleAr" TEXT,
    "subtitleEn" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageMobileUrl" TEXT,
    "linkUrl" TEXT,
    "ctaLabelAr" TEXT,
    "ctaLabelEn" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'home_hero',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq" (
    "id" TEXT NOT NULL,
    "questionAr" TEXT NOT NULL,
    "questionEn" TEXT NOT NULL,
    "answerAr" TEXT NOT NULL,
    "answerEn" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_post" (
    "id" TEXT NOT NULL,
    "slugAr" TEXT NOT NULL,
    "slugEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "excerptAr" TEXT,
    "excerptEn" TEXT,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "authorName" TEXT,
    "metaTitleAr" TEXT,
    "metaTitleEn" TEXT,
    "metaDescriptionAr" TEXT,
    "metaDescriptionEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_view" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_event" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE INDEX "user_createdAt_idx" ON "user"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "address_userId_idx" ON "address"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_slug_key" ON "brand"("slug");

-- CreateIndex
CREATE INDEX "brand_isActive_sortOrder_idx" ON "brand"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "category_slug_key" ON "category"("slug");

-- CreateIndex
CREATE INDEX "category_parentId_idx" ON "category"("parentId");

-- CreateIndex
CREATE INDEX "category_isActive_sortOrder_idx" ON "category"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_slugAr_key" ON "product"("slugAr");

-- CreateIndex
CREATE UNIQUE INDEX "product_slugEn_key" ON "product"("slugEn");

-- CreateIndex
CREATE INDEX "product_brandId_categoryId_isPublished_idx" ON "product"("brandId", "categoryId", "isPublished");

-- CreateIndex
CREATE INDEX "product_isPublished_isFeatured_idx" ON "product"("isPublished", "isFeatured");

-- CreateIndex
CREATE INDEX "product_isPublished_isNewArrival_idx" ON "product"("isPublished", "isNewArrival");

-- CreateIndex
CREATE INDEX "product_isPublished_isBestSeller_idx" ON "product"("isPublished", "isBestSeller");

-- CreateIndex
CREATE INDEX "product_isPublished_minPriceIqd_idx" ON "product"("isPublished", "minPriceIqd");

-- CreateIndex
CREATE INDEX "product_createdAt_idx" ON "product"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_spec_productId_key" ON "product_spec"("productId");

-- CreateIndex
CREATE INDEX "product_spec_chipsetBrand_idx" ON "product_spec"("chipsetBrand");

-- CreateIndex
CREATE INDEX "product_spec_batteryMah_idx" ON "product_spec"("batteryMah");

-- CreateIndex
CREATE INDEX "product_image_productId_sortOrder_idx" ON "product_image"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_sku_key" ON "product_variant"("sku");

-- CreateIndex
CREATE INDEX "product_variant_productId_isActive_idx" ON "product_variant"("productId", "isActive");

-- CreateIndex
CREATE INDEX "product_variant_priceIqd_idx" ON "product_variant"("priceIqd");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_productId_ramGb_storageGb_colorEn_region_key" ON "product_variant"("productId", "ramGb", "storageGb", "colorEn", "region");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_variantId_key" ON "inventory"("variantId");

-- CreateIndex
CREATE INDEX "inventory_movement_inventoryId_createdAt_idx" ON "inventory_movement"("inventoryId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movement_orderId_idx" ON "inventory_movement"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "cart_token_key" ON "cart"("token");

-- CreateIndex
CREATE INDEX "cart_userId_idx" ON "cart"("userId");

-- CreateIndex
CREATE INDEX "cart_item_cartId_idx" ON "cart_item"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "cart_item_cartId_variantId_key" ON "cart_item"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "order_orderNumber_key" ON "order"("orderNumber");

-- CreateIndex
CREATE INDEX "order_userId_createdAt_idx" ON "order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_createdAt_idx" ON "order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "order_phone_idx" ON "order"("phone");

-- CreateIndex
CREATE INDEX "order_item_orderId_idx" ON "order_item"("orderId");

-- CreateIndex
CREATE INDEX "order_item_variantId_idx" ON "order_item"("variantId");

-- CreateIndex
CREATE INDEX "order_event_orderId_createdAt_idx" ON "order_event"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orderId_key" ON "payment"("orderId");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_orderId_key" ON "shipment"("orderId");

-- CreateIndex
CREATE INDEX "review_productId_status_idx" ON "review"("productId", "status");

-- CreateIndex
CREATE INDEX "review_status_createdAt_idx" ON "review"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_productId_userId_key" ON "review"("productId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_userId_key" ON "wishlist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_item_wishlistId_productId_key" ON "wishlist_item"("wishlistId", "productId");

-- CreateIndex
CREATE INDEX "offer_isActive_startsAt_endsAt_idx" ON "offer"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "offer_productId_idx" ON "offer"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_code_key" ON "coupon"("code");

-- CreateIndex
CREATE INDEX "coupon_isActive_startsAt_endsAt_idx" ON "coupon"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usage_orderId_key" ON "coupon_usage"("orderId");

-- CreateIndex
CREATE INDEX "coupon_usage_couponId_userId_idx" ON "coupon_usage"("couponId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_rate_governorate_key" ON "delivery_rate"("governorate");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_section_key_key" ON "homepage_section"("key");

-- CreateIndex
CREATE INDEX "homepage_section_isVisible_sortOrder_idx" ON "homepage_section"("isVisible", "sortOrder");

-- CreateIndex
CREATE INDEX "banner_placement_isActive_sortOrder_idx" ON "banner"("placement", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "faq_isActive_sortOrder_idx" ON "faq"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "blog_post_slugAr_key" ON "blog_post"("slugAr");

-- CreateIndex
CREATE UNIQUE INDEX "blog_post_slugEn_key" ON "blog_post"("slugEn");

-- CreateIndex
CREATE INDEX "blog_post_isPublished_publishedAt_idx" ON "blog_post"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_actorId_createdAt_idx" ON "audit_log"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "product_view_productId_createdAt_idx" ON "product_view"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "product_view_userId_createdAt_idx" ON "product_view"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "search_event_createdAt_idx" ON "search_event"("createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address" ADD CONSTRAINT "address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_spec" ADD CONSTRAINT "product_spec_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_view" ADD CONSTRAINT "product_view_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_view" ADD CONSTRAINT "product_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- INTEGRITY CONSTRAINTS
-- These are the last line of defence behind the service layer. If application
-- code ever has a bug, the database still refuses to record impossible state.
-- =============================================================================

-- Stock can never go negative, and you can never reserve more than you hold.
-- This is what makes overselling structurally impossible, not just unlikely.
ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_onhand_non_negative" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "inventory_reserved_non_negative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "inventory_reserved_lte_onhand" CHECK ("reserved" <= "onHand");

-- Money is whole IQD and never negative. A "was" price that is not actually
-- higher than the selling price is a fake discount, so the database rejects it.
ALTER TABLE "product_variant"
  ADD CONSTRAINT "variant_price_positive" CHECK ("priceIqd" > 0),
  ADD CONSTRAINT "variant_compare_price_higher"
    CHECK ("comparePriceIqd" IS NULL OR "comparePriceIqd" > "priceIqd");

ALTER TABLE "cart_item"
  ADD CONSTRAINT "cart_item_quantity_positive" CHECK ("quantity" > 0);

-- Line totals must be internally consistent: no rounding drift, ever.
ALTER TABLE "order_item"
  ADD CONSTRAINT "order_item_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_item_unit_price_non_negative" CHECK ("unitPriceIqd" >= 0),
  ADD CONSTRAINT "order_item_line_total_consistent"
    CHECK ("lineTotalIqd" = "unitPriceIqd" * "quantity");

ALTER TABLE "order"
  ADD CONSTRAINT "order_subtotal_non_negative" CHECK ("subtotalIqd" >= 0),
  ADD CONSTRAINT "order_discount_non_negative" CHECK ("discountIqd" >= 0),
  ADD CONSTRAINT "order_delivery_non_negative" CHECK ("deliveryIqd" >= 0),
  ADD CONSTRAINT "order_total_non_negative" CHECK ("totalIqd" >= 0),
  ADD CONSTRAINT "order_discount_not_above_subtotal" CHECK ("discountIqd" <= "subtotalIqd"),
  ADD CONSTRAINT "order_total_consistent"
    CHECK ("totalIqd" = "subtotalIqd" - "discountIqd" + "deliveryIqd");

ALTER TABLE "review"
  ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "coupon"
  ADD CONSTRAINT "coupon_discount_positive" CHECK ("discountValue" > 0),
  ADD CONSTRAINT "coupon_percentage_within_range"
    CHECK ("discountType" <> 'PERCENTAGE' OR "discountValue" <= 100),
  ADD CONSTRAINT "coupon_usage_count_non_negative" CHECK ("usageCount" >= 0),
  ADD CONSTRAINT "coupon_period_valid" CHECK ("endsAt" > "startsAt");

ALTER TABLE "offer"
  ADD CONSTRAINT "offer_discount_positive" CHECK ("discountValue" > 0),
  ADD CONSTRAINT "offer_percentage_within_range"
    CHECK ("discountType" <> 'PERCENTAGE' OR "discountValue" <= 100),
  ADD CONSTRAINT "offer_period_valid" CHECK ("endsAt" > "startsAt");

ALTER TABLE "product"
  ADD CONSTRAINT "product_warranty_non_negative" CHECK ("warrantyMonths" >= 0);

-- The site settings table must hold exactly one row.
ALTER TABLE "site_setting"
  ADD CONSTRAINT "site_setting_singleton" CHECK ("id" = 'singleton');

-- =============================================================================
-- SEARCH INDEXES
-- Trigram indexes power fuzzy matching in both scripts, so "ايفون", "آيفون"
-- and "iPhone" can all reach the same product once the query is normalised.
-- =============================================================================

CREATE INDEX "product_name_ar_trgm" ON "product" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX "product_name_en_trgm" ON "product" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX "brand_name_ar_trgm" ON "brand" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX "brand_name_en_trgm" ON "brand" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX "variant_sku_trgm" ON "product_variant" USING GIN ("sku" gin_trgm_ops);
