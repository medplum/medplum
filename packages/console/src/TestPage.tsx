import React from 'react';
import { Autocomplete, Button, Document, FormSection, TextField } from '@medplum/ui';

export function TestPage() {
  return (
    <Document>
      <FormSection title="Name" description="Official name or nickname of the person">
        <TextField id="name" />
      </FormSection>
      <FormSection title="Patient" description="Autocomplete test">
        <Autocomplete id="patient" resourceType="Patient" />
      </FormSection>
      <Button>Submit</Button>
    </Document>
  );
}
