import 'server-only';

import { Role, type Prisma } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireAdmin } from '@/server/auth/guards';

/**
 * Reads behind the users screen.
 *
 * `requireAdmin()`, not `requireStaff()`: this lists every customer's email
 * and phone number, and it is the screen from which roles are handed out.
 * Someone processing orders needs neither.
 */

export const USERS_PER_PAGE = 20;

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  orderCount: number;
}

export interface AdminUsersResult {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageCount: number;
  /** Drives the refusals in the service, and greys the controls in the UI. */
  activeAdminCount: number;
}

export interface AdminUserFilter {
  q?: string;
  role?: Role;
  page?: number;
}

export async function getAdminUsers(
  filter: AdminUserFilter = {},
): Promise<AdminUsersResult> {
  await requireAdmin();

  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const term = filter.q?.trim();

  const where: Prisma.UserWhereInput = {
    ...(filter.role ? { role: filter.role } : {}),
    // Search in SQL (§5). Names and emails are short and the list is small,
    // but "small" is a property of today's data, not of the code.
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
          ],
        }
      : {}),
  };

  const [users, total, activeAdminCount] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * USERS_PER_PAGE,
      take: USERS_PER_PAGE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
    db.user.count({ where }),
    db.user.count({ where: { role: Role.ADMIN, isActive: true } }),
  ]);

  return {
    rows: users.map(({ _count, ...user }) => ({ ...user, orderCount: _count.orders })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / USERS_PER_PAGE)),
    activeAdminCount,
  };
}
