import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next 16 ships native flat config, so there is no need for the
 * eslintrc compatibility bridge.
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
