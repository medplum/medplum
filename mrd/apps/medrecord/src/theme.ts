import { createTheme, MantineColorsTuple } from '@mantine/core';

/**
 * MEDrecord Brand Theme
 * Primary: Indigo - Core EHR functionality
 * Professional, enterprise, core
 */

const medrecordIndigo: MantineColorsTuple = [
  '#E8EAF6',  // 0 - lightest
  '#C5CAE9',  // 1
  '#9FA8DA',  // 2
  '#7986CB',  // 3
  '#5C6BC0',  // 4
  '#3F51B5',  // 5 - primary (default)
  '#324191',  // 6
  '#26316D',  // 7
  '#192049',  // 8
  '#0D1024',  // 9 - darkest
];

export const medrecordTheme = createTheme({
  primaryColor: 'medrecordIndigo',
  colors: {
    medrecordIndigo,
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

export default medrecordTheme;
