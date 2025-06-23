import type { StorybookConfig } from '@storybook/react-vite';
import path from 'path';
import { mergeConfig } from 'vite';
import turbosnap from 'vite-plugin-turbosnap';

const config: StorybookConfig = {
  stories: ['../src/stories/Introduction.mdx', '../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-links', 'storybook-addon-mantine'],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  async viteFinal(inputConfig, { configType }) {
    let config = inputConfig;

    if (configType === 'PRODUCTION') {
      config = mergeConfig(config, {
        plugins: [turbosnap({ rootDir: config.root ?? process.cwd() })],
      });
    } else if (configType === 'DEVELOPMENT') {
      config = mergeConfig(config, {
        resolve: {
          alias: {
            '@medplum/core': path.resolve(__dirname, '../../core/src'),
          },
        },
      });
    }

    return config;
  },
};

export default config;
