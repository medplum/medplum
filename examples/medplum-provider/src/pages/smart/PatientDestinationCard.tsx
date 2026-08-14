// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Paper, Text, UnstyledButton } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { ResourceAvatar, useResource } from '@medplum/react';
import type { JSX } from 'react';
import classes from './SmartHealthLinkImport.module.css';

export interface PatientDestinationCardProps {
  readonly patient: Patient | Reference<Patient>;
  readonly selected: boolean;
  readonly onClick?: () => void;
  readonly showNewPatientBadge?: boolean;
  readonly matchGrade?: string;
  readonly secondaryText?: string;
}

/**
 * A patient shown as an import destination — either a selectable `$match` candidate or, without
 * `onClick`, a read-only summary of the destination already chosen.
 * @param props - The PatientDestinationCard React props.
 * @returns The PatientDestinationCard React node.
 */
export function PatientDestinationCard(props: PatientDestinationCardProps): JSX.Element | null {
  const { selected, onClick, showNewPatientBadge, matchGrade, secondaryText } = props;
  const patient = useResource<Patient>(props.patient);

  if (!patient) {
    return null;
  }

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
            <Badge color={matchGrade === 'certain' ? 'green' : 'orange'} variant="light" size="sm">
              {`${matchGrade.charAt(0).toUpperCase()}${matchGrade.slice(1)} Match`}
            </Badge>
          )}
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
