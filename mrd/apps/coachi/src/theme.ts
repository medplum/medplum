import { createTheme, MantineColorsTuple } from '@mantine/core';

/**
 * Coachi Brand Theme
 * Primary: Green - Coaching and mental health support
 * Growth, wellness, coaching
 */

const coachiGreen: MantineColorsTuple = [
  '#E8F5E9',  // 0 - lightest
  '#C8E6C9',  // 1
  '#A5D6A7',  // 2
  '#81C784',  // 3
  '#66BB6A',  // 4
  '#2E7D32',  // 5 - primary (default)
  '#256427',  // 6
  '#1B4B1D',  // 7
  '#123212',  // 8
  '#091908',  // 9 - darkest
];

export const coachiTheme = createTheme({
  primaryColor: 'coachiGreen',
  colors: {
    coachiGreen,
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

export default coachiTheme;
