import type { StorybookConfig } from '@storybook/react-vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config: StorybookConfig = {
  stories: ['../src/stories/Introduction.mdx', '../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-docs', '@vueless/storybook-dark-mode'],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config, { configType }) {
    if (configType === 'PRODUCTION') {
      config = mergeConfig(config, {
        // plugins: [turbosnap({ rootDir: config.root ?? process.cwd() })],
      });
    } else if (configType === 'DEVELOPMENT') {
      config = mergeConfig(config, {
        resolve: {
          alias: {
            '@medplum/core': path.resolve(__dirname, '../../core/src'),
            '@medplum/react-hooks': path.resolve(__dirname, '../../react-hooks/src'),
          },
        },
      });
    }
          },
        },
      });
    }

    return config;
  },
};

export default config;
