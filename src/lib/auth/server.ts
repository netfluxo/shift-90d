import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { cache } from 'react';
import { getDb } from '../db/client';
import * as schema from '../db/schema';

/**
 * Get Better Auth instance per request.
 *
 * Pattern: Use React `cache()` for memoization within a single request,
 * avoiding state leakage across requests in Workers runtime.
 *
 * This is consistent with `getDb()` pattern in `src/lib/db/client.ts`.
 * The cache() ensures only one auth instance is created per request,
 * while preventing singleton reuse across different requests.
 */
export const getAuth = cache(() => {
  const db = getDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
      usePlural: true,
      camelCase: true,
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    emailAndPassword: {
      enabled: true,
      // Cadastro público habilitado — usuários criam a própria conta em /signup
      // (mesmo comportamento do app antigo).
      disableSignUp: false,
    },
    plugins: [nextCookies()],
  });
});
