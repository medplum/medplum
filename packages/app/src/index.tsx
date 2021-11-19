import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';

const medplum = new MedplumClient({
  baseUrl: process.env.MEDPLUM_BASE_URL as string,
  clientId: process.env.MEDPLUM_CLIENT_ID as string,
  onUnauthenticated: () => window.location.href = '/signin'
});

ReactDOM.render(
  <React.StrictMode>
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <App />
      </MedplumProvider>
    </BrowserRouter>
  </React.StrictMode>,
  document.getElementById('root')
);
