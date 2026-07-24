// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  Divider,
  Group,
  Input,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Stepper,
  Table,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import { ContentType, deepClone, getDisplayString, normalizeErrorString, parseSmartHealthLink } from '@medplum/core';
import type { Bundle, BundleEntry, Parameters, Patient, Resource } from '@medplum/fhirtypes';
import { ModalActionsFooter, ModalContentLayout, QrCodeScanner, ResourceAvatar, useMedplum } from '@medplum/react';
import { IconCheck, IconChevronDown, IconChevronUp, IconDownload, IconEye, IconQrcode } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import classes from './SmartHealthLinkImport.module.css';
import {
  buildSmartHealthLinkImportBundle,
  getMatchGrade,
  getResourceTypeLabel,
  getSmartHealthCardFile,
  getSmartHealthLinkBundle,
  getSmartHealthLinkBundleEntryKey,
  getSmartHealthLinkPatient,
  uploadInlineAttachments,
} from './SmartHealthLinkImport.utils';

type ResourceSortColumn = 'type' | 'details';
type ResourceSortDirection = 'asc' | 'desc';

export interface SmartHealthLinkImportProps {
  /**
   * Rendering context. 'page' renders the in-body Title + description (Document frame).
   * 'modal' omits the in-body Title (the Modal title covers it). Defaults to 'page'.
   */
  readonly variant?: 'page' | 'modal';

  /**
   * Called with the resolved target Patient immediately after a successful import,
   * before navigation. The modal passes onClose here so it dismisses itself.
   */
  readonly onImported?: (patient: WithId<Patient>) => void;
}

const STEP_INPUT = 0;
const STEP_PATIENT = 1;
const STEP_IMPORT = 2;

