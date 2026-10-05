// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Anchor,
  Button,
  Group,
  JsonInput,
  LoadingOverlay,
  Modal,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  useMantineTheme,
} from '@mantine/core';
import type { FileWithPath } from '@mantine/dropzone';
import { Dropzone } from '@mantine/dropzone';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { SearchRequest, WithId } from '@medplum/core';
import {
  ContentType,
  convertToTransactionBundle,
  formatSearchQuery,
  normalizeErrorString,
  stringify,
} from '@medplum/core';
import type { AsyncJob, Bundle, OperationOutcome, Parameters, Resource } from '@medplum/fhirtypes';
import { Document, Form, LinkTabs, MedplumLink, QrCodeScanner, useMedplum } from '@medplum/react';
import { IconCheck, IconRefresh, IconUpload, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

const PAGE_TABS = [
  { label: 'Submit Batch', value: 'submit' },
  { label: 'Batch Jobs', value: 'jobs' },
];

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
  const [smartHealthLink, setSmartHealthLink] = useState('');
  const [smartScanLoading, setSmartScanLoading] = useState(false);
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

  const submitBatchAsync = useCallback(
    async (str: string) => {
      const id = 'batch-async-upload';
      showNotification({
        id,
        title: 'Async Batch Submission in Progress',
        message: 'Your batch job is being submitted...',
        method: 'show',
        loading: true,
      });

      try {
        let bundle = JSON.parse(str) as Bundle;
        if (bundle.type !== 'batch' && bundle.type !== 'transaction') {
          bundle = convertToTransactionBundle(bundle);
        }
        await medplum.post<OperationOutcome>(medplum.fhirUrl(), bundle, ContentType.FHIR_JSON, {
          headers: { Prefer: 'respond-async' },
        });
        showNotification({
          id,
          title: 'Async Batch Submitted',
          message: 'Your batch job was submitted. See the "Batch Jobs" tab for status.',
          color: 'green',
          method: 'update',
          icon: <IconCheck size="1rem" />,
          withCloseButton: true,
        });
      } catch (err) {
        showNotification({
          id,
          title: 'Async Batch Submission Failed',
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
      data = data.trim();
      if (!data) {
        return;
      }
      setSmartScanLoading(true);
      showNotification({
        id: 'smart-scan',
        title: 'SMART Scan in Progress',
        message: 'Reading SMART data...',
        method: 'show',
        loading: true,
      });
      if (data.startsWith('shc:')) {
        try {
          const result = await medplum.post<Parameters>(medplum.fhirUrl('$verify-smart-health-card'), { shcUri: data });
          const fhirBundleStr = result.parameter?.find((p) => p.name === 'fhirBundle')?.valueString;
          if (fhirBundleStr) {
            const fhirBundle = JSON.parse(fhirBundleStr) as Bundle;
            setValue(stringify(fhirBundle, true));
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
        } catch (err) {
          showNotification({
            id: 'smart-scan',
            title: 'SMART Health Card Verification Failed',
            color: 'red',
            message: normalizeErrorString(err),
            method: 'update',
            icon: <IconX size="1rem" />,
            withCloseButton: true,
          });
        } finally {
          setSmartScanLoading(false);
        }
        return;
      }

      try {
        const result = await medplum.post<Parameters>(medplum.fhirUrl('$resolve-smart-health-link'), {
          shlink: data,
          recipient: 'Medplum App',
        });
        const valid = result.parameter?.find((p) => p.name === 'valid')?.valueBoolean;
        const error = result.parameter?.find((p) => p.name === 'error')?.valueString;
        const warnings = result.parameter
          ?.filter((p) => p.name === 'warning')
          .map((p) => p.valueString)
          .filter(Boolean);
        if (!valid) {
          throw new Error(error || 'SMART Health Link could not be resolved.');
        }

        const fhirResources = JSON.parse(
          result.parameter?.find((p) => p.name === 'fhirResources')?.valueString ?? '[]'
        ) as Resource[];
        const bundle = fhirResources.find((resource): resource is Bundle => resource.resourceType === 'Bundle');
        if (!bundle) {
          throw new Error('SMART Health Link did not contain a FHIR Bundle.');
        }

        setValue(stringify(bundle, true));
        showNotification({
          id: 'smart-scan',
          title: 'SMART Health Link Resolved',
          message: warnings?.length ? warnings.join('\n') : 'Your SMART Health Link data was successfully resolved.',
          color: warnings?.length ? 'yellow' : 'green',
          method: 'update',
          icon: <IconCheck size="1rem" />,
          withCloseButton: true,
        });
      } catch (err) {
        showNotification({
          id: 'smart-scan',
          title: 'SMART Health Link Failed',
          color: 'red',
          message: normalizeErrorString(err),
          method: 'update',
          icon: <IconX size="1rem" />,
          withCloseButton: true,
        });
      } finally {
        setSmartScanLoading(false);
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
      <LinkTabs baseUrl="/batch" tabs={PAGE_TABS} mt="xl" keepMounted={false}>
        <Tabs.Panel value="submit" pt="md">
          {Object.keys(output).length === 0 && (
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
                    value={value}
                    onChange={setValue}
                    deserialize={JSON.parse}
                  />
                  <Group justify="flex-end" mt="xl" wrap="nowrap">
                    <Button type="submit">Submit</Button>
                    <Button variant="default" onClick={() => submitBatchAsync(value)}>
                      Submit Async Batch
                    </Button>
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
        </Tabs.Panel>
        <Tabs.Panel value="jobs" pt="md">
          <BatchJobsPanel />
        </Tabs.Panel>
      </LinkTabs>
      <Modal title="SMART" size="xl" opened={smartScanDisclosure[0]} onClose={smartScanDisclosure[1].close}>
        <Stack>
          <Group align="end">
            <TextInput
              label="SMART Health Link"
              placeholder="shlink:/..."
              value={smartHealthLink}
              onChange={(event) => setSmartHealthLink(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              loading={smartScanLoading}
              onClick={() => {
                smartScanDisclosure[1].close();
                handleQrCode(smartHealthLink).catch(console.error);
              }}
            >
              Resolve
            </Button>
          </Group>
          <QrCodeScanner
            onScan={(data) => {
              smartScanDisclosure[1].close();
              handleQrCode(data).catch(console.error);
            }}
          />
        </Stack>
      </Modal>
    </Document>
  );
}

const BATCH_ASYNCJOB_SEARCH: SearchRequest = {
  resourceType: 'AsyncJob',
  fields: ['id', '_lastUpdated', 'request', 'status', 'requestTime'],
  sortRules: [{ code: '_lastUpdated', descending: true }],
  count: 100,
};

function isBatchAsyncJob(job: AsyncJob, fhirBaseUrl: URL): boolean {
  if (!job.request) {
    return false;
  }
  try {
    return new URL(job.request).pathname === fhirBaseUrl.pathname;
  } catch {
    return false;
  }
}

function BatchJobsPanel(): JSX.Element {
  const medplum = useMedplum();
  const [jobs, setJobs] = useState<WithId<AsyncJob>[]>();
  const [loading, setLoading] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    setLoading(true);
    medplum
      .searchResources('AsyncJob', formatSearchQuery(BATCH_ASYNCJOB_SEARCH), { cache: 'no-cache' })
      .then((result) => {
        setJobs(result.filter((job) => isBatchAsyncJob(job, medplum.fhirUrl())));
      })
      .catch((err) => {
        notifications.show({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      })
      .finally(() => setLoading(false));
  }, [medplum, refreshCounter]);

  const downloadResults = useCallback(
    async (job: WithId<AsyncJob>) => {
      const reference = job.output?.parameter?.find((p) => p.name === 'results')?.valueReference?.reference;
      if (!reference) {
        notifications.show({ color: 'red', message: 'No results are available for this job.', autoClose: false });
        return;
      }
      try {
        const blob = await medplum.download(reference);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `batch-result-${job.id}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        notifications.show({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum]
  );

  return (
    <Stack>
      <Group justify="flex-end">
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconRefresh size={14} />}
          onClick={() => setRefreshCounter((prev) => prev + 1)}
          loading={loading}
        >
          Refresh
        </Button>
      </Group>
      <div style={{ position: 'relative' }}>
        <LoadingOverlay visible={loading} />
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Job</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Request Time</Table.Th>
              <Table.Th>Last Updated</Table.Th>
              <Table.Th>Results</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs?.length ? (
              jobs.map((job) => (
                <Table.Tr key={job.id}>
                  <Table.Td>
                    <MedplumLink to={`/AsyncJob/${job.id}`}>{job.id}</MedplumLink>
                  </Table.Td>
                  <Table.Td>{job.status}</Table.Td>
                  <Table.Td>{job.requestTime}</Table.Td>
                  <Table.Td>{job.meta?.lastUpdated}</Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      disabled={job.status !== 'completed'}
                      onClick={() => downloadResults(job).catch(console.error)}
                    >
                      Download
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={5}>{loading ? '' : 'No batch jobs found'}</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}
