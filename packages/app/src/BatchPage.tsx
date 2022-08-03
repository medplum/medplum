import { Bundle } from '@medplum/fhirtypes';
import { Button, Document, Form, TextArea, useMedplum } from '@medplum/react';
import React, { useState } from 'react';

const DEFAULT_VALUE = `{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "name": [{
          "given": ["Alice"],
          "family": "Smith"
        }]
      },
      "request": {
        "method": "POST",
        "url": "Patient"
      }
    }
  ]
}`;

export function BatchPage(): JSX.Element {
  const medplum = useMedplum();
  const [output, setOutput] = useState<Bundle>();
  return (
    <Document>
      <h1>Batch Create</h1>
      <p>
        Use this page to create, read, or update multiple resources. For more details, see&nbsp;
        <a href="https://www.hl7.org/fhir/http.html#transaction">FHIR Batch and Transaction</a>.
      </p>
      <h3>Input</h3>
      <Form
        onSubmit={(formData: Record<string, string>) => {
          setOutput(undefined);
          medplum.executeBatch(JSON.parse(formData.input)).then(setOutput).catch(console.log);
        }}
      >
        <TextArea name="input" testid="batch-input" defaultValue={DEFAULT_VALUE} monospace={true} />
        <Button type="submit">Submit</Button>
      </Form>
      {output && (
        <>
          <h3>Output</h3>
          <pre style={{ border: '1px solid #888' }}>{JSON.stringify(output, undefined, 2)}</pre>
        </>
      )}
    </Document>
  );
}
