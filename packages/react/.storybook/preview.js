import { MantineTheme, MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MedplumProvider } from '../src/MedplumProvider';

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
medplum.requestSchema('Patient');

const theme = {
  fontSizes: {
    xs: 11,
    sm: 14,
    md: 14,
    lg: 16,
    xl: 18,
  }
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
