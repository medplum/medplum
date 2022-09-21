import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MedplumProvider } from '../src/MedplumProvider';

import '../src/defaulttheme.css';

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

export const decorators = [
  (Story) => (
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider withGlobalStyles withNormalizeCSS>
          <Story />
        </MantineProvider>
      </MedplumProvider>
    </BrowserRouter>
  ),
];
