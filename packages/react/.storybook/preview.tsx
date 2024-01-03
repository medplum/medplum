import { MantineProvider, MantineThemeOverride } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { BrowserRouter } from 'react-router-dom';
import sinon from 'sinon';

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

const clock = sinon.useFakeTimers({
  now: new Date(2020, 4, 4, 3, 14),
  shouldAdvanceTime: false,
  toFake: ['Date'],
});
const medplum = new MockClient();
medplum.get('/').then(() => {
  clock.restore();
});

const theme: MantineThemeOverride = {
  headings: {
    sizes: {
      h1: {
        fontSize: '1.125rem',
        fontWeight: 500,
        lineHeight: 2.0,
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
};

export const decorators = [
  (Story) => (
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
          <Story />
        </MantineProvider>
      </MedplumProvider>
    </BrowserRouter>
  ),
];