export function SmartHealthLinkImport({ variant = 'page', onImported }: SmartHealthLinkImportProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const shlinkInputRef = useRef<HTMLTextAreaElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanSessionKey, setScanSessionKey] = useState(0);
  const [activeStep, setActiveStep] = useState(STEP_INPUT);
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
  const [resourceSortColumn, setResourceSortColumn] = useState<ResourceSortColumn>('type');
  const [resourceSortDirection, setResourceSortDirection] = useState<ResourceSortDirection>('asc');
  const [smartHealthLinkDetails, setSmartHealthLinkDetails] = useState<{
    sourceOrigin?: string;
    expiresAt?: string;
  }>();

  const isModal = variant === 'modal';

  // Mantine's Spotlight and Menu return focus to their trigger ~10ms after closing, which can
  // steal focus from this modal's autofocused input when it's opened from one of them. Re-assert
  // focus shortly after mount to win that race.
  useEffect(() => {
    if (!isModal) {
      return undefined;
    }
    const timeout = window.setTimeout(() => shlinkInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timeout);
  }, [isModal]);

  const items = bundle?.entry?.filter((entry) => entry.resource && getSmartHealthLinkBundleEntryKey(entry)) ?? [];
  const selectedItems = items.filter((entry) => {
    const key = getSmartHealthLinkBundleEntryKey(entry);
    return !!key && selectedKeys.has(key) && entry.resource?.resourceType !== 'Patient';
  });
  const importableItems = items.filter((item) => item.resource?.resourceType !== 'Patient');
  const importableCount = importableItems.length;
  const importableKeys = importableItems.map(getSmartHealthLinkBundleEntryKey).filter((key): key is string => !!key);
  const allImportableSelected = importableCount > 0 && importableKeys.every((key) => selectedKeys.has(key));
  const someImportableSelected = !allImportableSelected && importableKeys.some((key) => selectedKeys.has(key));
  const sortedImportableItems = sortImportableItems(importableItems, resourceSortColumn, resourceSortDirection);
  const recipient = medplum.getProject()?.name ?? 'Medplum Provider';
  const hasTargetPatient = createNewPatient || !!selectedPatient;
  const patientSelectionValue = createNewPatient ? 'new' : (selectedPatient?.id ?? '');
  const canContinueToImport = !!sharedPatient && hasTargetPatient && importableCount > 0;
  const importDestinationPatient = createNewPatient ? sharedPatient : selectedPatient;
  const importButtonLabel = getImportButtonLabel(importDestinationPatient, createNewPatient);

  function handlePatientSelectionChange(value: string): void {
    if (value === 'new') {
      setCreateNewPatient(true);
      setSelectedPatient(undefined);
      return;
    }
    const match = matches.find((m) => m.patient.id === value);
    if (match) {
      setCreateNewPatient(false);
      setSelectedPatient(match.patient);
    }
  }

  function resetResolvedState(): void {
    setBundle(undefined);
    setSharedPatient(undefined);
    setSmartHealthLinkDetails(undefined);
    setMatches([]);
    setSelectedPatient(undefined);
    setCreateNewPatient(false);
    setSelectedKeys(new Set());
  }

  function restartScanSession(): void {
    setScanSessionKey((key) => key + 1);
  }

  async function resolveLink(shlink: string, options?: { fromScan?: boolean }): Promise<void> {
    const trimmedShlink = shlink.trim();
    if (!trimmedShlink) {
      setError('Enter a SMART Health Link.');
      return;
    }

    const expiredBeforeResolve = getExpiredSmartHealthLinkInputError(trimmedShlink);
    if (expiredBeforeResolve) {
      setError(expiredBeforeResolve);
      if (options?.fromScan) {
        restartScanSession();
      }
      return;
    }

    setLoading('resolve');
    setError(undefined);
    setWarning([]);
    resetResolvedState();
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

      const warnings =
        result.parameter
          ?.filter((p) => p.name === 'warning')
          .map((p) => p.valueString)
          .filter((value): value is string => !!value) ?? [];
      const expiresAt = result.parameter?.find((p) => p.name === 'expiresAt')?.valueDateTime;
      const expiredAfterResolve = getExpiredSmartHealthLinkResponseError(expiresAt, warnings);
      if (expiredAfterResolve) {
        throw new Error(expiredAfterResolve);
      }
      setWarning(warnings);

      const details = {
        sourceOrigin: result.parameter?.find((p) => p.name === 'sourceOrigin')?.valueString,
        expiresAt,
      };
      setSmartHealthLinkDetails(details.sourceOrigin || details.expiresAt ? details : undefined);

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
      setActiveStep(STEP_PATIENT);
      if (options?.fromScan) {
        setScanning(false);
      }
    } catch (err) {
      setError(normalizeErrorString(err));
      setActiveStep(STEP_INPUT);
      if (options?.fromScan) {
        setScanning(true);
        restartScanSession();
      }
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
      } else if (patientMatches.length === 0) {
        setCreateNewPatient(true);
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
        // Externalize inline base64 attachments to Binary resources so documents (e.g. PDFs) display.
        await uploadInlineAttachments(medplum, transaction);
        await medplum.executeBatch(transaction);
      }
      setSelectedPatient(targetPatient);
      onImported?.(targetPatient);
      navigate(`/Patient/${targetPatient.id}/timeline`)?.catch(console.error);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(undefined);
    }
  }

  function handleStepClick(step: number): void {
    // Allow returning to earlier steps only after they've been reached.
    if (step < activeStep) {
      setActiveStep(step);
    }
  }

  function handleResourceSort(column: ResourceSortColumn): void {
    if (resourceSortColumn === column) {
      setResourceSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setResourceSortColumn(column);
    setResourceSortDirection('asc');
  }

  function handleSelectAllImportable(checked: boolean): void {
    if (checked) {
      setSelectedKeys(new Set(importableKeys));
      return;
    }
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of importableKeys) {
        next.delete(key);
      }
      return next;
    });
  }

  return (
    <div>
      {!isModal && (
        <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
          <Title order={2} fw={800}>
            Import from SMART Health Card or Link
          </Title>
          <Text c="dimmed" size="sm">
            Scan a patient-shared QR code, match the patient, and import selected resources.
          </Text>
        </div>
      )}

      <div className={classes.stepperModule}>
        <Stepper
          active={activeStep}
          onStepClick={handleStepClick}
          allowNextStepsSelect={false}
          iconSize={16}
          classNames={{
            root: classes.stepper,
            steps: classes.steps,
            step: classes.step,
            stepBody: classes.stepBody,
            stepLabel: classes.stepLabel,
            stepWrapper: classes.stepWrapper,
            stepIcon: classes.stepIcon,
            separator: classes.separator,
          }}
          style={{ ['--shl-progress' as string]: `${(activeStep / STEP_IMPORT) * 100}%` }}
          icon={<span />}
          completedIcon={<IconCheck size={10} stroke={2.5} />}
        >
          <Stepper.Step label="Add Card/Link" />
          <Stepper.Step label="Select Patient" />
          <Stepper.Step label="Import Records" />
        </Stepper>
        <Divider />
      </div>

      <Stack gap={0} className={classes.stepContent}>
        {activeStep === STEP_INPUT &&
          (scanning ? (
            <Stack gap="md">
              <Stack gap={8}>
                <Input.Label>Scan SMART Health Card</Input.Label>
                <div className={classes.scanner}>
                  <QrCodeScanner
                    key={scanSessionKey}
                    onScan={(data) => {
                      setShlink(data);
                      resolveLink(data, { fromScan: true }).catch(console.error);
                    }}
                  />
                  {(loading === 'resolve' || loading === 'match') && (
                    <div className={classes.scannerOverlay} aria-hidden>
                      <Center h="100%">
                        <Loader size="sm" color="gray.3" />
                      </Center>
                    </div>
                  )}
                </div>
              </Stack>
              {error && <Input.Error>{error}</Input.Error>}
              <Button
                fullWidth
                variant="default"
                onClick={() => {
                  setScanning(false);
                  setShlink('');
                  setError(undefined);
                }}
              >
                Cancel
              </Button>
            </Stack>
          ) : (
            <Stack gap="md">
              <Stack gap="md">
                <Stack gap={8}>
                  <Input.Label>SMART Health Link</Input.Label>
                  <Textarea
                    data-autofocus
                    ref={shlinkInputRef}
                    placeholder="shlink:/..."
                    value={shlink}
                    onChange={(event) => {
                      setShlink(event.currentTarget.value);
                      setError(undefined);
                    }}
                    minRows={4}
                    autosize
                    aria-label="SMART Health Link"
                    error={error}
                  />
                </Stack>
                <Button
                  fullWidth
                  leftSection={<IconEye size={16} />}
                  loading={loading === 'resolve' || loading === 'match'}
                  onClick={() => resolveLink(shlink)}
                >
                  Open SMART Health Link
                </Button>
              </Stack>
              <Divider label="or" labelPosition="center" />
              <Button
                fullWidth
                variant="default"
                leftSection={<IconQrcode size={16} />}
                onClick={() => setScanning(true)}
              >
                Scan SMART Health Card
              </Button>
            </Stack>
          ))}

        {activeStep === STEP_PATIENT && sharedPatient && (
          <ModalContentLayout
            footer={
              <ModalActionsFooter>
                <Button fullWidth disabled={!canContinueToImport} onClick={() => setActiveStep(STEP_IMPORT)}>
                  Continue
                </Button>
              </ModalActionsFooter>
            }
          >
            <Stack gap="md">
              <Text fz="md" fw={800}>
                SMART Health {getSmartHealthSourceKind(shlink)} Details
              </Text>
              <div className={classes.metaGrid}>
                <MetaItem label="Patient" value={getDisplayString(sharedPatient)} />
                <MetaItem
                  label="Date of Birth"
                  value={sharedPatient.birthDate ? sharedPatient.birthDate : 'No birth date'}
                />
                <div />
                <MetaItem label="Source" value={smartHealthLinkDetails?.sourceOrigin ?? '—'} />
                <MetaItem
                  label="Records Sharing Expiration"
                  value={
                    smartHealthLinkDetails?.expiresAt
                      ? new Date(smartHealthLinkDetails.expiresAt).toLocaleString(undefined, {
                          year: 'numeric',
                          month: 'numeric',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '—'
                  }
                />
                <MetaItem label="Records Shared" value={String(importableCount)} />
              </div>
            </Stack>

            <Divider className={classes.sectionDivider} />

            <Stack gap="md">
              <div>
                <Text fz="md" fw={800}>
                  Select or Create a Patient for Records Import
                </Text>
                <Text size="sm" c="dimmed">
                  {matches.length > 0
                    ? 'Import into an existing patient, or create a new one.'
                    : '(No existing patient matches found)'}
                </Text>
              </div>
              <Stack gap={8} role="radiogroup" aria-label="Select import destination">
                {matches.map((match) => {
                  const selected = patientSelectionValue === match.patient.id;
                  return (
                    <PatientDestinationCard
                      key={match.patient.id}
                      patient={match.patient}
                      selected={selected}
                      onClick={() => handlePatientSelectionChange(match.patient.id)}
                      matchGrade={match.grade}
                      secondaryText={match.patient.birthDate ? `Born ${match.patient.birthDate}` : 'No birth date'}
                    />
                  );
                })}
                <PatientDestinationCard
                  patient={sharedPatient}
                  selected={patientSelectionValue === 'new'}
                  onClick={() => handlePatientSelectionChange('new')}
                  showNewPatientBadge
                />
              </Stack>
            </Stack>
          </ModalContentLayout>
        )}

        {activeStep === STEP_IMPORT && items.length > 0 && hasTargetPatient && sharedPatient && (
          <ModalContentLayout
            footer={
              <ModalActionsFooter>
                <Button
                  fullWidth
                  leftSection={<IconDownload size={16} />}
                  loading={loading === 'import'}
                  disabled={!sharedPatient || selectedItems.length === 0}
                  onClick={() => importSelectedResources()}
                >
                  {importButtonLabel}
                </Button>
              </ModalActionsFooter>
            }
          >
            <ImportDestinationSummary
              createNewPatient={createNewPatient}
              selectedPatient={selectedPatient}
              sharedPatient={sharedPatient}
              selectedCount={selectedItems.length}
              importableCount={importableCount}
            >
              <ScrollArea.Autosize mah={320}>
                <Table
                  horizontalSpacing="sm"
                  verticalSpacing="xs"
                  highlightOnHover
                  style={{
                    borderBottom: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                  }}
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 36 }}>
                        <Checkbox
                          aria-label="Select all resources"
                          checked={allImportableSelected}
                          indeterminate={someImportableSelected}
                          onChange={(event) => handleSelectAllImportable(event.currentTarget.checked)}
                        />
                      </Table.Th>
                      <SortableTableHeader
                        label="Type"
                        active={resourceSortColumn === 'type'}
                        direction={resourceSortDirection}
                        onClick={() => handleResourceSort('type')}
                      />
                      <SortableTableHeader
                        label="Details"
                        active={resourceSortColumn === 'details'}
                        direction={resourceSortDirection}
                        onClick={() => handleResourceSort('details')}
                      />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {sortedImportableItems.map((item) => {
                      const key = getSmartHealthLinkBundleEntryKey(item) as string;
                      const resource = item.resource as Resource;
                      const checked = selectedKeys.has(key);
                      return (
                        <Table.Tr key={key}>
                          <Table.Td>
                            <Checkbox
                              aria-label={`Select ${getDisplayString(resource)}`}
                              checked={checked}
                              onChange={(event) => {
                                const nextChecked = event.currentTarget.checked;
                                setSelectedKeys((prev) => {
                                  const next = new Set(prev);
                                  if (nextChecked) {
                                    next.add(key);
                                  } else {
                                    next.delete(key);
                                  }
                                  return next;
                                });
                              }}
                            />
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{getResourceTypeLabel(resource.resourceType)}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={400}>
                              {getDisplayString(resource)}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </ImportDestinationSummary>
          </ModalContentLayout>
        )}

        {((error && activeStep !== STEP_INPUT) || warning.length > 0) && (
          <Stack gap="md" mt="lg">
            {error && activeStep !== STEP_INPUT && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            {warning.map((message) => (
              <Alert key={message} color="yellow" variant="light">
                {message}
              </Alert>
            ))}
          </Stack>
        )}
      </Stack>
    </div>
  );
}

interface MetaItemProps {
  readonly label: string;
  readonly value: string;
}

function MetaItem({ label, value }: MetaItemProps): JSX.Element {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </div>
  );
}

function getSmartHealthSourceKind(value: string): 'Card' | 'Link' {
  return value.trim().toLowerCase().startsWith('shc:') ? 'Card' : 'Link';
}

interface SortableTableHeaderProps {
  readonly label: string;
  readonly active: boolean;
  readonly direction: ResourceSortDirection;
  readonly onClick: () => void;
}

function SortableTableHeader({ label, active, direction, onClick }: SortableTableHeaderProps): JSX.Element {
  return (
    <Table.Th>
      <UnstyledButton onClick={onClick}>
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={600}>
            {label}
          </Text>
          {active && (direction === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />)}
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

/**
 * Label for the import button, which names the destination patient once one is chosen.
 * @param destination - The patient the records will be imported into, if already resolved.
 * @param createNewPatient - True when the destination patient will be created by the import.
 * @returns The button label.
 */
function getImportButtonLabel(destination: Patient | undefined, createNewPatient: boolean): string {
  if (!destination) {
    return 'Import Records';
  }
  const name = getDisplayString(destination);
  return createNewPatient ? `Create ${name} & Import Records` : `Import Records to ${name}`;
}

/**
 * Sort key for a bundle entry: the friendly resource-type label, or its display string.
 * @param resource - The bundle entry's resource, if present.
 * @param column - The column being sorted on.
 * @returns The comparable string value, or empty string when there is no resource.
 */
function sortValue(resource: Resource | undefined, column: ResourceSortColumn): string {
  if (!resource) {
    return '';
  }
  return column === 'type' ? getResourceTypeLabel(resource.resourceType) : getDisplayString(resource);
}

function sortImportableItems(
  items: BundleEntry[],
  column: ResourceSortColumn,
  direction: ResourceSortDirection
): BundleEntry[] {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const valueA = sortValue(a.resource, column);
    const valueB = sortValue(b.resource, column);
    return valueA.localeCompare(valueB) * multiplier;
  });
}

interface ImportDestinationSummaryProps {
  readonly createNewPatient: boolean;
  readonly selectedPatient: WithId<Patient> | undefined;
  readonly sharedPatient: Patient;
  readonly selectedCount: number;
  readonly importableCount: number;
  readonly children?: ReactNode;
}

interface PatientDestinationCardProps {
  readonly patient: Patient;
  readonly selected: boolean;
  readonly onClick?: () => void;
  readonly showNewPatientBadge?: boolean;
  readonly matchGrade?: string;
  readonly secondaryText?: string;
}

function formatMatchGradeBadge(grade: string): string {
  return `${grade.charAt(0).toUpperCase()}${grade.slice(1)} Match`;
}

function getMatchGradeBadgeColor(grade: string): 'green' | 'orange' {
  return grade === 'certain' ? 'green' : 'orange';
}

function PatientDestinationCard(props: PatientDestinationCardProps): JSX.Element {
  const { patient, selected, onClick, showNewPatientBadge, matchGrade, secondaryText } = props;
  const card = (
    <Paper withBorder p="md" radius="md" className={selected && onClick ? classes.destinationCardSelected : undefined}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ResourceAvatar value={patient} size={40} radius="xl" />
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {getDisplayString(patient)}
            </Text>
            <Text size="xs" fw={500} c="dimmed" truncate>
              {secondaryText ?? (patient.birthDate ? `Born ${patient.birthDate}` : 'No birth date')}
            </Text>
          </div>
        </Group>
        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
          {showNewPatientBadge && (
            <Badge color="grape" variant="light" size="sm">
              Create New Patient
            </Badge>
          )}
          {matchGrade && (
            <Badge color={getMatchGradeBadgeColor(matchGrade)} variant="light" size="sm">
              {formatMatchGradeBadge(matchGrade)}
            </Badge>
          )}
          {selected ? <IconCheck size={16} color="var(--mantine-color-blue-6)" /> : null}
        </Group>
      </Group>
    </Paper>
  );

  if (!onClick) {
    return card;
  }

  return (
    <UnstyledButton
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      w="100%"
      style={{ borderRadius: 'var(--mantine-radius-md)' }}
    >
      {card}
    </UnstyledButton>
  );
}

function ImportDestinationSummary(props: ImportDestinationSummaryProps): JSX.Element | null {
  const { createNewPatient, selectedPatient, sharedPatient, selectedCount, importableCount, children } = props;
  const destinationPatient = createNewPatient ? sharedPatient : selectedPatient;
  if (!destinationPatient) {
    return null;
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="nowrap" gap="md">
        <Text fz="md" fw={800}>
          Select Records to Import to {createNewPatient ? 'New' : 'Existing'} Profile
        </Text>
        <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
          {selectedCount} of {importableCount} selected
        </Text>
      </Group>
      <PatientDestinationCard patient={destinationPatient} selected showNewPatientBadge={createNewPatient} />
      {children}
      {!createNewPatient && (
        <Text size="sm" c="dimmed">
          Existing records will automatically be excluded from the import.
        </Text>
      )}
    </Stack>
  );
}

function getExpiredSmartHealthLinkInputError(shlink: string): string | undefined {
  try {
    const payload = parseSmartHealthLink(shlink);
    if (payload.exp !== undefined && payload.exp <= Math.floor(Date.now() / 1000)) {
      return 'This SMART Health Link has expired.';
    }
  } catch {
    // Non-shlink input (for example a SMART Health Card URI) is validated by the server.
  }
  return undefined;
}

function getExpiredSmartHealthLinkResponseError(
  expiresAt: string | undefined,
  warnings: readonly string[]
): string | undefined {
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return 'This SMART Health Link has expired.';
  }
  if (warnings.some((warning) => /expired/i.test(warning))) {
    return 'This SMART Health Link has expired.';
  }
  return undefined;
}

function preparePatientForCreate(patient: Patient): Patient {
  const result = deepClone(patient);
  delete result.id;
  delete result.meta;
  return result;
}
