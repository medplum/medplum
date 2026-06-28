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
import { ContentType, deepClone, normalizeErrorString } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Bundle, Parameters, Patient, Resource } from '@medplum/fhirtypes';
import { Document, QrCodeScanner, useMedplum } from '@medplum/react';
import { IconCheck, IconQrcode, IconSearch, IconUpload } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  buildSmartHealthLinkImportBundle,
  getMatchGrade,
  getPatientDisplay,
  getResourceSummary,
  getSmartHealthLinkBundle,
  getSmartHealthLinkPatient,
  getSmartHealthLinkResourceItems,
} from './SmartHealthLinkImport.utils';
import type { SmartHealthLinkMatch, SmartHealthLinkResourceItem } from './SmartHealthLinkImport.utils';

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
  const [matches, setMatches] = useState<SmartHealthLinkMatch[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<WithId<Patient>>();
  const [createNewPatient, setCreateNewPatient] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<Bundle>();

  const items = useMemo(() => (bundle ? getSmartHealthLinkResourceItems(bundle) : []), [bundle]);
  const selectedItems = items.filter((item) => selectedKeys.has(item.key) && item.resource.resourceType !== 'Patient');
  const recipient = medplum.getProject()?.name ?? 'Medplum Provider';
  const hasTargetPatient = createNewPatient || !!selectedPatient;

  async function resolveLink(input: string): Promise<void> {
    const normalized = normalizeSmartHealthLink(input);
    if (!normalized) {
      setError('Enter a SMART Health Link.');
      return;
    }

    setLoading('resolve');
    setError(undefined);
    setWarning([]);
    setBundle(undefined);
    setSharedPatient(undefined);
    setMatches([]);
    setSelectedPatient(undefined);
    setCreateNewPatient(false);
    setImportResult(undefined);
    try {
      const result = await medplum.post<Parameters>(
        medplum.fhirUrl('$resolve-smart-health-link'),
        { shlink: normalized, recipient },
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

      const resources = JSON.parse(
        result.parameter?.find((p) => p.name === 'fhirResources')?.valueString ?? '[]'
      ) as Resource[];
      const resolvedBundle = getSmartHealthLinkBundle(resources);
      if (!resolvedBundle) {
        throw new Error('SMART Health Link did not contain a FHIR Bundle.');
      }
      const patient = getSmartHealthLinkPatient(resolvedBundle);
      if (!patient) {
        throw new Error('SMART Health Link Bundle did not contain a Patient resource.');
      }

      const resourceItems = getSmartHealthLinkResourceItems(resolvedBundle);
      setBundle(resolvedBundle);
      setSharedPatient(patient);
      setSelectedKeys(new Set(resourceItems.filter((item) => item.defaultSelected).map((item) => item.key)));
      await matchPatient(patient);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(undefined);
    }
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
    if (!sharedPatient) {
      return;
    }
    if (!createNewPatient && !selectedPatient) {
      setError('Select an existing patient match or create a new patient.');
      return;
    }

    setLoading('import');
    setError(undefined);
    try {
      const targetPatient = createNewPatient ? await medplum.createResource(preparePatientForCreate(sharedPatient)) : selectedPatient;
      if (!targetPatient) {
        throw new Error('Unable to determine target patient.');
      }

      const transaction = buildSmartHealthLinkImportBundle(items, selectedKeys, sharedPatient, targetPatient);
      const result = transaction.entry?.length ? await medplum.executeBatch(transaction) : undefined;
      setSelectedPatient(targetPatient);
      setImportResult(result);
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

        {sharedPatient && (
          <Card withBorder radius="sm" p="md">
            <Stack>
              <Group justify="space-between">
                <div>
                  <Title order={3}>Patient Match</Title>
                  <Text c="dimmed" size="sm">
                    Shared patient: {getPatientDisplay(sharedPatient)}
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
                          <Text fw={600}>{getPatientDisplay(match.patient)}</Text>
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

        {items.length > 0 && !hasTargetPatient && (
          <Card withBorder radius="sm" p="md">
            <Stack gap="xs">
              <Title order={3}>Import Cart</Title>
              <Text c="dimmed">Select an existing patient match or create a new patient to review importable resources.</Text>
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
                    {selectedItems.length} of {items.filter((item) => item.resource.resourceType !== 'Patient').length}{' '}
                    resources selected
                  </Text>
                  <Text c={hasTargetPatient ? 'green' : 'orange'} size="sm" fw={600}>
                    {getTargetPatientLabel(createNewPatient, selectedPatient)}
                  </Text>
                </div>
                <Group>
                  <Button variant="default" onClick={() => setSelectedKeys(new Set(items.map((item) => item.key)))}>
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
                      <Table.Th>Import</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((item) => (
                      <ResourceCartRow
                        key={item.key}
                        item={item}
                        checked={selectedKeys.has(item.key)}
                        onChange={(checked) => {
                          setSelectedKeys((prev) => {
                            const next = new Set(prev);
                            if (checked) {
                              next.add(item.key);
                            } else {
                              next.delete(item.key);
                            }
                            return next;
                          });
                        }}
                      />
                    ))}
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

        {importResult && (
          <Alert color="green" icon={<IconCheck size={16} />}>
            Imported {importResult.entry?.length ?? 0} selected resources.
          </Alert>
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
  readonly item: SmartHealthLinkResourceItem;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

function ResourceCartRow({ item, checked, onChange }: ResourceCartRowProps): JSX.Element {
  const isPatient = item.resource.resourceType === 'Patient';
  return (
    <Table.Tr>
      <Table.Td>
        <Checkbox
          aria-label={`Select ${item.resource.resourceType}`}
          disabled={isPatient}
          checked={!isPatient && checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      </Table.Td>
      <Table.Td>
        <Badge variant="light">{item.resource.resourceType}</Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{getCartRowSummary(item)}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {getCartRowImportLabel(item)}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

function getCartRowSummary(item: SmartHealthLinkResourceItem): string {
  if (item.resource.resourceType === 'Patient') {
    return getPatientDisplay(item.resource);
  }
  return getResourceSummary(item.resource);
}

function getCartRowImportLabel(item: SmartHealthLinkResourceItem): string {
  if (item.resource.resourceType === 'Patient') {
    return 'Used for patient matching';
  }
  if (item.defaultSelected) {
    return 'Conditional create when possible';
  }
  return 'Create';
}

function getTargetPatientLabel(createNewPatient: boolean, selectedPatient: WithId<Patient> | undefined): string {
  if (createNewPatient) {
    return 'Target patient: create new patient';
  }
  if (selectedPatient) {
    return `Target patient: ${getPatientDisplay(selectedPatient)}`;
  }
  return 'Target patient: not selected';
}

function normalizeSmartHealthLink(input: string): string {
  const value = input.trim();
  const index = value.indexOf('shlink:/');
  return index >= 0 ? value.substring(index) : value;
}

function preparePatientForCreate(patient: Patient): Patient {
  const result = deepClone(patient);
  delete result.id;
  delete result.meta;
  return result;
}
