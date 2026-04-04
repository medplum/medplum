import { createTheme, MantineColorsTuple } from '@mantine/core';

/**
 * HealthTalk Brand Theme
 * Primary: Blue - Healthcare communication platform
 * Trust, healthcare, communication
 */

const healthtalkBlue: MantineColorsTuple = [
  '#E6F0FF',  // 0 - lightest
  '#CCE0FF',  // 1
  '#99C2FF',  // 2
  '#66A3FF',  // 3
  '#3385FF',  // 4
  '#0066CC',  // 5 - primary (default)
  '#0052A3',  // 6
  '#003D7A',  // 7
  '#002952',  // 8
  '#001429',  // 9 - darkest
];

export const healthtalkTheme = createTheme({
  primaryColor: 'healthtalkBlue',
  colors: {
    healthtalkBlue,
  },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
    fontWeight: '600',
  },
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        radius: 'md',
        shadow: 'sm',
      },
    },
  },
});

export default healthtalkTheme;
