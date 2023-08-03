import { Button, Group, JsonInput, Tabs, Text, Title, useMantineTheme } from '@mantine/core';
import { Dropzone, FileWithPath } from '@mantine/dropzone';
import { showNotification } from '@mantine/notifications';
import { convertToTransactionBundle, normalizeErrorString } from '@medplum/core';
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
  const [output, setOutput] = useState<Record<string, Bundle>>({});

  console.log(output);

  const submitBatch = useCallback(
    async (str: string, fileName: string) => {
      try {
        setOutput({});
        let bundle = JSON.parse(str) as Bundle;
        if (bundle.type !== 'batch' && bundle.type !== 'transaction') {
          bundle = convertToTransactionBundle(bundle);
        }
        const result = await medplum.executeBatch(bundle);
        setOutput((prev) => ({
          ...prev,
          [fileName]: result,
        }));
        showNotification({ color: 'green', message: 'Success' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      }
    },
    [medplum]
  );

  const handleFiles = useCallback(
    async (files: FileWithPath[]) => {
      for (const file of files) {
        console.log(file.name);
        const reader = new FileReader();
        reader.onload = (e) => submitBatch(e.target?.result as string, file.name as string);
        reader.readAsText(file);
      }
    },
    [submitBatch]
  );

  const handleJson = useCallback(
    async (formData: Record<string, string>) => {
      await submitBatch(formData.input, 'JSON Data');
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
      {Object.keys(output).length === 0 && (
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
                <JsonInput
                  data-testid="batch-input"
                  name="input"
                  minRows={20}
                  defaultValue={DEFAULT_VALUE}
                  deserialize={JSON.parse}
                />
                <Group position="right" mt="xl" noWrap>
                  <Button type="submit">Submit</Button>
                </Group>
              </Form>
            </Tabs.Panel>
          </Tabs>
        </>
      )}
      {Object.keys(output).length > 0 && (
        <>
          <h3>Output</h3>
          <Tabs defaultValue={Object.keys(output)[0]}>
            <Tabs.List>
              {Object.keys(output).map((name) => (
                <Tabs.Tab key={name} value={name}>
                  {name}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {Object.keys(output).map((name) => (
              <Tabs.Panel value={name}>
                <pre style={{ border: '1px solid #888' }}>{JSON.stringify(output[name], undefined, 2)}</pre>
              </Tabs.Panel>
            ))}
          </Tabs>
          <Group position="right" mt="xl" noWrap>
            <Button onClick={() => setOutput({})}>Start over</Button>
          </Group>
        </>
      )}
    </Document>
  );
}
