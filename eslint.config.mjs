import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next 16 ships native flat config, so there is no need for the
 * eslintrc compatibility bridge.
 *
 * The per-directory blocks below enforce the layer boundaries from CLAUDE.md §5.
 * They duplicate what tests/architecture.test.ts checks, on purpose: the test
 * is the gate that blocks a push, the lint rule is the red squiggle that stops
 * the mistake being written in the first place.
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // `any` defeats the point of a typed commerce layer. Allowed only with an
      // explicit disable comment explaining why.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  // -- UI layers ------------------------------------------------------------
  // A component that reaches past the query layer into Prisma bypasses every
  // rule those layers enforce, and the bypass is invisible in review because
  // the code still works.
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'features/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Import enums and types only. Data comes from server/queries or server/services — never from Prisma directly in the UI.',
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ['@/server/db', '@/server/db/*'],
              message:
                'The Prisma client is not reachable from the UI. Go through server/queries or server/services.',
            },
          ],
        },
      ],
    },
  },

  // -- Pure logic -----------------------------------------------------------
  // lib/ stays testable in a plain Node test with no request and no database.
  {
    files: ['lib/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*', '@/server/*', '@/app/*'],
              message:
                'lib/ holds framework-free logic. Anything needing a request or a database belongs in server/.',
            },
          ],
        },
      ],
    },
  },

  // -- Design-system primitives --------------------------------------------
  // A Button that knows about products cannot be reused for anything else.
  {
    files: ['components/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/server/*'],
              message:
                'components/ui holds generic primitives. Domain-aware components belong in features/.',
            },
          ],
        },
      ],
    },
  },

  // -- Scripts and seed data -----------------------------------------------
  // These run outside Next, touch the database directly, and legitimately hold
  // literal colours and Arabic demo copy.
  {
    files: ['scripts/**/*.mjs', 'server/db/**/*.ts', 'prisma/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },

  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'prisma/migrations/**',
    ],
  },
];

export default config;
