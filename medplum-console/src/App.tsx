import { MedplumClient } from 'medplum';
import {
  MedplumProvider,
  Autocomplete,
  Button,
  CssBaseline,
  DefaultTheme,
  Document,
  FormSection,
  Header,
  TextField
} from 'medplum-ui';
import React from 'react';
import { Router } from 'react-router-dom';
import { history } from './history';

const medplum = new MedplumClient({
  baseUrl: process.env.MEDPLUM_BASE_URL,
  clientId: process.env.MEDPLUM_CLIENT_ID,
});

export default function App() {
  return (
    <MedplumProvider medplum={medplum}>
      <Router history={history}>
        <CssBaseline />
        <DefaultTheme />
        <Header
          onLogin={() => console.log('onLogin')}
          onLogout={() => console.log('onLogout')}
          onCreateAccount={() => console.log('onCreateAccount')}
        />
        <Document>
          <FormSection title="Name" description="Official name or nickname of the person">
            <TextField id="name" />
          </FormSection>
          <FormSection title="Patient" description="Autocomplete test">
            <Autocomplete id="patient" resourceType="Patient" />
          </FormSection>
          <Button>Submit</Button>
        </Document>
      </Router>
    </MedplumProvider>
  );
}
