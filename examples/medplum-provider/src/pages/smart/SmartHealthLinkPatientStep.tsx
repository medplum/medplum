// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Divider, Stack, Text } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import type { JSX } from 'react';
import { PatientDestinationCard } from './PatientDestinationCard';
import classes from './SmartHealthLinkImport.module.css';
import type { SmartHealthLinkPatientMatch } from './SmartHealthLinkImport.utils';
import { isExpired } from './SmartHealthLinkImport.utils';
import { StepActions } from './StepActions';

export interface SmartHealthLinkPatientStepProps {
  /**
   * The Patient carried by the shared bundle, which is also the "create new" candidate. The flow
   * passes the inline resource — it only exists in the bundle, not on this server — so the
   * reference form is accepted for consistency but would not resolve.
   */
  readonly sharedPatient: Patient | Reference<Patient>;
  readonly sourceKind: 'Card' | 'Link';
  readonly sourceOrigin: string | undefined;
  readonly expiresAt: string | undefined;
  readonly importableCount: number;
  readonly matches: SmartHealthLinkPatientMatch[];
  readonly selectionValue: string;
  readonly onSelectionChange: (value: string) => void;
  readonly canContinue: boolean;
  readonly onContinue: () => void;
}

/**
 * Step 2: show what the link shared, then choose whether to import into an existing patient or a
 * newly created one.
 * @param props - The SmartHealthLinkPatientStep React props.
 * @returns The SmartHealthLinkPatientStep React node.
 */
export function SmartHealthLinkPatientStep(props: SmartHealthLinkPatientStepProps): JSX.Element | null {
  const {
    sourceKind,
    sourceOrigin,
    expiresAt,
    importableCount,
    matches,
    selectionValue,
    onSelectionChange,
    canContinue,
    onContinue,
  } = props;
  const sharedPatient = useResource<Patient>(props.sharedPatient);

  if (!sharedPatient) {
    return null;
  }

  return (
    <>
      <Stack gap="md">
        <Text fz="md" fw={800}>
          SMART Health {sourceKind} Details
        </Text>
        <div className={classes.metaGrid}>
          <MetaItem label="Patient" value={getDisplayString(sharedPatient)} />
          <MetaItem label="Date of Birth" value={sharedPatient.birthDate ?? 'No birth date'} />
          <div />
          <MetaItem label="Source" value={sourceOrigin ?? '—'} />
          <MetaItem label="Records Sharing Expiration" value={formatExpiration(expiresAt)} />
          <MetaItem label="Records Shared" value={String(importableCount)} />
        </div>
        {isExpired(expiresAt) && (
          <Alert color="red" variant="light" className={classes.expiredAlert}>
            This {sourceKind.toLowerCase()} has expired, but its records are still available and can be imported.
          </Alert>
        )}
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
          {matches.map((match) => (
            <PatientDestinationCard
              key={match.patient.id}
              patient={match.patient}
              selected={selectionValue === match.patient.id}
              onClick={() => onSelectionChange(match.patient.id)}
              matchGrade={match.grade}
              secondaryText={match.patient.birthDate ? `Born ${match.patient.birthDate}` : 'No birth date'}
            />
          ))}
          <PatientDestinationCard
            patient={sharedPatient}
            selected={selectionValue === 'new'}
            onClick={() => onSelectionChange('new')}
            showNewPatientBadge
          />
        </Stack>
      </Stack>

      <StepActions>
        <Button fullWidth disabled={!canContinue} onClick={onContinue}>
          Continue
        </Button>
      </StepActions>
    </>
  );
}

function formatExpiration(expiresAt: string | undefined): string {
  if (!expiresAt) {
    return '—';
  }
  return new Date(expiresAt).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
