import { Button, CssBaseline, DefaultTheme, Document, FormSection, Header, TextField } from 'medplum-components';
import React from 'react';

export default function App() {
  return (
    <>
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
        <Button>Submit</Button>
      </Document>
    </>
  );
}
