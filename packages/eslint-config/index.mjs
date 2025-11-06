// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import eslint from '@eslint/js';
import headerPlugin from 'eslint-plugin-header';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import noOnlyTestsPlugin from 'eslint-plugin-no-only-tests';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Workaround for eslint-plugin-header ESLint 9 compatibility issue.
// See: https://github.com/Stuk/eslint-plugin-header/issues/57#issuecomment-2378485611
headerPlugin.rules.header.meta.schema = false;

/**
 * Core config applies to all source files.
 * TypeScript-specific rules are in the tsConfig below.
 * @type {import("@eslint/config-helpers").ConfigWithExtends}
 */
export const coreConfig = {
  extends: [
    eslint.configs.recommended,
    importPlugin.flatConfigs.recommended,
    jsdoc.configs['flat/recommended-typescript-error'],
  ],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: {
    header: headerPlugin,
  },
  rules: {
    // ESLint - Possible Problems
    'array-callback-return': 'error',
    curly: ['error', 'all'],
    eqeqeq: ['error', 'always'],
    'no-constant-binary-expression': 'error',
    'no-constructor-return': 'error',
    'no-new-native-nonconstructor': 'error',
    'no-promise-executor-return': 'error',
    'no-self-compare': 'error',
    'no-template-curly-in-string': 'error',
    'no-throw-literal': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unreachable-loop': 'error',
    'no-unused-private-class-members': 'error',

    // ESLint - Suggestions
    'consistent-return': 'error',
    'default-case-last': 'error',
    'default-param-last': 'error',
    'guard-for-in': 'error',
    'no-array-constructor': 'error',
    'no-div-regex': 'error',
    'no-eq-null': 'error',
    'no-eval': 'error',
    'no-extend-native': 'error',
    'no-extra-bind': 'error',
    'no-floating-decimal': 'error',
    'no-implied-eval': 'error',
    'no-invalid-this': 'error',
    'no-lonely-if': 'error',
    'no-nested-ternary': 'error',
    'no-new': 'error',
    'no-new-func': 'error',
    'no-new-object': 'error',
    'no-new-wrappers': 'error',
    'no-octal-escape': 'error',
    'no-proto': 'error',
    'no-return-assign': 'error',
    'no-sequences': 'error',
    'no-unneeded-ternary': 'error',
    'no-unused-expressions': 'error',
    'no-useless-call': 'error',
    'no-useless-computed-key': 'error',
    'no-useless-concat': 'error',
    'no-useless-return': 'error',
    'no-var': 'error',
    'no-void': 'error',
    'prefer-object-has-own': 'error',
    'prefer-object-spread': 'error',
    'prefer-promise-reject-errors': 'error',
    'prefer-regex-literals': 'error',
    'prefer-rest-params': 'error',
    'prefer-spread': 'error',
    radix: 'error',

    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],

    // JSDoc
    'jsdoc/check-tag-names': [
      'error',
      {
        definedTags: ['category', 'experimental', 'ts-ignore'],
      },
    ],
    'jsdoc/require-hyphen-before-param-description': ['error', 'always'],
    'jsdoc/require-jsdoc': 'off',
    'jsdoc/tag-lines': 'off',
    'jsdoc/require-yields-type': 'off',
    'jsdoc/require-throws-type': 'off',

    // Header
    'header/header': [
      'error',
      'line',
      [
        ' SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors',
        ' SPDX-License-Identifier: Apache-2.0',
      ],
    ],
  },
};

/**
 * TypeScript config applies to all TypeScript source files.
 * These are TypeScript-specific rules that don't apply to JavaScript files.
 * This improves accuracy and performance.
 * @type {import("@eslint/config-helpers").ConfigWithExtends}
 */
