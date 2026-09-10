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
import { PrismaClient, Governorate, Role } from '@prisma/client';
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

async function main() {
  console.log('Seeding DEMO data (development only)…');
  await seedSettings();
  await seedTaxonomy();
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
