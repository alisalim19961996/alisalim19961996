/**
 * Navigation, in one place.
 *
 * Header, mobile drawer and footer all read from here. Adding a link, removing
 * one, or reordering them is a change to this file only — previously it meant
 * editing three components and hoping they stayed in step.
 *
 * `labelKey` is a path into messages/*.json, never a literal string, so every
 * link is translated by construction.
 */

export interface NavLink {
  href: string;
  /** Key inside the `nav` namespace of messages/*.json. */
  labelKey: string;
}

export interface NavGroup {
  /** Key inside the `footer` namespace. */
  titleKey: string;
  links: readonly NavLink[];
}

/** Primary navigation: the header bar on desktop, the drawer on phones. */
export const PRIMARY_NAV: readonly NavLink[] = [
  { href: '/products?type=phone', labelKey: 'phones' },
  { href: '/products?type=tablet', labelKey: 'tablets' },
  { href: '/products?type=accessory', labelKey: 'accessories' },
  { href: '/brands', labelKey: 'brands' },
  { href: '/offers', labelKey: 'offers' },
];

/** Secondary links, shown below the primary set in the mobile drawer. */
export const SECONDARY_NAV: readonly NavLink[] = [
  { href: '/account', labelKey: 'account' },
  { href: '/wishlist', labelKey: 'wishlist' },
  { href: '/guides', labelKey: 'guides' },
];

/** Icon actions on the right of the header. */
export const HEADER_ACTIONS = [
  { href: '/wishlist', labelKey: 'wishlist', icon: 'Heart', desktopOnly: true },
  { href: '/account', labelKey: 'account', icon: 'User', desktopOnly: true },
  { href: '/cart', labelKey: 'cart', icon: 'ShoppingBag', desktopOnly: false },
] as const;

/** Footer columns. */
export const FOOTER_NAV: readonly NavGroup[] = [
  {
    titleKey: 'shop',
    links: [
      { href: '/products', labelKey: 'products' },
      { href: '/brands', labelKey: 'brands' },
      { href: '/offers', labelKey: 'offers' },
    ],
  },
  {
    titleKey: 'company',
    links: [
      { href: '/about', labelKey: 'about' },
      { href: '/guides', labelKey: 'guides' },
      { href: '/contact', labelKey: 'contact' },
    ],
  },
];
