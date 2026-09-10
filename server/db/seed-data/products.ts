import { StockStatus } from '@prisma/client';

/**
 * DEMO products.
 *
 * Prices, specifications and availability here are PLACEHOLDERS for building
 * against. They are not MPS's real catalogue or commercial terms. Real products
 * are entered through the admin.
 *
 * The point of this file is to prove one thing: three product types with
 * completely different specification shapes and completely different variant
 * options all flow through the same schema.
 */

export interface DemoProduct {
  productType: string;
  brand: string;
  category: string;
  slugAr: string;
  slugEn: string;
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  taglineEn: string;
  warrantyMonths: number;
  isFeatured?: boolean;
  isNewArrival?: boolean;
  attributes: Record<string, string | number | boolean>;
  options: Array<{
    nameAr: string;
    nameEn: string;
    isColor?: boolean;
    values: Array<{ valueAr: string; valueEn: string; hex?: string }>;
  }>;
  variants: Array<{
    sku: string;
    labelAr: string;
    labelEn: string;
    priceIqd: number;
    comparePriceIqd?: number;
    optionValues: string[];
    status?: StockStatus;
  }>;
  videos?: Array<{ url: string; titleAr: string; titleEn: string }>;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  // ---------------------------------------------------------------- PHONE ---
  {
    productType: 'phone',
    brand: 'tecno',
    category: 'mid-range',
    slugAr: 'tecno-camon-40-demo',
    slugEn: 'tecno-camon-40-demo',
    nameAr: 'تكنو كامون 40 (تجريبي)',
    nameEn: 'TECNO Camon 40 (demo)',
    taglineAr: 'كاميرا قوية وبطارية تدوم',
    taglineEn: 'Strong camera, battery that lasts',
    warrantyMonths: 12,
    isFeatured: true,
    isNewArrival: true,
    attributes: {
      display_size_inch: 6.78,
      display_type: 'amoled',
      refresh_rate_hz: 120,
      resolution: '1080 x 2436',
      chipset: 'Demo Chipset G99',
      chipset_brand: 'mediatek',
      ram_gb: 8,
      storage_gb: 256,
      gaming_ready: true,
      main_camera_mp: 50,
      front_camera_mp: 32,
      battery_mah: 5000,
      charging_watt: 45,
      os: 'android',
      has_5g: true,
      has_nfc: true,
      sim_slots: 2,
      weight_grams: 195,
    },
    options: [
      {
        nameAr: 'الذاكرة والتخزين',
        nameEn: 'Memory',
        values: [
          { valueAr: '8 جيجا / 256 جيجا', valueEn: '8GB / 256GB' },
          { valueAr: '12 جيجا / 256 جيجا', valueEn: '12GB / 256GB' },
        ],
      },
      {
        nameAr: 'اللون',
        nameEn: 'Colour',
        isColor: true,
        values: [
          { valueAr: 'أسود', valueEn: 'Black', hex: '#1A1A1D' },
          { valueAr: 'أزرق', valueEn: 'Blue', hex: '#1E3A8A' },
        ],
      },
    ],
    variants: [
      {
        sku: 'DEMO-TEC-C40-8-256-BLK',
        labelAr: '8 جيجا / 256 جيجا · أسود',
        labelEn: '8GB / 256GB · Black',
        priceIqd: 385000,
        comparePriceIqd: 425000,
        optionValues: ['8GB / 256GB', 'Black'],
      },
      {
        sku: 'DEMO-TEC-C40-8-256-BLU',
        labelAr: '8 جيجا / 256 جيجا · أزرق',
        labelEn: '8GB / 256GB · Blue',
        priceIqd: 385000,
        optionValues: ['8GB / 256GB', 'Blue'],
      },
      {
        sku: 'DEMO-TEC-C40-12-256-BLK',
        labelAr: '12 جيجا / 256 جيجا · أسود',
        labelEn: '12GB / 256GB · Black',
        priceIqd: 430000,
        optionValues: ['12GB / 256GB', 'Black'],
        status: StockStatus.OUT_OF_STOCK,
      },
    ],
    videos: [
      {
        // Placeholder id. Replaced with a real review link from the admin.
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        titleAr: 'مراجعة الجهاز (رابط تجريبي)',
        titleEn: 'Hands-on review (demo link)',
      },
    ],
  },

