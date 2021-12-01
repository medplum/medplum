import { Button, Document, Form, useMedplum } from '@medplum/ui';
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

export function BatchPage() {
  const medplum = useMedplum();
  const [output, setOutput] = useState();
  return (
    <Document>
      <h1>Batch Create</h1>
      <p>
        Use this page to create, read, or update multiple resources.
        For more details, see&nbsp;<a href="https://www.hl7.org/fhir/http.html#transaction">FHIR Batch and Transaction</a>.
      </p>
      <h3>Input</h3>
      <Form onSubmit={(formData: any) => {
        setOutput(undefined);
        medplum.post('fhir/R4', JSON.parse(formData.input))
          .then(response => {
            setOutput(response);
          });
      }}>
        <textarea
          name="input"
          data-testid="batch-input"
          rows={20}
          cols={80}
          defaultValue={DEFAULT_VALUE}
        />
        <Button type="submit">Submit</Button>
      </Form>
      {output && (
        <>
          <h3>Output</h3>
          <pre style={{border: '1px solid #888'}}>{JSON.stringify(output, undefined, 2)}</pre>
        </>
      )}
    </Document>
  );
}
