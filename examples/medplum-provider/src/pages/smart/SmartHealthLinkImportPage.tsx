// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { ContentType, deepClone, getDisplayString, normalizeErrorString } from '@medplum/core';
import type { Bundle, BundleEntry, Parameters, Patient, Resource } from '@medplum/fhirtypes';
import { Document, QrCodeScanner, useMedplum } from '@medplum/react';
import { IconQrcode, IconSearch, IconUpload } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  buildSmartHealthLinkImportBundle,
  getMatchGrade,
  getSmartHealthCardFile,
  getSmartHealthLinkBundle,
  getSmartHealthLinkBundleEntryKey,
  getSmartHealthLinkPatient,
} from './SmartHealthLinkImport.utils';

export function SmartHealthLinkImportPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [scannerOpened, scannerHandlers] = useDisclosure(false);
  const [shlink, setShlink] = useState('');
  const [loading, setLoading] = useState<string>();
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string[]>([]);
  const [bundle, setBundle] = useState<Bundle>();
  const [sharedPatient, setSharedPatient] = useState<Patient>();
  const [matches, setMatches] = useState<{ patient: WithId<Patient>; score?: number; grade?: string }[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<WithId<Patient>>();
  const [createNewPatient, setCreateNewPatient] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [smartHealthLinkDetails, setSmartHealthLinkDetails] = useState<{
    recipient?: string;
    sourceOrigin?: string;
    expiresAt?: string;
  }>();

  const items = bundle?.entry?.filter((entry) => entry.resource && getSmartHealthLinkBundleEntryKey(entry)) ?? [];
  const selectedItems = items.filter((entry) => {
    const key = getSmartHealthLinkBundleEntryKey(entry);
    return !!key && selectedKeys.has(key) && entry.resource?.resourceType !== 'Patient';
  });
  const recipient = medplum.getProject()?.name ?? 'Medplum Provider';
  const hasTargetPatient = createNewPatient || !!selectedPatient;

  async function resolveLink(shlink: string): Promise<void> {
    const trimmedShlink = shlink.trim();
    if (!trimmedShlink) {
      setError('Enter a SMART Health Link.');
      return;
    }

    setLoading('resolve');
    setError(undefined);
    setWarning([]);
    setBundle(undefined);
    setSharedPatient(undefined);
    setSmartHealthLinkDetails(undefined);
    setMatches([]);
    setSelectedPatient(undefined);
    setCreateNewPatient(false);
    try {
      const result = await medplum.post<Parameters>(
        medplum.fhirUrl('$resolve-smart-health-link'),
        { shlink: trimmedShlink, recipient },
        ContentType.JSON
      );
      const valid = result.parameter?.find((p) => p.name === 'valid')?.valueBoolean;
      const resolvedError = result.parameter?.find((p) => p.name === 'error')?.valueString;
      if (!valid) {
        throw new Error(resolvedError || 'SMART Health Link could not be resolved.');
      }

      const warnings = result.parameter
        ?.filter((p) => p.name === 'warning')
        .map((p) => p.valueString)
        .filter((value): value is string => !!value);
      setWarning(warnings ?? []);

      const details = {
        recipient: result.parameter?.find((p) => p.name === 'recipient')?.valueString,
        sourceOrigin: result.parameter?.find((p) => p.name === 'sourceOrigin')?.valueString,
        expiresAt: result.parameter?.find((p) => p.name === 'expiresAt')?.valueDateTime,
      };
      setSmartHealthLinkDetails(details.recipient || details.sourceOrigin || details.expiresAt ? details : undefined);

      const resources = JSON.parse(
        result.parameter?.find((p) => p.name === 'fhirResources')?.valueString ?? '[]'
      ) as unknown[];
      const resolvedBundle = getSmartHealthLinkBundle(resources) ?? (await resolveSmartHealthCardFile(resources));
      if (!resolvedBundle) {
        throw new Error('SMART Health Link did not contain a FHIR Bundle or SMART Health Card file.');
      }
      const patient = getSmartHealthLinkPatient(resolvedBundle);
      if (!patient) {
        throw new Error('SMART Health Link Bundle did not contain a Patient resource.');
      }

      const bundleKeys =
        resolvedBundle.entry
          ?.filter((entry) => entry.resource)
          .map(getSmartHealthLinkBundleEntryKey)
          .filter((key): key is string => !!key) ?? [];
      setBundle(resolvedBundle);
      setSharedPatient(patient);
      setSelectedKeys(new Set(bundleKeys));
      await matchPatient(patient);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(undefined);
    }
  }

  async function resolveSmartHealthCardFile(resources: unknown[]): Promise<Bundle | undefined> {
    const smartHealthCardFile = getSmartHealthCardFile(resources);
    if (!smartHealthCardFile) {
      return undefined;
    }

    const result = await medplum.post<Parameters>(
      medplum.fhirUrl('$verify-smart-health-card'),
      { file: JSON.stringify(smartHealthCardFile) },
      ContentType.JSON
    );
    const valid = result.parameter?.find((p) => p.name === 'valid')?.valueBoolean;
    const error = result.parameter?.find((p) => p.name === 'error')?.valueString;
    if (!valid) {
      throw new Error(error || 'SMART Health Card could not be verified.');
    }

    const fhirBundleStr = result.parameter?.find((p) => p.name === 'fhirBundle')?.valueString;
    if (!fhirBundleStr) {
      throw new Error('SMART Health Card did not contain a FHIR Bundle.');
    }
    return JSON.parse(fhirBundleStr) as Bundle;
  }

  async function matchPatient(patient: Patient): Promise<void> {
    setLoading('match');
    try {
      const result = await medplum.post<Bundle<WithId<Patient>>>(
        medplum.fhirUrl('Patient', '$match'),
        {
          resource: patient,
          onlyCertainMatches: false,
          count: 5,
        },
        ContentType.JSON
      );
      const patientMatches =
        result.entry?.flatMap((entry) =>
          entry.resource
            ? [
                {
                  patient: entry.resource,
                  score: entry.search?.score,
                  grade: getMatchGrade(entry),
                },
              ]
            : []
        ) ?? [];
      setMatches(patientMatches);
      const certainMatch = patientMatches.find((match) => match.grade === 'certain');
      if (certainMatch) {
        setSelectedPatient(certainMatch.patient);
      }
    } finally {
      setLoading(undefined);
    }
  }

  async function importSelectedResources(): Promise<void> {
    if (!bundle || !sharedPatient) {
      return;
    }
    if (!createNewPatient && !selectedPatient) {
      setError('Select an existing patient match or create a new patient.');
      return;
    }

    setLoading('import');
    setError(undefined);
    try {
      const targetPatient = createNewPatient
        ? await medplum.createResource(preparePatientForCreate(sharedPatient))
        : selectedPatient;
      if (!targetPatient) {
        throw new Error('Unable to determine target patient.');
      }

      const transaction = buildSmartHealthLinkImportBundle(bundle, selectedKeys, sharedPatient, targetPatient);
      if (transaction.entry?.length) {
        await medplum.executeBatch(transaction);
      }
      setSelectedPatient(targetPatient);
      navigate(`/Patient/${targetPatient.id}/timeline`)?.catch(console.error);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(undefined);
    }
  }

  return (
    <Document>
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <div>
            <Title order={1}>SMART Health Link Import</Title>
            <Text c="dimmed">Scan a patient-shared QR code, match the patient, and import selected resources.</Text>
          </div>
          <Button leftSection={<IconQrcode size={16} />} variant="default" onClick={scannerHandlers.open}>
            Scan
          </Button>
        </Group>

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        {warning.map((message) => (
          <Alert key={message} color="yellow" variant="light">
            {message}
          </Alert>
        ))}

        <Paper withBorder p="md">
          <Stack>
            <Group align="end">
              <TextInput
                label="SMART Health Link"
                placeholder="shlink:/..."
                value={shlink}
                onChange={(event) => setShlink(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                leftSection={<IconSearch size={16} />}
                loading={loading === 'resolve' || loading === 'match'}
                onClick={() => resolveLink(shlink)}
              >
                Resolve
              </Button>
            </Group>
          </Stack>
        </Paper>

        {smartHealthLinkDetails && (
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Title order={3}>SMART Health Link Details</Title>
              <Group gap="xl" align="start">
                {smartHealthLinkDetails.recipient && (
                  <div>
                    <Text size="xs" c="dimmed" fw={700}>
                      Recipient
                    </Text>
                    <Text size="sm">{smartHealthLinkDetails.recipient}</Text>
                  </div>
                )}
                {smartHealthLinkDetails.sourceOrigin && (
                  <div>
                    <Text size="xs" c="dimmed" fw={700}>
                      Source Origin
                    </Text>
                    <Text size="sm">{smartHealthLinkDetails.sourceOrigin}</Text>
                  </div>
                )}
                {smartHealthLinkDetails.expiresAt && (
                  <div>
                    <Text size="xs" c="dimmed" fw={700}>
                      Expires
                    </Text>
                    <Text size="sm">{new Date(smartHealthLinkDetails.expiresAt).toLocaleString()}</Text>
                  </div>
                )}
              </Group>
            </Stack>
          </Paper>
        )}

        {sharedPatient && (
          <Card withBorder radius="sm" p="md">
            <Stack>
              <Group justify="space-between">
                <div>
                  <Title order={3}>Patient Match</Title>
                  <Text c="dimmed" size="sm">
                    Shared patient: {getDisplayString(sharedPatient)}
                    {sharedPatient.birthDate ? `, born ${sharedPatient.birthDate}` : ''}
                  </Text>
                </div>
                {selectedPatient && !createNewPatient && <Badge color="green">Existing patient selected</Badge>}
                {createNewPatient && <Badge color="blue">Create new patient</Badge>}
              </Group>
              <Stack gap="sm">
                {matches.length > 0 ? (
                  matches.map((match) => (
                    <Paper key={match.patient.id} withBorder p="sm">
                      <Group justify="space-between">
                        <div>
                          <Text fw={600}>{getDisplayString(match.patient)}</Text>
                          <Text c="dimmed" size="sm">
                            {match.patient.birthDate ? `Born ${match.patient.birthDate}` : 'No birth date'}
                            {match.grade ? ` | ${match.grade}` : ''}
                            {match.score !== undefined ? ` | score ${match.score.toFixed(2)}` : ''}
                          </Text>
                        </div>
                        <Button
                          variant={selectedPatient?.id === match.patient.id && !createNewPatient ? 'filled' : 'default'}
                          onClick={() => {
                            setCreateNewPatient(false);
                            setSelectedPatient(match.patient);
                          }}
                        >
                          {selectedPatient?.id === match.patient.id && !createNewPatient ? 'Selected' : 'Select'}
                        </Button>
                      </Group>
                    </Paper>
                  ))
                ) : (
                  <Text c="dimmed">No likely existing patient matches were found.</Text>
                )}
                <Group justify="flex-end">
                  <Button
                    variant={createNewPatient ? 'filled' : 'default'}
                    onClick={() => {
                      setCreateNewPatient(true);
                      setSelectedPatient(undefined);
                    }}
                  >
                    Create New Patient
                  </Button>
                </Group>
              </Stack>
            </Stack>
          </Card>
        )}

        {items.length > 0 && hasTargetPatient && (
          <Card withBorder radius="sm" p="md">
            <Stack>
              <Group justify="space-between">
                <div>
                  <Title order={3}>Import Cart</Title>
                  <Text c="dimmed" size="sm">
                    {selectedItems.length} of {items.filter((item) => item.resource?.resourceType !== 'Patient').length}{' '}
                    resources selected
                  </Text>
                  <Text c="green" size="sm" fw={600}>
                    {getTargetPatientLabel(createNewPatient, selectedPatient)}
                  </Text>
                </div>
                <Group>
                  <Button
                    variant="default"
                    onClick={() =>
                      setSelectedKeys(
                        new Set(items.map(getSmartHealthLinkBundleEntryKey).filter((key): key is string => !!key))
                      )
                    }
                  >
                    Select All
                  </Button>
                  <Button variant="default" onClick={() => setSelectedKeys(new Set())}>
                    Select None
                  </Button>
                </Group>
              </Group>
              <ScrollArea>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={48}></Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Summary</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((item) => {
                      const key = getSmartHealthLinkBundleEntryKey(item) as string;
                      return (
                        <ResourceCartRow
                          key={key}
                          item={item}
                          checked={selectedKeys.has(key)}
                          onChange={(checked) => {
                            setSelectedKeys((prev) => {
                              const next = new Set(prev);
                              if (checked) {
                                next.add(key);
                              } else {
                                next.delete(key);
                              }
                              return next;
                            });
                          }}
                        />
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <Divider />
              <Group justify="flex-end">
                <Button
                  leftSection={<IconUpload size={16} />}
                  loading={loading === 'import'}
                  disabled={!sharedPatient}
                  onClick={() => importSelectedResources()}
                >
                  Import
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
      </Stack>

      <Modal title="Scan SMART Health Link" size="xl" opened={scannerOpened} onClose={scannerHandlers.close}>
        <QrCodeScanner
          onScan={(data) => {
            scannerHandlers.close();
            setShlink(data);
            resolveLink(data).catch(console.error);
          }}
        />
      </Modal>
    </Document>
  );
}

interface ResourceCartRowProps {
  readonly item: BundleEntry;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

function ResourceCartRow({ item, checked, onChange }: ResourceCartRowProps): JSX.Element {
  const resource = item.resource as Resource;
  const isPatient = resource.resourceType === 'Patient';
  return (
    <Table.Tr>
      <Table.Td>
        <Checkbox
          aria-label={`Select ${resource.resourceType}`}
          disabled={isPatient}
          checked={!isPatient && checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      </Table.Td>
      <Table.Td>
        <Badge variant="light">{resource.resourceType}</Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{getDisplayString(resource)}</Text>
      </Table.Td>
    </Table.Tr>
  );
}

function getTargetPatientLabel(createNewPatient: boolean, selectedPatient: WithId<Patient> | undefined): string {
  if (createNewPatient) {
    return 'Target patient: create new patient';
  }
  if (selectedPatient) {
    return `Target patient: ${getDisplayString(selectedPatient)}`;
  }
  return 'Target patient: not selected';
}

function preparePatientForCreate(patient: Patient): Patient {
  const result = deepClone(patient);
  delete result.id;
  delete result.meta;
  return result;
}
