import type { StorybookConfig } from '@storybook/react-vite';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: [
    '../src/stories/Introduction.mdx', // redundant, but ensure Intro goes first
    '../src/**/*.mdx',
    '../src/**/*.stories.@(ts|tsx)',
    '../../react/src/**/*.stories.@(ts|tsx)',
    '../../react-scheduling/src/**/*.mdx',
    '../../react-scheduling/src/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-links', '@storybook/addon-docs', '@vueless/storybook-dark-mode'],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(inputConfig, { configType }) {
    // Stories and docs are pulled in from sibling packages, so bare specifiers such as
    // "@storybook/addon-docs/blocks" resolve against those packages' own node_modules.
    // Without deduping, the docs blocks and their emotion theme context get bundled twice,
    // and blocks imported from a sibling package render with an empty theme.
    let config = mergeConfig(inputConfig, {
      resolve: {
        dedupe: [
          'storybook',
          '@storybook/addon-docs',
          '@storybook/react',
          '@storybook/react-dom-shim',
          'react',
          'react-dom',
        ],
      },
    });
    if (configType === 'PRODUCTION') {
      config = mergeConfig(config, {
        // plugins: [turbosnap({ rootDir: config.root ?? process.cwd() })],
      });
    } else if (configType === 'DEVELOPMENT') {
      const aliasEntries: Record<string, string> = {
        '@medplum/core': path.resolve(import.meta.dirname, '../../core/src'),
        '@medplum/react': path.resolve(import.meta.dirname, '../../react/src'),
        '@medplum/react-hooks': path.resolve(import.meta.dirname, '../../react-hooks/src'),
        '@medplum/mock': path.resolve(import.meta.dirname, '../../mock/src'),
        '@medplum/fhir-router': path.resolve(import.meta.dirname, '../../fhir-router/src'),
        '@medplum/definitions': path.resolve(import.meta.dirname, '../../definitions/src'),
      };

      // Only add aliases for paths that exist
      const alias = Object.fromEntries(Object.entries(aliasEntries).filter(([, aliasPath]) => existsSync(aliasPath)));

      config = mergeConfig(config, {
        resolve: {
          alias,
        },
        server: {
          fs: {
            allow: [path.resolve(__dirname, '../..')],
          },
        },
      });
    }

    return config;
  },
};

export default config;
