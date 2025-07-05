import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const medplum = new MedplumClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MedplumProvider medplum={medplum}>
      <App />
    </MedplumProvider>
  </StrictMode>
);
