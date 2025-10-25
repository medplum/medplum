import { createTheme } from '@mantine/core';
import { withMantineThemes } from 'storybook-addon-mantine';

const medplumDefault = createTheme({
  headings: {
    sizes: {
      h1: {
        fontSize: '1.125rem',
        fontWeight: '500',
        lineHeight: '2.0',
      },
    },
  },
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '1.0rem',
    xl: '1.125rem',
  },
});

const fooMedical = createTheme({
  colors: {
    // Replace or adjust with the exact colors used for your design
    primary: [
      '#f7f7f7', // primary[0]
      '#eef6f4', // primary[1]
      '#e3eff2', // primary[2]
      '#d5ebec', // primary[3]
      '#cfe7e9', // primary[4]
      '#b0d7db', // primary[5]
      '#39acbc', // primary[6]
      '#005450', // primary[7]
      '#004d49', // primary[8]
      '#00353a', // primary[9] (adjusted for a darker shade)
    ],
    secondary: [
      '#fff7eb', // secondary[0]
      '#ffedce', // secondary[1]
      '#fae3c3', // secondary[2]
      '#e9d1b9', // secondary[3]
      '#e8c9a6', // secondary[4]
      '#f1dfca', // secondary[5]
      '#ffc776', // secondary[6]
      '#fa645a', // secondary[7]
      '#b57931', // secondary[8]
      '#935923', // secondary[9] (adjusted for a darker shade)
    ],
  },
  primaryColor: 'primary',
  fontFamily: 'Ginto, helvetica',
  radius: {
    xs: '.5rem',
    sm: '.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2.5rem',
  },
  spacing: {
    xs: '.25rem',
    sm: '.33rem',
    md: '.5rem',
    lg: '.66rem',
    xl: '1rem',
  },
  defaultRadius: 'xl',
  shadows: {
    xs: '0px 0px 0px rgba(0, 0, 0, 0)',
    md: '2px 2px 1.5px rgba(0, 0, 0, .25)',
    xl: '5px 5px 3px rgba(0, 0, 0, .25)',
  },
  headings: {
    fontFamily: 'GT Super Display, serif',
    sizes: {
      h1: { fontSize: '30px', lineHeight: '1.4' },
      h2: { fontSize: '24px', lineHeight: '1.35' },
      h3: { fontSize: '20px', lineHeight: '1.3' },
      h4: { fontSize: '18px', lineHeight: '1.25' },
      h5: { fontSize: '16px', lineHeight: '1.2' },
      h6: { fontSize: '14px', lineHeight: '1.15' },
    },
  },
});

const bonFoo = createTheme({
  components: {
    Paper: {
      defaultProps: {
        p: 'sm',
        shadow: 'xs',
      },
    },
    Table: {
      defaultProps: {
        striped: false,
        // m: '16px',
      },
    },
  },
  fontFamily:
    '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji',
  shadows: {
    xs: 'none',
    sm: 'none',
    md: 'none',
    lg: 'none',
    xl: 'none',
  },
  spacing: {
    xs: '8px',
    sm: '10px',
    md: '12px',
    lg: '14px',
    xl: '16px',
  },
  colors: {
    destructive: [
      '#FFF5F5',
      '#FFE3E3',
      '#FFC9C9',
      '#FFA8A8',
      '#FF8787',
      '#FF6B6B',
      '#FA5252',
      '#F03E3E',
      '#E03131',
      '#C92A2A',
    ],
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5C5F66',
      '#373A40',
      '#2C2E33',
      '#25262B',
      '#1A1B1E',
      '#141517',
      '#101113',
    ],
    primary: [
      '#E7F5FF',
      '#D0EBFF',
      '#A5D8FF',
      '#74C0FC',
      '#4DABF7',
      '#339AF0',
      '#228BE6',
      '#1C7ED6',
      '#1971C2',
      '#1864AB',
    ],
    neutral: [
      '#F8F9FA',
      '#F1F3F5',
      '#E9ECEF',
      '#DEE2E6',
      '#CED4DA',
      '#ADB5BD',
      '#868E96',
      '#495057',
      '#343A40',
      '#212529',
    ],
  },
});

const plumMedical = createTheme({
  components: {
    Divider: {
      defaultProps: {
        my: '0',
      },
    },
  },
  colors: {
    primary: [
      '#eef6f4',
      '#00D7AB',
      '#00B395',
      '#00907E',
      '#008062',
      '#005450',
      '#004D49',
      '#003F3B',
      '#003231',
      '#002824',
    ],
    destructive: [
      '#e8d3cf',
      '#ddb3b0',
      '#d59091',
      '#cf6e77',
      '#ca4956',
      '#bc2f3d',
      '#a0222f',
      '#821722',
      '#620e16',
      '#400707',
    ],
  },
  primaryColor: 'primary',
  primaryShade: 6,
  shadows: {
    xs: '0px 0px 0px rgba(0, 0, 0, 0)',
    sm: '0px 0px 0px rgba(0, 0, 0, 0)',
    md: '0px 0px 0px rgba(0, 0, 0, 0)',
    lg: '0px 0px 0px rgba(0, 0, 0, 0)',
    xl: '0px 0px 0px rgba(0, 0, 0, 0)',
  },
  fontFamily: '"Ginto", helvetica, "sans-serif"',
  headings: { fontFamily: 'GT Super Display, Times New Roman, "serif"' },
  fontSizes: {
    xs: '12px',
    sm: '14px',
    md: '18px',
    lg: '22px',
    xl: '30px',
  },
  radius: {
    xs: '5px',
    sm: '7px',
    md: '9px',
    lg: '11px',
    xl: '13px',
  },
  defaultRadius: 'lg',
  spacing: {
    xs: '.5rem',
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
    xl: '2.5rem',
  },
});

