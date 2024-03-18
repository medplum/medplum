import { MantineProvider, MantineThemeOverride, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { BrowserRouter } from 'react-router-dom';
import { createGlobalTimer } from '../src/stories/MockDateWrapper.utils';
import { withMantineThemes } from 'storybook-addon-mantine';

export const parameters = {
  layout: 'fullscreen',
  actions: { argTypesRegex: '^on[A-Z].*' },
  viewMode: 'docs',
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

// wrap intialization of MockClient and initial page navigation
// so that resources created in MockFetchClient#initMockRepo have
// consistent timestamps between storybook runs
const clock = createGlobalTimer();
const medplum = new MockClient();
medplum.get('/').then(() => {
  clock.restore();
});

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
  colorScheme: 'light',
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
        striped: true,
      },
    },
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

export const decorators = [
  withMantineThemes({
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
    ],
  }),
  (Story) => (
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <Story />
      </MedplumProvider>
    </BrowserRouter>
  ),
];
