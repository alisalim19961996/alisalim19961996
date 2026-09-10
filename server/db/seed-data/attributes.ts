import { AttributeDataType } from '@prisma/client';

/**
 * The attribute library.
 *
 * These are SYSTEM reference data, not demo data: they define what a phone,
 * tablet or accessory can be described by. A new attribute here is data entry,
 * not a migration — which is what lets MPS sell categories it does not sell yet.
 */

export interface AttributeSeed {
  key: string;
  labelAr: string;
  labelEn: string;
  type: AttributeDataType;
  unit?: string;
  group: string;
  isFilterable?: boolean;
  isComparable?: boolean;
  options?: Array<{ value: string; labelAr: string; labelEn: string }>;
}

export const ATTRIBUTE_GROUPS = [
  { key: 'general', nameAr: 'عام', nameEn: 'General', sortOrder: 0 },
  { key: 'display', nameAr: 'الشاشة', nameEn: 'Display', sortOrder: 1 },
  { key: 'performance', nameAr: 'الأداء', nameEn: 'Performance', sortOrder: 2 },
  { key: 'camera', nameAr: 'الكاميرا', nameEn: 'Camera', sortOrder: 3 },
  { key: 'battery', nameAr: 'البطارية والشحن', nameEn: 'Battery & charging', sortOrder: 4 },
  { key: 'connectivity', nameAr: 'الاتصال', nameEn: 'Connectivity', sortOrder: 5 },
  { key: 'physical', nameAr: 'التصميم', nameEn: 'Design', sortOrder: 6 },
] as const;

export const ATTRIBUTES: AttributeSeed[] = [
  // -- Shared across phones and tablets --------------------------------------
  {
    key: 'ram_gb',
    labelAr: 'الذاكرة العشوائية',
    labelEn: 'RAM',
    type: AttributeDataType.INT,
    unit: 'GB',
    group: 'performance',
    isFilterable: true,
  },
  {
    key: 'storage_gb',
    labelAr: 'سعة التخزين',
    labelEn: 'Storage',
    type: AttributeDataType.INT,
    unit: 'GB',
    group: 'performance',
    isFilterable: true,
  },
  {
    key: 'chipset',
    labelAr: 'المعالج',
    labelEn: 'Chipset',
    type: AttributeDataType.TEXT,
    group: 'performance',
  },
  {
    key: 'chipset_brand',
    labelAr: 'شركة المعالج',
    labelEn: 'Chipset maker',
    type: AttributeDataType.ENUM,
    group: 'performance',
    isFilterable: true,
    options: [
      { value: 'snapdragon', labelAr: 'سنابدراجون', labelEn: 'Snapdragon' },
      { value: 'mediatek', labelAr: 'ميدياتك', labelEn: 'MediaTek' },
      { value: 'exynos', labelAr: 'إكسينوس', labelEn: 'Exynos' },
      { value: 'apple_silicon', labelAr: 'معالج أبل', labelEn: 'Apple silicon' },
      { value: 'unisoc', labelAr: 'يونيسوك', labelEn: 'Unisoc' },
      { value: 'kirin', labelAr: 'كيرين', labelEn: 'Kirin' },
    ],
  },
  {
    key: 'display_size_inch',
    labelAr: 'حجم الشاشة',
    labelEn: 'Screen size',
    type: AttributeDataType.DECIMAL,
    unit: 'inch',
    group: 'display',
    isFilterable: true,
  },
  {
    key: 'display_type',
    labelAr: 'نوع الشاشة',
    labelEn: 'Display type',
    type: AttributeDataType.ENUM,
    group: 'display',
    isFilterable: true,
    options: [
      { value: 'amoled', labelAr: 'AMOLED', labelEn: 'AMOLED' },
      { value: 'oled', labelAr: 'OLED', labelEn: 'OLED' },
      { value: 'ips_lcd', labelAr: 'IPS LCD', labelEn: 'IPS LCD' },
      { value: 'lcd', labelAr: 'LCD', labelEn: 'LCD' },
    ],
  },
  {
    key: 'refresh_rate_hz',
    labelAr: 'معدل التحديث',
    labelEn: 'Refresh rate',
    type: AttributeDataType.INT,
    unit: 'Hz',
    group: 'display',
    isFilterable: true,
  },
  {
    key: 'resolution',
    labelAr: 'دقة الشاشة',
    labelEn: 'Resolution',
    type: AttributeDataType.TEXT,
    group: 'display',
  },
  {
    key: 'battery_mah',
    labelAr: 'سعة البطارية',
    labelEn: 'Battery capacity',
    type: AttributeDataType.INT,
    unit: 'mAh',
    group: 'battery',
    isFilterable: true,
  },
  {
    key: 'charging_watt',
    labelAr: 'سرعة الشحن',
    labelEn: 'Charging speed',
    type: AttributeDataType.INT,
    unit: 'W',
    group: 'battery',
    isFilterable: true,
  },
  {
    key: 'main_camera_mp',
    labelAr: 'الكاميرا الخلفية',
    labelEn: 'Main camera',
    type: AttributeDataType.INT,
    unit: 'MP',
    group: 'camera',
    isFilterable: true,
  },
  {
    key: 'front_camera_mp',
    labelAr: 'الكاميرا الأمامية',
    labelEn: 'Front camera',
    type: AttributeDataType.INT,
    unit: 'MP',
    group: 'camera',
  },
  {
    key: 'os',
    labelAr: 'نظام التشغيل',
    labelEn: 'Operating system',
    type: AttributeDataType.ENUM,
    group: 'general',
    isFilterable: true,
    options: [
      { value: 'android', labelAr: 'أندرويد', labelEn: 'Android' },
      { value: 'ios', labelAr: 'iOS', labelEn: 'iOS' },
      { value: 'ipados', labelAr: 'iPadOS', labelEn: 'iPadOS' },
      { value: 'harmonyos', labelAr: 'HarmonyOS', labelEn: 'HarmonyOS' },
      { value: 'none', labelAr: 'بدون', labelEn: 'None' },
    ],
  },
  {
    key: 'has_5g',
    labelAr: 'يدعم 5G',
    labelEn: '5G',
    type: AttributeDataType.BOOLEAN,
    group: 'connectivity',
    isFilterable: true,
  },
  {
    key: 'has_nfc',
    labelAr: 'يدعم NFC',
    labelEn: 'NFC',
    type: AttributeDataType.BOOLEAN,
    group: 'connectivity',
    isFilterable: true,
  },
  {
    key: 'sim_slots',
    labelAr: 'عدد شرائح الاتصال',
    labelEn: 'SIM slots',
    type: AttributeDataType.INT,
    group: 'connectivity',
  },
  {
    key: 'gaming_ready',
    labelAr: 'مناسب للألعاب',
    labelEn: 'Gaming ready',
    type: AttributeDataType.BOOLEAN,
    group: 'performance',
    isFilterable: true,
  },
  {
    key: 'water_resistance',
    labelAr: 'مقاومة الماء',
    labelEn: 'Water resistance',
    type: AttributeDataType.TEXT,
    group: 'physical',
  },
  {
    key: 'weight_grams',
    labelAr: 'الوزن',
    labelEn: 'Weight',
    type: AttributeDataType.INT,
    unit: 'g',
    group: 'physical',
  },

  // -- Tablet-specific -------------------------------------------------------
  {
    key: 'cellular',
    labelAr: 'يدعم شريحة اتصال',
    labelEn: 'Cellular',
    type: AttributeDataType.BOOLEAN,
    group: 'connectivity',
    isFilterable: true,
  },
  {
    key: 'stylus_support',
    labelAr: 'يدعم القلم',
    labelEn: 'Stylus support',
    type: AttributeDataType.BOOLEAN,
    group: 'general',
    isFilterable: true,
  },

  // -- Accessory-specific ----------------------------------------------------
  {
    key: 'accessory_kind',
    labelAr: 'نوع الملحق',
    labelEn: 'Accessory type',
    type: AttributeDataType.ENUM,
    group: 'general',
    isFilterable: true,
    options: [
      { value: 'charger', labelAr: 'شاحن', labelEn: 'Charger' },
      { value: 'cable', labelAr: 'كيبل', labelEn: 'Cable' },
      { value: 'case', labelAr: 'حافظة', labelEn: 'Case' },
      { value: 'screen_protector', labelAr: 'واقي شاشة', labelEn: 'Screen protector' },
      { value: 'earbuds', labelAr: 'سماعات', labelEn: 'Earbuds' },
      { value: 'power_bank', labelAr: 'باور بانك', labelEn: 'Power bank' },
      { value: 'smartwatch', labelAr: 'ساعة ذكية', labelEn: 'Smartwatch' },
    ],
  },
  {
    key: 'compatible_with',
    labelAr: 'متوافق مع',
    labelEn: 'Compatible with',
    type: AttributeDataType.TEXT,
    group: 'general',
  },
  {
    key: 'capacity_mah',
    labelAr: 'السعة',
    labelEn: 'Capacity',
    type: AttributeDataType.INT,
    unit: 'mAh',
    group: 'battery',
    isFilterable: true,
  },
  {
    key: 'wireless',
    labelAr: 'لاسلكي',
    labelEn: 'Wireless',
    type: AttributeDataType.BOOLEAN,
    group: 'connectivity',
    isFilterable: true,
  },
];

