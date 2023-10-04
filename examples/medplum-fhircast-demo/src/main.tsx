import { MantineProvider, MantineThemeOverride } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root not found in HTML!');
}

const theme: MantineThemeOverride = {
  primaryColor: 'teal',
  primaryShade: 8,
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.125rem',
  },
  components: {
    Container: {
      defaultProps: {
        size: 1200,
      },
    },
  },
};

const medplum = new MedplumClient({
  onUnauthenticated: () => (window.location.href = '/'),
  // baseUrl: 'http://localhost:8103/', // Uncomment this to run against the server on your localhost
});

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
          <App />
        </MantineProvider>
      </MedplumProvider>
    </BrowserRouter>
  </React.StrictMode>
);
