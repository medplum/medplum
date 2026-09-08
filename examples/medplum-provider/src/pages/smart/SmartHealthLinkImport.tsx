// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Divider, Stack, Stepper } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { ContentType, deepClone, normalizeErrorString } from '@medplum/core';
import type { Bundle, Parameters, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import classes from './SmartHealthLinkImport.module.css';
import type { SmartHealthLinkPatientMatch } from './SmartHealthLinkImport.utils';
import {
  buildSmartHealthLinkImportBundle,
  getImportButtonLabel,
  getMatchGrade,
  getSmartHealthCardFile,
  getSmartHealthLinkBundle,
  getSmartHealthLinkBundleEntryKey,
  getSmartHealthLinkPatient,
  sortImportableEntries,
  uploadInlineAttachments,
} from './SmartHealthLinkImport.utils';
import { SmartHealthLinkInputStep } from './SmartHealthLinkInputStep';
import { SmartHealthLinkPatientStep } from './SmartHealthLinkPatientStep';
import { SmartHealthLinkRecordsStep } from './SmartHealthLinkRecordsStep';

export interface SmartHealthLinkImportProps {
  /**
   * Called with the target Patient after a successful import. The flow itself does not navigate or
   * dismiss — the host decides, so a page can route to the patient and a modal can just close.
   */
  readonly onImported?: (patient: WithId<Patient>) => void;
}

const STEP_INPUT = 0;
const STEP_PATIENT = 1;
const STEP_IMPORT = 2;

export function SmartHealthLinkImport({ onImported }: SmartHealthLinkImportProps): JSX.Element {
  const medplum = useMedplum();
  const [scanning, setScanning] = useState(false);
  const [scanSessionKey, setScanSessionKey] = useState(0);
  const [activeStep, setActiveStep] = useState(STEP_INPUT);
  const [shlink, setShlink] = useState('');
  const [loading, setLoading] = useState<string>();
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string[]>([]);
  const [bundle, setBundle] = useState<Bundle>();
  const [sharedPatient, setSharedPatient] = useState<Patient>();
  const [matches, setMatches] = useState<SmartHealthLinkPatientMatch[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<WithId<Patient>>();
  const [createNewPatient, setCreateNewPatient] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [smartHealthLinkDetails, setSmartHealthLinkDetails] = useState<{
    sourceOrigin?: string;
    expiresAt?: string;
  }>();
  /** Whether the resolved records came from a SMART Health Card or a SMART Health Link. */
  const [sourceKind, setSourceKind] = useState<'Card' | 'Link'>('Link');

  const entries = bundle?.entry?.filter((entry) => entry.resource && getSmartHealthLinkBundleEntryKey(entry)) ?? [];
  const importableEntries = sortImportableEntries(entries.filter((e) => e.resource?.resourceType !== 'Patient'));
  const importableKeys = importableEntries.map(getSmartHealthLinkBundleEntryKey).filter((key): key is string => !!key);
  const selectedCount = importableKeys.filter((key) => selectedKeys.has(key)).length;
  const allImportableSelected = importableKeys.length > 0 && selectedCount === importableKeys.length;
  const someImportableSelected = !allImportableSelected && selectedCount > 0;
  const recipient = medplum.getProject()?.name ?? 'Project';
  const hasTargetPatient = createNewPatient || !!selectedPatient;
  const patientSelectionValue = createNewPatient ? 'new' : (selectedPatient?.id ?? '');
  const canContinueToImport = !!sharedPatient && hasTargetPatient && importableEntries.length > 0;
  const busy = loading === 'resolve' || loading === 'match';

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
    setSourceKind('Link');
    setSharedPatient(undefined);
    setSmartHealthLinkDetails(undefined);
    setMatches([]);
    setSelectedPatient(undefined);
    setCreateNewPatient(false);
    setSelectedKeys(new Set());
  }

  async function resolveLink(shlink: string, options?: { fromScan?: boolean }): Promise<void> {
    const trimmedShlink = shlink.trim();
    if (!trimmedShlink) {
      setError('Enter a SMART Health Link.');
      return;
    }

    // An expired link is not rejected up front - its records are often still served, and
    // only the resolve attempt can tell us. The server errors if they are truly gone.
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
      // Expiry is surfaced inline on the Select Patient step, so keep it out of the
      // generic warning banner rather than reporting it twice.
      setWarning(warnings.filter((message) => !isExpiryWarning(message)));

      const details = {
        sourceOrigin: result.parameter?.find((p) => p.name === 'sourceOrigin')?.valueString,
        expiresAt,
      };
      setSmartHealthLinkDetails(details.sourceOrigin || details.expiresAt ? details : undefined);

      const resources = JSON.parse(
        result.parameter?.find((p) => p.name === 'fhirResources')?.valueString ?? '[]'
      ) as unknown[];
      const bundleFromLink = getSmartHealthLinkBundle(resources);
      const resolvedBundle = bundleFromLink ?? (await resolveSmartHealthCardFile(resources));
      if (!resolvedBundle) {
        throw new Error('SMART Health Link did not contain a FHIR Bundle or SMART Health Card file.');
      }
      // It's a card if it arrived through the "Scan SMART Health Card" camera, if the input is
      // itself a card QR payload, or if the payload turned out to be a verifiable credential
      // rather than a plain Bundle. Otherwise it's a link.
      const cardSource = options?.fromScan || isSmartHealthCardInput(trimmedShlink) || !bundleFromLink;
      setSourceKind(cardSource ? 'Card' : 'Link');
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
        setScanSessionKey((key) => key + 1);
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
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(undefined);
    }
  }

  function handleToggleEntry(key: string, checked: boolean): void {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function handleToggleAll(checked: boolean): void {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of importableKeys) {
        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  }

  return (
    <div>
      <div className={classes.stepperModule}>
        <Stepper
          active={activeStep}
          onStepClick={(step) => step < activeStep && setActiveStep(step)}
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
        {activeStep === STEP_INPUT && (
          <SmartHealthLinkInputStep
            shlink={shlink}
            onShlinkChange={(value) => {
              setShlink(value);
              setError(undefined);
            }}
            error={error}
            busy={busy}
            scanning={scanning}
            scanSessionKey={scanSessionKey}
            onStartScan={() => setScanning(true)}
            onCancelScan={() => {
              setScanning(false);
              setShlink('');
              setError(undefined);
            }}
            onScan={(data) => {
              setShlink(data);
              resolveLink(data, { fromScan: true }).catch(console.error);
            }}
            onResolve={() => resolveLink(shlink).catch(console.error)}
          />
        )}

        {activeStep === STEP_PATIENT && sharedPatient && (
          <SmartHealthLinkPatientStep
            sharedPatient={sharedPatient}
            sourceKind={sourceKind}
            sourceOrigin={smartHealthLinkDetails?.sourceOrigin}
            expiresAt={smartHealthLinkDetails?.expiresAt}
            importableCount={importableEntries.length}
            matches={matches}
            selectionValue={patientSelectionValue}
            onSelectionChange={handlePatientSelectionChange}
            canContinue={canContinueToImport}
            onContinue={() => setActiveStep(STEP_IMPORT)}
          />
        )}

        {activeStep === STEP_IMPORT && hasTargetPatient && sharedPatient && (
          <SmartHealthLinkRecordsStep
            sharedPatient={sharedPatient}
            createNewPatient={createNewPatient}
            selectedPatient={selectedPatient}
            entries={importableEntries}
            selectedKeys={selectedKeys}
            onToggleEntry={handleToggleEntry}
            onToggleAll={handleToggleAll}
            allSelected={allImportableSelected}
            someSelected={someImportableSelected}
            importButtonLabel={getImportButtonLabel(
              createNewPatient ? sharedPatient : selectedPatient,
              createNewPatient
            )}
            importing={loading === 'import'}
            onImport={() => importSelectedResources()}
          />
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

// True when the pasted or scanned value is itself a SMART Health Card QR payload.
function isSmartHealthCardInput(value: string): boolean {
  return value.trim().toLowerCase().startsWith('shc:');
}

// Matches the server's expired-but-available warning so it isn't shown twice.
function isExpiryWarning(message: string): boolean {
  return /expired/i.test(message);
}

function preparePatientForCreate(patient: Patient): Patient {
  const result = deepClone(patient);
  delete result.id;
  delete result.meta;
  return result;
}
