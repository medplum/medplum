import type { StorybookConfig } from '@storybook/react-vite';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/stories/Introduction.mdx', '../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-docs', '@vueless/storybook-dark-mode'],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(inputConfig, { configType }) {
    let config = inputConfig;
    if (configType === 'PRODUCTION') {
      config = mergeConfig(config, {
        // plugins: [turbosnap({ rootDir: config.root ?? process.cwd() })],
      });
    } else if (configType === 'DEVELOPMENT') {
      const aliasEntries: Record<string, string> = {
        '@medplum/core': path.resolve(import.meta.dirname, '../../core/src'),
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
