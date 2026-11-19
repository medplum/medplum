// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { medplumEslintConfig } from '@medplum/eslint-config';
import { defineConfig } from 'eslint/config';

const TEST_RENDER_MESSAGE =
  'Render through the package\'s test-utils/render, which wraps tests in MantineProvider with env="test" (no transitions, no portals, and Popover dropdowns stay visible in jsdom).';

export default defineConfig(
  medplumEslintConfig,
  {
    files: ['packages/**/*.test.tsx', 'examples/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "JSXOpeningElement[name.name='MantineProvider']", message: TEST_RENDER_MESSAGE },
      ],
    },
  },
  {
    files: ['packages/**/*.test.tsx', 'examples/**/*.test.tsx'],
    ignores: [
      // No Mantine; tests render with @testing-library/react directly
      'packages/dosespot-react/**',
      'packages/react-hooks/**',
      'packages/scriptsure-react/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: '@testing-library/react', importNames: ['render'], message: TEST_RENDER_MESSAGE }] },
      ],
    },
  }
);
