import { createTheme, MantineColorsTuple } from '@mantine/core';

/**
 * MedSafe Brand Theme
 * Primary: Teal - Medication safety and compliance
 * Safety, medication, reliability
 */

const medsafeTeal: MantineColorsTuple = [
  '#E0F2F1',  // 0 - lightest
  '#B2DFDB',  // 1
  '#80CBC4',  // 2
  '#4DB6AC',  // 3
  '#26A69A',  // 4
  '#00796B',  // 5 - primary (default)
  '#006156',  // 6
  '#004940',  // 7
  '#00302B',  // 8
  '#001815',  // 9 - darkest
];

export const medsafeTheme = createTheme({
  primaryColor: 'medsafeTeal',
  colors: {
    medsafeTeal,
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

export default medsafeTheme;
