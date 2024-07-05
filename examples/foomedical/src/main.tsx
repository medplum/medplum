import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';

const medplum = new MedplumClient({
  // To run FooMedical locally, you can set the baseURL in this constructor
  // baseUrl: http://localhost:8103
  onUnauthenticated: () => (window.location.href = '/'),
});

const theme = createTheme({
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
});

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider theme={theme}>
          <Notifications />
          <App />
        </MantineProvider>
      </MedplumProvider>
    </BrowserRouter>
  </StrictMode>
);