export const tsConfig = {
  files: ['**/*.ts', '**/*.tsx'],
  extends: [
    tseslint.configs.recommended,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
        },
      },
    },
    tseslint.configs.strict,
    reactHooks.configs.flat.recommended,
    reactRefresh.configs.recommended,
  ],
  plugins: {
    'no-only-tests': noOnlyTestsPlugin,
  },
  rules: {
    // TypeScript+ESLint
    '@typescript-eslint/array-type': 'error',
    '@typescript-eslint/consistent-generic-constructors': 'error',
    '@typescript-eslint/consistent-type-assertions': 'error',
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      {
        allowExpressions: true,
      },
    ],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-base-to-string': 'error',
    '@typescript-eslint/no-confusing-non-null-assertion': 'error',
    '@typescript-eslint/no-duplicate-enum-values': 'error',
    '@typescript-eslint/no-duplicate-type-constituents': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-extraneous-class': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-invalid-void-type': 'error',
    '@typescript-eslint/no-meaningless-void-operator': 'error',
    '@typescript-eslint/no-mixed-enums': 'error',
    '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
    '@typescript-eslint/no-redundant-type-constituents': 'error',
    '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
    '@typescript-eslint/no-unnecessary-type-arguments': 'error',
    '@typescript-eslint/no-unsafe-declaration-merging': 'error',
    '@typescript-eslint/no-unsafe-enum-comparison': 'error',
    '@typescript-eslint/prefer-for-of': 'error',
    '@typescript-eslint/prefer-includes': 'error',
    '@typescript-eslint/prefer-function-type': 'off', // Docusaurus doesn't play nice with function type style
    '@typescript-eslint/prefer-literal-enum-member': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/prefer-reduce-type-parameter': 'error',
    '@typescript-eslint/prefer-return-this-type': 'error',
    '@typescript-eslint/prefer-string-starts-ends-with': 'error',
    '@typescript-eslint/prefer-ts-expect-error': 'off', // We must use @ts-ignore for optional dependencies in type definitions
    '@typescript-eslint/return-await': ['error', 'in-try-catch'],
    '@typescript-eslint/switch-exhaustiveness-check': [
      'error',
      {
        allowDefaultCaseForExhaustiveSwitch: true,
        considerDefaultExhaustiveForUnions: true,
        requireDefaultForNonUnion: false,
      },
    ],
    '@typescript-eslint/unified-signatures': 'error',

    'no-useless-constructor': 'off',
    '@typescript-eslint/no-useless-constructor': 'error',

    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
      },
    ],

    // New strict `@typescript-eslint` rules
    // Need to drop all use of `any` first
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',

    // imports rules for isolatedModules and verbatimModuleSyntax
    'no-duplicate-imports': 'off', // Disable base rule
    'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
    'import/no-duplicates': 'error',
    'import/no-unresolved': 'off', // Handled by TypeScript
    '@typescript-eslint/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      },
    ],
    '@typescript-eslint/consistent-type-exports': 'error',

    // React Hooks
    'react-hooks/exhaustive-deps': 'error',
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/refs': 'warn',
    'react-hooks/immutability': 'warn',
    'react-hooks/static-components': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
    'react-hooks/purity': 'warn',

    // React Refresh
    'react-refresh/only-export-components': 'warn',

    // Disable warnings from typescript-eslint:strict
    '@typescript-eslint/non-nullable-type-assertion-style': 'off',
    '@typescript-eslint/dot-notation': 'off',
    '@typescript-eslint/consistent-indexed-object-style': 'off',
    '@typescript-eslint/consistent-type-definitions': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/no-unnecessary-condition': 'off',
    '@typescript-eslint/no-dynamic-delete': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',

    // No Only Tests
    'no-only-tests/no-only-tests': ['error', { fix: true }],
  },
};

/** @type {import("@eslint/config-helpers").ConfigWithExtendsArray} */
export const medplumEslintConfig = [
  {
    ignores: [
      '.turbo',
      'coverage',
      'dist',
      'node_modules',
      'packages/docs/build/',
      'packages/docs/markdown-to-mdx.cjs',
      'packages/docs/docusaurus.config.js',
      'packages/docs/sidebars.js',
      'packages/eslint-config/index.cjs',
      'packages/expo-medplum-polyfills/build',
      'packages/generator/output/',
      'packages/react/.storybook/',
      'package-lock.json',
      '**/.turbo',
      '**/coverage/',
      '**/dist/',
      '**/node_modules/',
      '**/babel.config.*',
      '**/jest.sequencer.*',
      '**/postcss.config.*',
      '**/rollup.config.*',
      '**/webpack.config.*',
      '**/*.png.ts',
      '**/packages/definitions/src/fhir/**',
    ],
  },
  coreConfig,
  tsConfig,
];
