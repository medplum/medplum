import { Button, Group, JsonInput, Tabs, Text, Title, useMantineTheme } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { Bundle } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
import { IconUpload, IconX } from '@tabler/icons';
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
  const theme = useMantineTheme();
  const medplum = useMedplum();
  const [output, setOutput] = useState<Bundle>();

  function submitBatch(str: string): void {
    setOutput(undefined);
    medplum.executeBatch(JSON.parse(str)).then(setOutput).catch(console.log);
  }

  return (
    <Document>
      <Title>Batch Create</Title>
      <p>
        Use this page to create, read, or update multiple resources. For more details, see&nbsp;
        <a href="https://www.hl7.org/fhir/http.html#transaction">FHIR Batch and Transaction</a>.
      </p>
      {!output && (
        <>
          <h3>Input</h3>
          <Tabs defaultValue="upload">
            <Tabs.List>
              <Tabs.Tab value="upload">File Upload</Tabs.Tab>
              <Tabs.Tab value="json">JSON</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="upload" pt="xs">
              <Dropzone
                onDrop={(files) => {
                  const reader = new FileReader();
                  reader.onload = (e) => submitBatch(e.target?.result as string);
                  reader.readAsText(files[0]);
                }}
                accept={['application/json']}
              >
                <Group position="center" spacing="xl" style={{ minHeight: 220, pointerEvents: 'none' }}>
                  <Dropzone.Accept>
                    <IconUpload size={50} stroke={1.5} color={theme.colors[theme.primaryColor][5]} />
                  </Dropzone.Accept>
                  <Dropzone.Reject>
                    <IconX size={50} stroke={1.5} color={theme.colors.red[5]} />
                  </Dropzone.Reject>
                  <Dropzone.Idle>
                    <IconUpload size={50} stroke={1.5} />
                  </Dropzone.Idle>

                  <div>
                    <Text size="xl" inline>
                      Drag files here or click to select files
                    </Text>
                    <Text size="sm" color="dimmed" inline mt={7}>
                      Attach as many files as you like
                    </Text>
                  </div>
                </Group>
              </Dropzone>
            </Tabs.Panel>

            <Tabs.Panel value="json" pt="xs">
              <Form onSubmit={(formData: Record<string, string>) => submitBatch(formData.input)}>
                <JsonInput data-testid="batch-input" name="input" minRows={20} defaultValue={DEFAULT_VALUE} />
                <Group position="right" mt="xl" noWrap>
                  <Button type="submit">Submit</Button>
                </Group>
              </Form>
            </Tabs.Panel>
          </Tabs>
        </>
      )}
      {output && (
        <>
          <h3>Output</h3>
          <pre style={{ border: '1px solid #888' }}>{JSON.stringify(output, undefined, 2)}</pre>
          <Group position="right" mt="xl" noWrap>
            <Button onClick={() => setOutput(undefined)}>Start over</Button>
          </Group>
        </>
      )}
    </Document>
  );
}
