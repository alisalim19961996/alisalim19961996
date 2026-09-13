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
  // Same reasoning as HEADER_ACTIONS: only routes that actually exist.
  { href: '/sign-in', labelKey: 'account' },
  { href: '/track', labelKey: 'trackOrder' },
];

/** Icon actions on the right of the header. */
export const HEADER_ACTIONS = [
  /**
   * Points at /sign-in, not /account: there is no account page yet, so the
   * icon led to a 404 and sign-in was unreachable from the UI entirely.
   *
   * /sign-in is the right destination in every state, because that page
   * already decides where a visitor belongs — it shows the form when signed
   * out, sends staff to the dashboard, and sends a signed-in customer home.
   * The header cannot make that decision itself: reading the session here
   * would opt every route into dynamic rendering (§8).
   *
   * The wishlist icon is gone until the page exists. An icon that 404s is
   * worse than no icon — it promises a feature and then breaks.
   */
  { href: '/sign-in', labelKey: 'account', icon: 'User', desktopOnly: true },
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
  {
    titleKey: 'support',
    links: [{ href: '/track', labelKey: 'trackOrder' }],
  },
];
