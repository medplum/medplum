const mantinePreset = require('postcss-preset-mantine');
const simpleVars = require('postcss-simple-vars');

module.exports = {
  plugins: [
    mantinePreset(),
    simpleVars({
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    }),
  ],
};
