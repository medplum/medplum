import { MockClient } from '@medplum/mock';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MedplumProvider } from '../src/MedplumProvider';
import '../src/CssBaseline.css';
import '../src/DefaultTheme.css';

export const parameters = {
  layout: 'fullscreen',
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

const medplum = new MockClient({ debug: true });

export const decorators = [
  (Story) => (
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <Story />
      </MedplumProvider>
    </BrowserRouter>
  ),
];
