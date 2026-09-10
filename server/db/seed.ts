/**
 * Development seed.
 *
 * EVERYTHING HERE IS DEMO DATA (§59). Prices, stock levels and specifications
 * are placeholders for building against — they are not MPS's real commercial
 * terms and must never be presented as such. Images are marked isDemo so the
 * UI can badge them.
 *
 * The seed refuses to run against production.
 */
import 'dotenv/config';
import { PrismaClient, Governorate, Role, StockStatus } from '@prisma/client';
import { ATTRIBUTE_GROUPS, ATTRIBUTES, PRODUCT_TYPES } from './seed-data/attributes';
import { DEMO_PRODUCTS } from './seed-data/products';
import { extractYoutubeId } from '../../lib/video';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'Refusing to seed demo data in production. Demo data is for development only.',
  );
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Delivery fees in whole IQD. Placeholder values pending real logistics rates. */
const DELIVERY_RATES: ReadonlyArray<[Governorate, number, number, number]> = [
  [Governorate.BAGHDAD, 5000, 1, 2],
  [Governorate.BABIL, 7000, 1, 3],
  [Governorate.KARBALA, 7000, 1, 3],
  [Governorate.NAJAF, 7000, 1, 3],
  [Governorate.WASIT, 7000, 2, 3],
  [Governorate.DIYALA, 7000, 2, 3],
  [Governorate.ANBAR, 8000, 2, 4],
  [Governorate.SALAH_AL_DIN, 8000, 2, 4],
  [Governorate.QADISIYYAH, 8000, 2, 4],
  [Governorate.MUTHANNA, 9000, 2, 4],
  [Governorate.DHI_QAR, 9000, 2, 4],
  [Governorate.MAYSAN, 9000, 2, 4],
  [Governorate.BASRA, 9000, 2, 4],
  [Governorate.KIRKUK, 8000, 2, 4],
  [Governorate.NINAWA, 9000, 2, 5],
  [Governorate.ERBIL, 9000, 2, 5],
  [Governorate.SULAYMANIYAH, 9000, 2, 5],
  [Governorate.DUHOK, 10000, 3, 5],
  [Governorate.HALABJA, 10000, 3, 5],
];

const BRANDS = [
  { slug: 'samsung', nameAr: 'سامسونج', nameEn: 'Samsung', accentColor: '#1428A0' },
  { slug: 'tecno', nameAr: 'تكنو', nameEn: 'TECNO', accentColor: '#0057FF' },
  { slug: 'infinix', nameAr: 'إنفينكس', nameEn: 'Infinix', accentColor: '#00B14F' },
  { slug: 'realme', nameAr: 'ريلمي', nameEn: 'realme', accentColor: '#FFC915' },
  { slug: 'honor', nameAr: 'هونر', nameEn: 'HONOR', accentColor: '#0B57D0' },
  { slug: 'xiaomi', nameAr: 'شاومي', nameEn: 'Xiaomi', accentColor: '#FF6900' },
];

const CATEGORIES = [
  { slug: 'phones', nameAr: 'الهواتف', nameEn: 'Phones', parent: null },
  { slug: 'flagship', nameAr: 'الفئة الرائدة', nameEn: 'Flagship', parent: 'phones' },
  { slug: 'mid-range', nameAr: 'الفئة المتوسطة', nameEn: 'Mid-range', parent: 'phones' },
  { slug: 'budget', nameAr: 'الفئة الاقتصادية', nameEn: 'Budget', parent: 'phones' },
  { slug: 'gaming', nameAr: 'هواتف الألعاب', nameEn: 'Gaming phones', parent: 'phones' },
  { slug: 'accessories', nameAr: 'الملحقات', nameEn: 'Accessories', parent: null },
];

async function seedSettings() {
  await db.siteSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      // Real contact details are entered by the admin, never hard-coded.
      defaultDeliveryIqd: 5000,
    },
  });

  for (const [governorate, feeIqd, etaMinDays, etaMaxDays] of DELIVERY_RATES) {
    await db.deliveryRate.upsert({
      where: { governorate },
      update: { feeIqd, etaMinDays, etaMaxDays },
      create: { governorate, feeIqd, etaMinDays, etaMaxDays },
    });
  }

  console.log(`  settings + ${DELIVERY_RATES.length} governorate delivery rates`);
}

