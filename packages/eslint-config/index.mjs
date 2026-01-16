// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import eslint from '@eslint/js';
import headerPlugin from 'eslint-plugin-header';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import noOnlyTestsPlugin from 'eslint-plugin-no-only-tests';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import sonarJs from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';
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
  settings: {
    jsdoc: {
      tagNamePreference: {
        default: 'defaultValue',
      },
    },
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
        parserOptions: { projectService: true },
      },
    },
    tseslint.configs.strict,
    reactHooks.configs.flat.recommended,
    reactRefresh.configs.recommended,
    sonarJs.configs.recommended,
  ],
  plugins: {
    unicorn: unicornPlugin,
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
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
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

    // SonarJS
    'sonarjs/cognitive-complexity': 'off',
    'sonarjs/todo-tag': 'off',
    'sonarjs/deprecation': 'off',
    'sonarjs/no-clear-text-protocols': 'off',
    'sonarjs/sql-queries': 'off',
    'sonarjs/no-nested-template-literals': 'warn', // Should try to turn on
    'sonarjs/function-return-type': 'off',
    'sonarjs/use-type-alias': 'off',
    'sonarjs/no-unused-vars': 'off', // Already caught by TypeScript in actually bad cases; this rule is too strict
    'sonarjs/regex-complexity': 'warn',
    'sonarjs/different-types-comparison': 'off',
    'sonarjs/no-alphabetical-sort': 'off', // ?
    'sonarjs/pseudo-random': 'warn',
    'sonarjs/no-small-switch': 'off',
    'sonarjs/prefer-read-only-props': 'warn', // ?
    'sonarjs/no-duplicated-branches': 'warn',
    'sonarjs/no-nested-functions': 'warn',
    'sonarjs/public-static-readonly': 'warn',

    // Unicorn (included by SonarQube)
    // https://github.com/SonarSource/SonarJS/blob/master/packages/jsts/src/rules/README.md#eslint-rules
    'unicorn/catch-error-name': ['error', { ignore: ['err', 'e'] }],
    'unicorn/consistent-date-clone': 'error',
    'unicorn/consistent-empty-array-spread': 'error',
    'unicorn/consistent-function-scoping': 'warn',
    'unicorn/error-message': 'error',
    'unicorn/new-for-builtins': 'error',
    'unicorn/no-abusive-eslint-disable': 'error',
    'unicorn/no-accessor-recursion': 'error',
    'unicorn/no-anonymous-default-export': 'error',
    'unicorn/no-array-method-this-argument': 'error',
    'unicorn/no-await-expression-member': 'warn',
    'unicorn/no-for-loop': 'error',
    'unicorn/no-instanceof-builtins': 'error',
    'unicorn/no-invalid-fetch-options': 'error',
    'unicorn/no-named-default': 'error',
    'unicorn/no-negated-condition': 'warn',
    'unicorn/no-negation-in-equality-check': 'warn',
    'unicorn/no-object-as-default-parameter': 'error',
    'unicorn/no-single-promise-in-promise-methods': 'error',
    'unicorn/no-thenable': 'error',
    'unicorn/no-this-assignment': 'error',
    'unicorn/no-typeof-undefined': 'error',
    'unicorn/no-unnecessary-polyfills': 'error',
    'unicorn/no-unreadable-iife': 'error',
    'unicorn/no-useless-fallback-in-spread': 'error',
    'unicorn/no-useless-length-check': 'error',
    'unicorn/no-useless-promise-resolve-reject': 'error',
    'unicorn/no-useless-spread': 'error',
    'unicorn/no-zero-fractions': 'error',
    'unicorn/numeric-separators-style': 'error',
    'unicorn/prefer-array-find': 'error',
    'unicorn/prefer-array-flat': 'error',
    'unicorn/prefer-array-flat-map': 'error',
    'unicorn/prefer-array-index-of': 'error',
    'unicorn/prefer-array-some': 'error',
    'unicorn/prefer-class-fields': 'error',
    'unicorn/prefer-code-point': 'error',
    'unicorn/prefer-date-now': 'error',
    'unicorn/prefer-default-parameters': 'error',
    'unicorn/prefer-dom-node-dataset': 'error',
    'unicorn/prefer-dom-node-remove': 'error',
    'unicorn/prefer-export-from': 'error',
    'unicorn/prefer-global-this': 'off', // ?
    'unicorn/prefer-includes': 'error',
    'unicorn/prefer-math-min-max': 'error',
    'unicorn/prefer-math-trunc': 'error',
    'unicorn/prefer-modern-dom-apis': 'error',
    'unicorn/prefer-modern-math-apis': 'error',
    'unicorn/prefer-native-coercion-functions': 'error',
    'unicorn/prefer-negative-index': 'error',
    'unicorn/prefer-node-protocol': 'error',
    'unicorn/prefer-number-properties': 'error',
    'unicorn/prefer-prototype-methods': 'error',
    'unicorn/prefer-regexp-test': 'error',
    'unicorn/prefer-set-has': 'off', // Array.includes() is often faster in practice for small arrays; too strict
    'unicorn/prefer-set-size': 'error',
    'unicorn/prefer-single-call': 'error',
    'unicorn/prefer-string-raw': 'warn',
    'unicorn/prefer-string-replace-all': 'error',
    'unicorn/prefer-string-trim-start-end': 'error',
    'unicorn/prefer-structured-clone': 'warn', // ?
    'unicorn/prefer-top-level-await': 'off', // ?
    'unicorn/prefer-type-error': 'warn',
    'unicorn/require-module-specifiers': 'error',
    'unicorn/no-array-callback-reference': 'error',
    'unicorn/no-array-for-each': 'error',
    'unicorn/prefer-at': 'error',
  },
};

/**
 * Test config applies to all TypeScript test files.
 * These are test-specific rules that don't apply to regular source files.
 * @type {import("@eslint/config-helpers").ConfigWithExtends}
 */
export const testConfig = {
  files: ['**/*.test.ts', '**/*.test.tsx'],
  extends: [
    {
      languageOptions: {
        parserOptions: { projectService: true },
      },
    },
  ],
  plugins: {
    'no-only-tests': noOnlyTestsPlugin,
  },
  rules: {
    // No Only Tests
    'no-only-tests/no-only-tests': ['error', { fix: true }],

    // SonarJS
    'sonarjs/no-hardcoded-passwords': 'off',
    'sonarjs/no-hardcoded-ip': 'off',
    'sonarjs/no-hardcoded-secrets': 'off',
    'sonarjs/slow-regex': 'off',
    'sonarjs/no-duplicated-branches': 'off',
    'sonarjs/no-identical-functions': 'off',
    'sonarjs/publicly-writable-directories': 'off',
    'sonarjs/no-nested-functions': 'off',
    'unicorn/prefer-dom-node-dataset': 'off',
  },
};

export const examplesConfig = {
  files: ['packages/examples/**/*.ts', 'packages/examples/**/*.tsx'],
  extends: [
    {
      languageOptions: {
        parserOptions: { projectService: true },
      },
    },
  ],
  rules: {
    // SonarJS
    'sonarjs/no-hardcoded-passwords': 'off',
    'sonarjs/no-hardcoded-ip': 'off',
    'sonarjs/no-hardcoded-secrets': 'off',
    'sonarjs/no-duplicated-branches': 'off',
    'sonarjs/no-identical-functions': 'off',
    'sonarjs/no-commented-code': 'off',
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
  testConfig,
  examplesConfig,
];
