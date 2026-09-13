import { authHandlers } from '@/server/auth/auth';

/**
 * better-auth's HTTP endpoints.
 *
 * The handler itself is built in server/auth/auth.ts, which is the only module
 * allowed to know which auth provider MPS uses. This file only mounts it.
 *
 * `proxy.ts` excludes /api from locale rewriting, so these paths are not
 * locale-prefixed.
 */
export const { GET, POST } = authHandlers;
