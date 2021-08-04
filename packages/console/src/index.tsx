import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import React from 'react';
import ReactDOM from 'react-dom';
import { App } from './App';
import { history } from './history';

const medplum = new MedplumClient({
  baseUrl: process.env.MEDPLUM_BASE_URL as string,
  clientId: process.env.MEDPLUM_CLIENT_ID as string,
  onUnauthenticated: () => history.push('/signin')
});

ReactDOM.render(
  <React.StrictMode>
    <MedplumProvider medplum={medplum} router={history}>
      <App />
    </MedplumProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
