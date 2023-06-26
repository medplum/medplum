import { MantineProvider, MantineThemeOverride } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MedplumProvider } from '../src/MedplumProvider/MedplumProvider';

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

const medplum = new MockClient();
medplum.get('/');

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
