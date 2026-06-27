// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Group, JsonInput, Modal, Tabs, Text, Title, useMantineTheme } from '@mantine/core';
import type { FileWithPath } from '@mantine/dropzone';
import { Dropzone } from '@mantine/dropzone';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { convertToTransactionBundle, normalizeErrorString, stringify } from '@medplum/core';
import type { Bundle, Parameters } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
import { IconCheck, IconUpload, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { QrCodeScanner } from './components/QrCodeScanner';

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
  const [value, setValue] = useState<string>(DEFAULT_VALUE);
  const [output, setOutput] = useState<Record<string, Bundle>>({});
  const smartScanDisclosure = useDisclosure(false);

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
        reader.onload = (e) => submitBatch(e.target?.result as string, file.name);
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

  const handleQrCode = useCallback(
    async (data: string) => {
      if (data.startsWith('shc:')) {
        const result = await medplum.post<Parameters>(medplum.fhirUrl('$verify-smart-health-card'), { shcUri: data });
        const fhirBundleStr = result.parameter?.find((p) => p.name === 'fhirBundle')?.valueString;
        if (fhirBundleStr) {
          try {
            const fhirBundle = JSON.parse(fhirBundleStr) as Bundle;
            setValue(stringify(fhirBundle, true));
          } catch (err) {
            console.error(err);
          }
        }
        const valid = result.parameter?.find((p) => p.name === 'valid')?.valueBoolean;
        if (valid) {
          showNotification({
            id: 'smart-scan',
            title: 'SMART Health Card Verified',
            message: 'Your SMART Health Card data was successfully verified.',
            color: 'green',
            method: 'update',
            icon: <IconCheck size="1rem" />,
            withCloseButton: true,
          });
        } else {
          showNotification({
            id: 'smart-scan',
            title: 'SMART Health Card Verification Failed',
            color: 'red',
            message: 'Your SMART Health Card data could not be verified.',
            method: 'update',
            icon: <IconX size="1rem" />,
            withCloseButton: true,
          });
        }
      }
    },
    [medplum]
  );

  return (
    <Document>
      <Title order={1}>Batch Create</Title>
      <Text>
        Use this page to create, read, or update multiple resources. For more details, see{' '}
        <Anchor href="https://www.hl7.org/fhir/http.html#transaction">FHIR Batch and Transaction</Anchor>.
      </Text>
      {Object.keys(output).length === 0 && (
        <Tabs defaultValue="upload" mt="xl">
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
                value={value}
                onChange={setValue}
                deserialize={JSON.parse}
              />
              <Group justify="flex-end" mt="xl" wrap="nowrap">
                <Button type="submit">Submit</Button>
                <Button variant="default" onClick={() => smartScanDisclosure[1].open()}>
                  SMART
                </Button>
              </Group>
            </Form>
          </Tabs.Panel>
        </Tabs>
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
      <Modal title="SMART" size="xl" opened={smartScanDisclosure[0]} onClose={smartScanDisclosure[1].close}>
        <QrCodeScanner
          onScan={(data) => {
            smartScanDisclosure[1].close();
            handleQrCode(data).catch(console.error);
          }}
        />
      </Modal>
    </Document>
  );
}