async function seedTaxonomy() {
  for (const [index, brand] of BRANDS.entries()) {
    await db.brand.upsert({
      where: { slug: brand.slug },
      update: {},
      create: { ...brand, sortOrder: index },
    });
  }

  for (const [index, category] of CATEGORIES.entries()) {
    const parent = category.parent
      ? await db.category.findUnique({ where: { slug: category.parent } })
      : null;

    await db.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: {
        slug: category.slug,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        parentId: parent?.id ?? null,
        sortOrder: index,
      },
    });
  }

  console.log(`  ${BRANDS.length} brands, ${CATEGORIES.length} categories`);
}

async function seedUsers() {
  // Demo accounts have no password set here: better-auth owns credential
  // hashing, so passwords are created through the sign-up flow rather than
  // written directly into the database with a hash this script invented.
  const admin = await db.user.upsert({
    where: { email: 'admin@mps.local' },
    update: { role: Role.ADMIN },
    create: {
      email: 'admin@mps.local',
      name: 'MPS Admin (demo)',
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  const customer = await db.user.upsert({
    where: { email: 'customer@mps.local' },
    update: {},
    create: {
      email: 'customer@mps.local',
      name: 'Demo Customer',
      role: Role.CUSTOMER,
      emailVerified: true,
      phone: '+9647701234567',
    },
  });

  console.log(`  demo users: ${admin.email} (ADMIN), ${customer.email} (CUSTOMER)`);
}

async function seedFaqs() {
  const faqs = [
    {
      questionAr: 'هل الأجهزة أصلية؟',
      questionEn: 'Are the devices genuine?',
      answerAr: 'نعم، جميع الأجهزة أصلية ومواصفاتها معلنة بوضوح على صفحة كل منتج.',
      answerEn:
        'Yes. Every device is genuine and its specifications are stated on the product page.',
    },
    {
      questionAr: 'كم مدة التوصيل؟',
      questionEn: 'How long does delivery take?',
      answerAr: 'تختلف حسب المحافظة، وتظهر المدة وأجور التوصيل قبل تأكيد الطلب.',
      answerEn:
        'It varies by governorate. The cost and timing are shown before you confirm your order.',
    },
    {
      questionAr: 'شنو طرق الدفع المتاحة؟',
      questionEn: 'What payment methods are available?',
      answerAr: 'حاليًا الدفع عند الاستلام.',
      answerEn: 'Cash on delivery is currently available.',
    },
  ];

  for (const [index, faq] of faqs.entries()) {
    const existing = await db.faq.findFirst({
      where: { questionEn: faq.questionEn },
    });
    if (!existing) {
      await db.faq.create({ data: { ...faq, sortOrder: index } });
    }
  }

  console.log(`  ${faqs.length} FAQs`);
}

/**
 * Attribute library and product types.
 *
 * This is SYSTEM data, not demo data: it defines what the store is able to
 * describe. It is safe and expected in every environment.
 */
async function seedAttributeSystem() {
  for (const group of ATTRIBUTE_GROUPS) {
    await db.attributeGroup.upsert({
      where: { key: group.key },
      update: { nameAr: group.nameAr, nameEn: group.nameEn, sortOrder: group.sortOrder },
      create: group,
    });
  }

  for (const [index, attribute] of ATTRIBUTES.entries()) {
    const group = await db.attributeGroup.findUnique({
      where: { key: attribute.group },
    });

    const definition = await db.attributeDefinition.upsert({
      where: { key: attribute.key },
      update: {
        labelAr: attribute.labelAr,
        labelEn: attribute.labelEn,
        type: attribute.type,
        unit: attribute.unit ?? null,
        groupId: group?.id ?? null,
        isFilterable: attribute.isFilterable ?? false,
        isComparable: attribute.isComparable ?? true,
        sortOrder: index,
      },
      create: {
        key: attribute.key,
        labelAr: attribute.labelAr,
        labelEn: attribute.labelEn,
        type: attribute.type,
        unit: attribute.unit ?? null,
        groupId: group?.id ?? null,
        isFilterable: attribute.isFilterable ?? false,
        isComparable: attribute.isComparable ?? true,
        sortOrder: index,
      },
    });

    for (const [optionIndex, option] of (attribute.options ?? []).entries()) {
      await db.attributeOption.upsert({
        where: {
          definitionId_value: { definitionId: definition.id, value: option.value },
        },
        update: { labelAr: option.labelAr, labelEn: option.labelEn, sortOrder: optionIndex },
        create: {
          definitionId: definition.id,
          value: option.value,
          labelAr: option.labelAr,
          labelEn: option.labelEn,
          sortOrder: optionIndex,
        },
      });
    }
  }

  for (const [typeIndex, type] of PRODUCT_TYPES.entries()) {
    const productType = await db.productType.upsert({
      where: { key: type.key },
      update: { nameAr: type.nameAr, nameEn: type.nameEn, icon: type.icon, sortOrder: typeIndex },
      create: {
        key: type.key,
        nameAr: type.nameAr,
        nameEn: type.nameEn,
        icon: type.icon,
        sortOrder: typeIndex,
      },
    });

    for (const [attrIndex, attributeKey] of type.attributes.entries()) {
      const definition = await db.attributeDefinition.findUnique({
        where: { key: attributeKey },
      });
      if (!definition) {
        throw new Error(
          `Product type "${type.key}" references unknown attribute "${attributeKey}"`,
        );
      }

      await db.productTypeAttribute.upsert({
        where: {
          productTypeId_definitionId: {
            productTypeId: productType.id,
            definitionId: definition.id,
          },
        },
        update: {
          isRequired: (type.required as readonly string[]).includes(attributeKey),
          sortOrder: attrIndex,
        },
        create: {
          productTypeId: productType.id,
          definitionId: definition.id,
          isRequired: (type.required as readonly string[]).includes(attributeKey),
          sortOrder: attrIndex,
        },
      });
    }
  }

  console.log(
    `  ${ATTRIBUTE_GROUPS.length} attribute groups, ${ATTRIBUTES.length} attributes, ${PRODUCT_TYPES.length} product types`,
  );
}

/**
 * DEMO products across three product types with entirely different
 * specification shapes and variant options — the proof that one schema serves
 * phones, tablets and accessories without special cases.
 */
async function seedDemoProducts() {
  for (const demo of DEMO_PRODUCTS) {
    const [productType, brand, category] = await Promise.all([
      db.productType.findUnique({ where: { key: demo.productType } }),
      db.brand.findUnique({ where: { slug: demo.brand } }),
      db.category.findUnique({ where: { slug: demo.category } }),
    ]);

    if (!productType || !brand || !category) {
      throw new Error(`Demo product "${demo.slugEn}" references missing taxonomy`);
    }

    const product = await db.product.upsert({
      where: { slugEn: demo.slugEn },
      update: {},
      create: {
        slugAr: demo.slugAr,
        slugEn: demo.slugEn,
        nameAr: demo.nameAr,
        nameEn: demo.nameEn,
        taglineAr: demo.taglineAr,
        taglineEn: demo.taglineEn,
        productTypeId: productType.id,
        brandId: brand.id,
        categoryId: category.id,
        warrantyMonths: demo.warrantyMonths,
        isPublished: true,
        isFeatured: demo.isFeatured ?? false,
        isNewArrival: demo.isNewArrival ?? false,
        publishedAt: new Date(),
      },
    });

    // -- Attribute values, routed to the right typed column ------------------
    for (const [key, rawValue] of Object.entries(demo.attributes)) {
      const definition = await db.attributeDefinition.findUnique({
        where: { key },
        include: { options: true },
      });
      if (!definition) throw new Error(`Unknown attribute "${key}"`);

      const data: {
        valueInt?: number | null;
        valueDecimal?: number | null;
        valueText?: string | null;
        valueBool?: boolean | null;
        optionId?: string | null;
      } = {};

      switch (definition.type) {
        case 'INT':
          data.valueInt = Number(rawValue);
          break;
        case 'DECIMAL':
          data.valueDecimal = Number(rawValue);
          break;
        case 'BOOLEAN':
          data.valueBool = Boolean(rawValue);
          break;
        case 'ENUM': {
          const option = definition.options.find((o) => o.value === rawValue);
          if (!option) {
            throw new Error(`Attribute "${key}" has no option "${String(rawValue)}"`);
          }
          data.optionId = option.id;
          break;
        }
        default:
          data.valueText = String(rawValue);
      }

      await db.productAttributeValue.upsert({
        where: {
          productId_definitionId: { productId: product.id, definitionId: definition.id },
        },
        update: data,
        create: { productId: product.id, definitionId: definition.id, ...data },
      });
    }

    // -- Options and their values -------------------------------------------
    const valueIdByLabel = new Map<string, string>();

    for (const [optionIndex, option] of demo.options.entries()) {
      const productOption = await db.productOption.upsert({
        where: { productId_nameEn: { productId: product.id, nameEn: option.nameEn } },
        update: { nameAr: option.nameAr, isColor: option.isColor ?? false, sortOrder: optionIndex },
        create: {
          productId: product.id,
          nameAr: option.nameAr,
          nameEn: option.nameEn,
          isColor: option.isColor ?? false,
          sortOrder: optionIndex,
        },
      });

      for (const [valueIndex, value] of option.values.entries()) {
        const optionValue = await db.productOptionValue.upsert({
          where: {
            optionId_valueEn: { optionId: productOption.id, valueEn: value.valueEn },
          },
          update: { valueAr: value.valueAr, hex: value.hex ?? null, sortOrder: valueIndex },
          create: {
            optionId: productOption.id,
            valueAr: value.valueAr,
            valueEn: value.valueEn,
            hex: value.hex ?? null,
            sortOrder: valueIndex,
          },
        });
        valueIdByLabel.set(value.valueEn, optionValue.id);
      }
    }

    // -- Variants, their option selections, and availability -----------------
    for (const [variantIndex, variant] of demo.variants.entries()) {
      const created = await db.productVariant.upsert({
        where: { sku: variant.sku },
        update: {},
        create: {
          productId: product.id,
          sku: variant.sku,
          labelAr: variant.labelAr,
          labelEn: variant.labelEn,
          priceIqd: variant.priceIqd,
          comparePriceIqd: variant.comparePriceIqd ?? null,
          sortOrder: variantIndex,
        },
      });

      for (const label of variant.optionValues) {
        const optionValueId = valueIdByLabel.get(label);
        if (!optionValueId) {
          throw new Error(`Variant ${variant.sku} references unknown option "${label}"`);
        }
        await db.variantOptionValue.upsert({
          where: {
            variantId_optionValueId: { variantId: created.id, optionValueId },
          },
          update: {},
          create: { variantId: created.id, optionValueId },
        });
      }

      // MPS does not count units, so availability is a status, not a number.
      await db.inventory.upsert({
        where: { variantId: created.id },
        update: { status: variant.status ?? StockStatus.IN_STOCK },
        create: {
          variantId: created.id,
          trackQuantity: false,
          status: variant.status ?? StockStatus.IN_STOCK,
        },
      });
    }

    // -- Videos --------------------------------------------------------------
    for (const [videoIndex, video] of (demo.videos ?? []).entries()) {
      const videoId = extractYoutubeId(video.url);
      if (!videoId) throw new Error(`Invalid video URL for ${demo.slugEn}: ${video.url}`);

      await db.productVideo.upsert({
        where: {
          productId_provider_videoId: {
            productId: product.id,
            provider: 'YOUTUBE',
            videoId,
          },
        },
        update: { titleAr: video.titleAr, titleEn: video.titleEn, sortOrder: videoIndex },
        create: {
          productId: product.id,
          provider: 'YOUTUBE',
          videoId,
          url: video.url,
          titleAr: video.titleAr,
          titleEn: video.titleEn,
          sortOrder: videoIndex,
        },
      });
    }

    // Keep the denormalised catalogue price in step with the variants.
    const cheapest = await db.productVariant.findFirst({
      where: { productId: product.id, isActive: true },
      orderBy: { priceIqd: 'asc' },
      select: { priceIqd: true },
    });
    await db.product.update({
      where: { id: product.id },
      data: { minPriceIqd: cheapest?.priceIqd ?? null },
    });
  }

  console.log(`  ${DEMO_PRODUCTS.length} demo products across 3 product types`);
}

async function main() {
  console.log('Seeding DEMO data (development only)…');
  await seedSettings();
  await seedAttributeSystem();
  await seedTaxonomy();
  await seedDemoProducts();
  await seedUsers();
  await seedFaqs();
  console.log('Done. All records above are demo data, not real store data.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
