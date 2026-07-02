// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  CopyButton,
  Divider,
  Grid,
  Group,
  Image,
  JsonInput,
  PasswordInput,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { SmartHealthLinkMode, SmartHealthLinkPayload, WithId } from '@medplum/core';
import { ContentType, normalizeErrorString, parseSmartHealthLink } from '@medplum/core';
import type { Parameters, Patient, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCopy, IconLink, IconPlayerPlay, IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';

interface GeneratedSmartHealthLink {
  shlink: string;
  url: string;
  manifestUrl?: string;
  qrCodeDataUrl?: string;
  id: string;
  payload: SmartHealthLinkPayload;
}

export function SmartHealthLinksPage(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as WithId<Patient>;
  const [mode, setMode] = useState<SmartHealthLinkMode>('direct');
  const [label, setLabel] = useState('FooMedical patient share');
  const [recipient, setRecipient] = useState('Verona Health System');
  const [passcode, setPasscode] = useState('');
  const [includeQrCode, setIncludeQrCode] = useState(true);
  const [generated, setGenerated] = useState<GeneratedSmartHealthLink>();
  const [retrievalResult, setRetrievalResult] = useState('');
  const [resolveResult, setResolveResult] = useState('');
  const [loading, setLoading] = useState<string>();
  const [error, setError] = useState<string>();

  const generateLink = async (): Promise<void> => {
    setLoading('generate');
    setError(undefined);
    setRetrievalResult('');
    setResolveResult('');
    try {
      const selectedMode: SmartHealthLinkMode = mode;
      const exp = Date.now() + 15 * 60 * 1000; // 15 minutes
      const response = await medplum.post<Parameters>(
        medplum.fhirUrl('Patient', patient.id, '$generate-smart-health-link'),
        {
          mode: selectedMode,
          exp: Math.floor(exp / 1000),
          label,
          passcode: selectedMode === 'manifest' && passcode ? passcode : undefined,
          includeQrCode,
        },
        ContentType.JSON
      );
      const shlink = getStringParameter(response, 'shlink');
      setGenerated({
        shlink,
        url: getStringParameter(response, 'url'),
        manifestUrl: getOptionalStringParameter(response, 'manifestUrl'),
        qrCodeDataUrl: getOptionalStringParameter(response, 'qrCodeDataUrl'),
        id: getStringParameter(response, 'id'),
        payload: parseSmartHealthLink(shlink),
      });
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(undefined);
    }
  };

  const retrievePublicPayload = async (): Promise<void> => {
    if (!generated) {
      return;
    }
    setLoading('retrieve');
    setError(undefined);
    setRetrievalResult('');
    try {
      const url = new URL(generated.url);
      let response: globalThis.Response;
      if (generated.payload.flag === 'U') {
        url.searchParams.set('recipient', recipient);
        response = await fetch(url);
      } else {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': ContentType.JSON },
          body: JSON.stringify({ recipient, passcode: passcode || undefined }),
        });
      }
      const contentType = response.headers.get('Content-Type') ?? '';
      const body = await response.text();
      setRetrievalResult(
        JSON.stringify(
          {
            status: response.status,
            contentType,
            body: contentType.includes('json') ? JSON.parse(body) : body,
          },
          undefined,
          2
        )
      );
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(undefined);
    }
  };

  const resolveLink = async (): Promise<void> => {
    if (!generated) {
      return;
    }
    setLoading('resolve');
    setError(undefined);
    setResolveResult('');
    try {
      const response = await medplum.post<Parameters>(
        medplum.fhirUrl('$resolve-smart-health-link'),
        {
          shlink: generated.shlink,
          recipient,
          passcode: passcode || undefined,
        },
        ContentType.JSON
      );
      const resources = JSON.parse(getOptionalStringParameter(response, 'fhirResources') ?? '[]') as Resource[];
      setResolveResult(
        JSON.stringify(
          {
            valid: getBooleanParameter(response, 'valid'),
            error: getOptionalStringParameter(response, 'error'),
            returnedResources: resources.map((resource) => ({
              resourceType: resource.resourceType,
              type: resource.resourceType === 'Bundle' ? resource.type : undefined,
              entries: resource.resourceType === 'Bundle' ? (resource.entry?.length ?? 0) : undefined,
            })),
          },
          undefined,
          2
        )
      );
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(undefined);
    }
  };

  return (
    <Container py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <div>
            <Title order={2}>SMART Health Links</Title>
            <Text c="dimmed" mt={4}>
              Generate and resolve patient share links for {patient.name?.[0]?.given?.[0] ?? 'this patient'}.
            </Text>
          </div>
          {generated && (
            <Badge size="lg" variant="light" color={generated.payload.flag === 'U' ? 'teal' : 'blue'}>
              {generated.payload.flag === 'U' ? 'Direct' : 'Manifest'}
            </Badge>
          )}
        </Group>

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        <Grid align="start">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card withBorder radius="md" p="lg">
              <Stack>
                <SegmentedControl
                  value={mode}
                  onChange={(value) => setMode(value as SmartHealthLinkMode)}
                  data={[
                    { value: 'direct', label: 'Direct' },
                    { value: 'manifest', label: 'Manifest' },
                  ]}
                />
                <TextInput label="Label" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
                <TextInput
                  label="Recipient"
                  value={recipient}
                  onChange={(event) => setRecipient(event.currentTarget.value)}
                />
                <PasswordInput
                  label="Passcode"
                  value={passcode}
                  disabled={mode === 'direct'}
                  onChange={(event) => setPasscode(event.currentTarget.value)}
                />
                <Checkbox
                  label="Include QR code"
                  checked={includeQrCode}
                  onChange={(event) => setIncludeQrCode(event.currentTarget.checked)}
                />
                <Group>
                  <Button
                    leftSection={<IconLink size={16} />}
                    loading={loading === 'generate'}
                    onClick={() => generateLink()}
                  >
                    Generate
                  </Button>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 7 }}>
            <Card withBorder radius="md" p="lg">
              <Stack>
                <Group justify="space-between">
                  <Title order={4}>Generated Link</Title>
                  {generated && (
                    <CopyButton value={generated.shlink}>
                      {({ copied, copy }) => (
                        <Button variant="subtle" leftSection={<IconCopy size={16} />} onClick={copy}>
                          {copied ? 'Copied' : 'Copy'}
                        </Button>
                      )}
                    </CopyButton>
                  )}
                </Group>
                {generated ? (
                  <>
                    <Code block>{generated.shlink}</Code>
                    <Table withTableBorder withColumnBorders>
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Th>URL</Table.Th>
                          <Table.Td>{generated.payload.url}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Th>Flag</Table.Th>
                          <Table.Td>{generated.payload.flag ?? 'none'}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Th>Expires</Table.Th>
                          <Table.Td>
                            {generated.payload.exp
                              ? new Date(generated.payload.exp * 1000).toLocaleString()
                              : 'No expiration'}
                          </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Th>Version</Table.Th>
                          <Table.Td>{generated.payload.v}</Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                    {generated.qrCodeDataUrl && <Image src={generated.qrCodeDataUrl} w={400} />}
                    <Group>
                      <Button
                        variant="light"
                        leftSection={<IconPlayerPlay size={16} />}
                        loading={loading === 'retrieve'}
                        onClick={retrievePublicPayload}
                      >
                        Retrieve Public Payload
                      </Button>
                      <Button
                        variant="light"
                        leftSection={<IconShieldCheck size={16} />}
                        loading={loading === 'resolve'}
                        onClick={resolveLink}
                      >
                        Resolve Server Side
                      </Button>
                    </Group>
                  </>
                ) : (
                  <Text c="dimmed">No link generated.</Text>
                )}
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>

        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card withBorder radius="md" p="lg">
              <Title order={4}>Public Retrieval Result</Title>
              <Divider my="sm" />
              <JsonInput autosize minRows={8} value={retrievalResult} readOnly />
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card withBorder radius="md" p="lg">
              <Title order={4}>Resolve Result</Title>
              <Divider my="sm" />
              <JsonInput autosize minRows={8} value={resolveResult} readOnly />
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}

function getStringParameter(parameters: Parameters, name: string): string {
  const value = getOptionalStringParameter(parameters, name);
  if (!value) {
    throw new Error(`Expected ${name} parameter`);
  }
  return value;
}

function getOptionalStringParameter(parameters: Parameters, name: string): string | undefined {
  const parameter = parameters.parameter?.find((p) => p.name === name);
  return parameter?.valueString ?? parameter?.valueId ?? parameter?.valueUri;
}

function getBooleanParameter(parameters: Parameters, name: string): boolean {
  const value = parameters.parameter?.find((p) => p.name === name)?.valueBoolean;
  if (value === undefined) {
    throw new Error(`Expected ${name} parameter`);
  }
  return value;
}
