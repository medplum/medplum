import {
  AuthProvider,
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

export default function App() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}
