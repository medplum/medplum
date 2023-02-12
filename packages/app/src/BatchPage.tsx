import { Button, Group, JsonInput, Tabs, Text, Title, useMantineTheme } from '@mantine/core';
import { Dropzone, FileWithPath } from '@mantine/dropzone';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
import { IconUpload, IconX } from '@tabler/icons-react';
import React, { useCallback, useState } from 'react';

export const DEFAULT_VALUE = `{
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

  const submitBatch = useCallback(
    async (str: string) => {
      try {
        setOutput(undefined);
        setOutput(await medplum.executeBatch(JSON.parse(str)));
        showNotification({ color: 'green', message: 'Success' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      }
    },
    [medplum]
  );

  const handleFiles = useCallback(
    async (files: FileWithPath[]) => {
      const reader = new FileReader();
      reader.onload = (e) => submitBatch(e.target?.result as string);
      reader.readAsText(files[0]);
    },
    [submitBatch]
  );

  const handleJson = useCallback(
    async (formData: Record<string, string>) => {
      await submitBatch(formData.input);
    },
    [submitBatch]
  );

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
              <Dropzone onDrop={handleFiles} accept={['application/json']}>
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
              <Form onSubmit={handleJson}>
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
