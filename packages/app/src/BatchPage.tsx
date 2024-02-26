import { Button, Group, JsonInput, Tabs, Text, Title, useMantineTheme } from '@mantine/core';
import { Dropzone, FileWithPath } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { convertToTransactionBundle, normalizeErrorString } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
import { IconCheck, IconUpload, IconX } from '@tabler/icons-react';
import { useCallback, useState } from 'react';

const DEFAULT_VALUE = `{"resourceType": "Bundle"}`;

interface ShowNotificationProps {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly color?: string;
  readonly icon?: JSX.Element | null;
  readonly withCloseButton?: boolean;
  readonly method?: 'show' | 'update';
  readonly loading?: boolean;
}

function showNotification({
  id,
  title,
  message,
  color,
  icon,
  withCloseButton = false,
  method = 'show',
  loading,
}: ShowNotificationProps): void {
  notifications[method]({
    id,
    loading,
    title,
    message,
    color,
    icon,
    withCloseButton,
    autoClose: false,
  });
}

export function BatchPage(): JSX.Element {
  const theme = useMantineTheme();
  const medplum = useMedplum();
  const [output, setOutput] = useState<Record<string, Bundle>>({});

  const submitBatch = useCallback(
    async (str: string, fileName: string) => {
      const id = 'batch-upload';
      showNotification({
        id,
        title: 'Batch Upload in Progress',
        message: 'Your batch data is being uploaded. This may take a moment...',
        method: 'show',
        loading: true,
      });

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
        showNotification({
          id,
          title: 'Batch Upload Successful',
          message: 'Your batch data was successfully uploaded.',
          color: 'green',
          method: 'update',
          icon: <IconCheck size="1rem" />,
          withCloseButton: true,
        });
      } catch (err) {
        showNotification({
          id,
          title: 'Batch Upload Failed',
          color: 'red',
          message: normalizeErrorString(err),
          method: 'update',
          icon: <IconX size="1rem" />,
          withCloseButton: true,
        });
      }
    },
    [medplum]
  );

  const handleFiles = useCallback(
    async (files: FileWithPath[]) => {
      for (const file of files) {
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
                <Group justify="center" gap="xl" style={{ minHeight: 220, pointerEvents: 'none' }}>
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
                  autosize
                  minRows={20}
                  defaultValue={DEFAULT_VALUE}
                  deserialize={JSON.parse}
                />
                <Group justify="flex-end" mt="xl" wrap="nowrap">
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
              <Tabs.Panel key={name} value={name}>
                <pre style={{ border: '1px solid #888' }}>{JSON.stringify(output[name], undefined, 2)}</pre>
              </Tabs.Panel>
            ))}
          </Tabs>
          <Group justify="flex-end" mt="xl" wrap="nowrap">
            <Button onClick={() => setOutput({})}>Start over</Button>
          </Group>
        </>
      )}
    </Document>
  );
}