/**
 * Which attributes each product type uses, in the order the admin form shows
 * them. This is the single place that decides a phone form differs from a
 * tablet form differs from an accessory form.
 */
export const PRODUCT_TYPES = [
  {
    key: 'phone',
    nameAr: 'هاتف',
    nameEn: 'Phone',
    icon: 'Smartphone',
    attributes: [
      'display_size_inch', 'display_type', 'refresh_rate_hz', 'resolution',
      'chipset', 'chipset_brand', 'ram_gb', 'storage_gb', 'gaming_ready',
      'main_camera_mp', 'front_camera_mp',
      'battery_mah', 'charging_watt',
      'os', 'has_5g', 'has_nfc', 'sim_slots',
      'water_resistance', 'weight_grams',
    ],
    required: ['ram_gb', 'storage_gb', 'display_size_inch', 'battery_mah', 'os'],
  },
  {
    key: 'tablet',
    nameAr: 'جهاز لوحي',
    nameEn: 'Tablet',
    icon: 'Tablet',
    attributes: [
      'display_size_inch', 'display_type', 'refresh_rate_hz', 'resolution',
      'chipset', 'chipset_brand', 'ram_gb', 'storage_gb',
      'main_camera_mp', 'front_camera_mp',
      'battery_mah', 'charging_watt',
      'os', 'cellular', 'stylus_support',
      'weight_grams',
    ],
    required: ['ram_gb', 'storage_gb', 'display_size_inch', 'os'],
  },
  {
    key: 'accessory',
    nameAr: 'ملحق',
    nameEn: 'Accessory',
    icon: 'Cable',
    attributes: [
      'accessory_kind', 'compatible_with',
      'charging_watt', 'capacity_mah', 'wireless',
      'weight_grams',
    ],
    required: ['accessory_kind'],
  },
] as const;