const materialUi = createTheme({
  fontFamily: 'Roboto, Helvetica, Arial, "sans-serif"',
  fontSizes: {
    xs: '.7rem',
    sm: '.85rem',
    md: '1rem',
    lg: '1.2rem',
    xl: '1.4rem',
  },
  colors: {
    primary: [
      '#cce5ff',
      '#99ccff',
      '#66b2ff',
      '#3399ff',
      '#0073e6',
      '#0288d1',
      '#006bd6',
      '#0061c2',
      '#004c99',
      '#0037a5',
    ],
  },
  primaryColor: 'primary',
  primaryShade: 4,
  shadows: {
    xs: '0px 2px 1px -1px rgba(0, 0, 0, 0.2)',
    sm: '0px 2px 1px -1px rgba(0, 0, 0, 0.2)',
    md: '0px 1px 1px 0px rgba(0, 0, 0, 0.14)',
    lg: '0px 1px 1px 0px rgba(0, 0, 0, 0.14)',
    xl: '0px 1px 3px 0px rgba(0, 0, 0, 0.12)',
  },
  radius: {
    xs: '0px',
    sm: '2px',
    md: '4px',
    lg: '6px',
    xl: '8px',
  },
  spacing: {
    xs: '4px 8px',
    sm: '6px 12px',
    md: '8px 16px',
    lg: '10px 20px',
    xl: '12px 24px',
  },
});

const sciFi = createTheme({
  fontFamily: '"Gill Sans", arial, "sans-serif"',
  colors: {
    primary: [
      '#FFFBB7',
      '#FFF891',
      '#FFF56A',
      '#FFF244',
      '#FFE81F',
      '#FFD900',
      '#ffb300',
      '#f59b00',
      '#eb8500',
      '#e07000',
    ],
  },
  primaryColor: 'primary',
  primaryShade: 6,
  black: '#412538',
  radius: {
    xs: '20px 10px',
    sm: '30px 15px',
    md: '40px 20px',
    lg: '50px 25px',
    xl: '60px 30px',
  },
  shadows: {
    xs: '2px 1px 1px -1px #939393',
    md: '3px 2px 1px -1px #939393',
    xl: '4px 3px 1px -1px #939393',
  },
  spacing: {
    xs: '1px',
    sm: '3px',
    md: '5px',
    lg: '7px',
    xl: '9px',
  },
  lineHeights: {
    xs: '12px',
    sm: '16px',
    md: '20px',
    lg: '24px',
    xl: '30px',
  },
});

const cursive = createTheme({
  fontFamily: '"Brush Script MT", serif',
  colors: {
    primary: [
      '#fce8e8',
      '#f7cfd5',
      '#f1bcc9',
      '#e7a6c0',
      '#d987b0',
      '#c770a4',
      '#b65d9c',
      '#a85d9a',
      '#845282',
      '#604965',
    ],
  },
  primaryColor: 'primary',
  primaryShade: 5,
  radius: {
    xs: '0',
    sm: '0',
    md: '0',
    lg: '0',
    xl: '0',
  },
  shadows: {
    xs: '4px 4px 3px grey',
    sm: '8px 8px 3px grey',
    md: '12px 12px 3px grey',
    lg: '16px 16px 3px grey',
    xl: '20px 20px 3px grey',
  },
});

const caesar = createTheme({
  fontFamily: '"Caesar Dressing", serif',
  fontSizes: {
    xs: '.8rem',
    sm: '.9rem',
    md: '1rem',
    lg: '1.1rem',
    xl: '1.2rem',
  },
  colors: {
    primary: [
      '#fd5d6b',
      '#fb3737',
      '#f81b1b',
      '#d70909',
      '#a00808',
      '#810e0e',
      '#601410',
      '#4b1711',
      '#34150f',
      '#25120e',
    ],
  },
  primaryColor: 'primary',
  primaryShade: 4,
  shadows: {
    xs: '3px 3px 2px grey',
    xl: '5px 5px 2px grey',
  },
});

const wordArt = createTheme({
  fontFamily: '"Bungee Spice", "sans-serif"',
  defaultRadius: '0px',
  shadows: {
    xs: '0px 0px 0px',
    sm: '0px 0px 0px',
    md: '0px 0px 0px',
    lg: '0px 0px 0px',
    xl: '0px 0px 0px',
  },
  colors: {
    primary: [
      '#bcfeae',
      '#90fa85',
      '#64f55c',
      '#34ed31',
      '#1acf17',
      '#1da21a',
      '#1c7e1b',
      '#1d5e20',
      '#183f1c',
      '#122b17',
    ],
  },
  primaryColor: 'primary',
  primaryShade: 4,
  spacing: {
    xs: '12px',
    sm: '16px',
    md: '20px',
    lg: '24px',
    xl: '30px',
  },
});

export const themes = withMantineThemes({
  themes: [
    {
      id: 'medplumDefault',
      name: 'Medplum Default',
      ...medplumDefault,
    },
    {
      id: 'foomedical',
      name: 'Foo Medical',
      ...fooMedical,
    },
    {
      id: 'bonfoo',
      name: 'Bon Foo',
      ...bonFoo,
    },
    {
      id: 'plumMedical',
      name: 'PlumMedical',
      ...plumMedical,
    },
    {
      id: 'materialUi',
      name: 'Material UI',
      ...materialUi,
    },
    {
      id: 'sci-fi',
      name: 'SciFi',
      ...sciFi,
    },
    {
      id: 'cursive',
      name: 'Cursive',
      ...cursive,
    },
    {
      id: 'caesar',
      name: 'Caesar',
      ...caesar,
    },
    {
      id: 'word-art',
      name: 'Word Art',
      ...wordArt,
    },
  ],
});
