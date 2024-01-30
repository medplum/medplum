import turbosnap from 'vite-plugin-turbosnap';
import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: [
    '../src/stories/Introduction.stories.mdx',
    '../src/**/*.stories.mdx',
    '../src/**/*.stories.@(js|jsx|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    {
      name: '@storybook/addon-storysource',
      options: {
        loaderOptions: {
          injectStoryParameters: false,
        },
      },
    },
  ],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal(config, { configType }) {
    let finalConfig = config;

    if (configType === 'PRODUCTION') {
      finalConfig = mergeConfig(config, {
        plugins: [turbosnap({ rootDir: config.root ?? process.cwd() })],
      });
    }

    return finalConfig;
  },
};

export default config;
