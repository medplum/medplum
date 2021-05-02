import { MedPlumClient } from 'medplum';
import {
  MedPlumProvider,
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

const medplum = new MedPlumClient({
  baseUrl: 'http://localhost:5000/',
  clientId: 'f051b8ed-105d-4e81-8ddc-c5c2af12f9d3',
});

export default function App() {
  return (
    <MedPlumProvider medplum={medplum}>
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
    </MedPlumProvider>
  );
}