  // --------------------------------------------------------------- TABLET ---
  {
    productType: 'tablet',
    brand: 'samsung',
    category: 'phones',
    slugAr: 'demo-tablet-s10',
    slugEn: 'demo-tablet-s10',
    nameAr: 'جهاز لوحي تجريبي S10',
    nameEn: 'Demo Tablet S10',
    taglineAr: 'شاشة كبيرة ودعم القلم',
    taglineEn: 'Big screen with stylus support',
    warrantyMonths: 12,
    isFeatured: true,
    attributes: {
      display_size_inch: 11,
      display_type: 'ips_lcd',
      refresh_rate_hz: 90,
      resolution: '1600 x 2560',
      chipset: 'Demo Tablet Chip',
      chipset_brand: 'snapdragon',
      ram_gb: 8,
      storage_gb: 128,
      main_camera_mp: 13,
      front_camera_mp: 12,
      battery_mah: 8000,
      charging_watt: 45,
      os: 'android',
      cellular: false,
      stylus_support: true,
      weight_grams: 498,
    },
    options: [
      {
        nameAr: 'الاتصال',
        nameEn: 'Connectivity',
        values: [
          { valueAr: 'واي فاي', valueEn: 'Wi-Fi' },
          { valueAr: 'واي فاي + شريحة', valueEn: 'Wi-Fi + Cellular' },
        ],
      },
    ],
    variants: [
      {
        sku: 'DEMO-TAB-S10-WIFI',
        labelAr: 'واي فاي · 128 جيجا',
        labelEn: 'Wi-Fi · 128GB',
        priceIqd: 620000,
        optionValues: ['Wi-Fi'],
      },
      {
        sku: 'DEMO-TAB-S10-LTE',
        labelAr: 'واي فاي + شريحة · 128 جيجا',
        labelEn: 'Wi-Fi + Cellular · 128GB',
        priceIqd: 745000,
        optionValues: ['Wi-Fi + Cellular'],
      },
    ],
  },

  // ------------------------------------------------------------ ACCESSORY ---
  {
    productType: 'accessory',
    brand: 'xiaomi',
    category: 'accessories',
    slugAr: 'demo-power-bank-20000',
    slugEn: 'demo-power-bank-20000',
    nameAr: 'باور بانك تجريبي 20000',
    nameEn: 'Demo Power Bank 20000',
    taglineAr: 'شحن سريع لجهازين معًا',
    taglineEn: 'Fast charging for two devices',
    warrantyMonths: 6,
    attributes: {
      accessory_kind: 'power_bank',
      compatible_with: 'USB-C / Lightning',
      capacity_mah: 20000,
      charging_watt: 22,
      wireless: false,
      weight_grams: 440,
    },
    options: [
      {
        nameAr: 'اللون',
        nameEn: 'Colour',
        isColor: true,
        values: [
          { valueAr: 'أسود', valueEn: 'Black', hex: '#1A1A1D' },
          { valueAr: 'أبيض', valueEn: 'White', hex: '#F2F2F3' },
        ],
      },
    ],
    variants: [
      {
        sku: 'DEMO-ACC-PB20-BLK',
        labelAr: 'أسود',
        labelEn: 'Black',
        priceIqd: 38000,
        comparePriceIqd: 45000,
        optionValues: ['Black'],
      },
      {
        sku: 'DEMO-ACC-PB20-WHT',
        labelAr: 'أبيض',
        labelEn: 'White',
        priceIqd: 38000,
        optionValues: ['White'],
      },
    ],
  },
];
