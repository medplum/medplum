import { Button, Group, JsonInput, Title } from '@mantine/core';
import { Bundle } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
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
      <Title>Batch Create</Title>
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
        <JsonInput data-testid="batch-input" name="input" minRows={24} defaultValue={DEFAULT_VALUE} />
        <Group position="right" mt="xl" noWrap>
          <Button type="submit">Submit</Button>
        </Group>
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
