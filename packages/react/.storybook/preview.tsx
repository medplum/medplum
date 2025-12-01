import { MantineProvider, createTheme, useMantineColorScheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { DARK_MODE_EVENT_NAME } from '@vueless/storybook-dark-mode';
import { useEffect } from 'react';
import { BrowserRouter } from 'react-router';
import { addons } from 'storybook/preview-api';
import { createGlobalTimer } from '../src/stories/MockDateWrapper.utils';

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
  docs: {
    codePanel: true,
  },
};

const medplumDefaultTheme = createTheme({
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

// wrap initialization of MockClient and initial page navigation
// so that resources created in MockFetchClient#initMockRepo have
// consistent timestamps between storybook runs
const clock = createGlobalTimer();
const medplum = new MockClient();
medplum.get('/').then(() => {
  clock.restore();
});

function ColorSchemeWrapper({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useMantineColorScheme();
  useEffect(() => {
    const channel = addons.getChannel();
    channel.on(DARK_MODE_EVENT_NAME, (darkMode: boolean) => {
      setColorScheme(darkMode ? 'dark' : 'light');
    });
  }, []);
  return <>{children}</>;
}

export const decorators = [
  (Story: any) => (
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <Story />
      </MedplumProvider>
    </BrowserRouter>
  ),
  (Story: any) => (
    <ColorSchemeWrapper>
      <Story />
    </ColorSchemeWrapper>
  ),
  (Story: any) => (
    <MantineProvider theme={medplumDefaultTheme}>
      <Story />
    </MantineProvider>
  ),
];
