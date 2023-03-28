module.exports = {
  core: {
    builder: 'webpack5',
  },
  typescript: {
    // Remove this after upgrading to Storybook 7
    reactDocgen: 'react-docgen-typescript-plugin'
  },
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-essentials'],
  staticDirs: ['../public'],
};
