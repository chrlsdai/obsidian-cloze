module.exports = {
  root: true,

  // Use the TypeScript-aware parser
  parser: '@typescript-eslint/parser',

  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },

  plugins: [
    '@typescript-eslint',
    'jest'
  ],

  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
    'plugin:jest/style'
  ],

  env: {
    node: true,
    es2020: true,
    browser: true
  },

  rules: {
    // ── Disable base ESLint rules that TypeScript handles better ──────────
    //
    // base no-unused-vars fires on TS types and interfaces — turn it off
    'no-unused-vars': 'off',
    // base no-undef is redundant when TypeScript is checking types
    'no-undef': 'off',
    // base no-shadow can false-positive on TS enums
    'no-shadow': 'off',

    // ── TypeScript-specific replacements ─────────────────────────────────
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }
    ],
    '@typescript-eslint/no-shadow': ['warn'],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // Turn off rules that create noise without clear benefit in most projects
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-function': 'off'
  },

  overrides: [
    // ── TypeScript source files — enable type-aware rules ─────────────────
    {
      files: ['src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts', '__mocks__/**/*.ts'],
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json', './tsconfig.test.json']
      },
      rules: {
        // These rules require type information (the project setting above)
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/await-thenable': 'error'
      }
    },

    // ── Test files — enable Jest globals and relax certain rules ──────────
    {
      files: [
        'tests/**/*.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**/*.ts'
      ],
      env: {
        'jest/globals': true   // makes describe/it/expect/beforeEach known to ESLint
      },
      rules: {
        // In tests it is fine to use `any` for mocking complex types
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        // Jest-specific quality rules
        'jest/expect-expect': 'warn',
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',      // blocks `test.only` or `it.only`
        'jest/no-identical-title': 'error',
        'jest/valid-expect': 'error',
        'jest/prefer-to-have-length': 'warn'
      }
    },

    // ── JavaScript config files — disable TypeScript-specific rules ───────
    {
      files: ['*.js', '*.cjs', '*.mjs'],
      parserOptions: {
        project: null   // do not apply tsconfig project to plain JS files
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off'
      }
    }
  ]
};