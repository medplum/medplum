// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate, getDisplayString, isReference } from '@medplum/core';
import type { Encounter, Practitioner } from '@medplum/fhirtypes';
import { MedplumLink, useResource } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import classes from './EncounterListItem.module.css';

interface EncounterListItemProps {
  encounter: Encounter;
  selectedEncounterId: string | undefined;
  getItemUri: (encounter: Encounter) => string;
}

export function EncounterListItem({ encounter, selectedEncounterId, getItemUri }: EncounterListItemProps): JSX.Element {
  const isSelected = selectedEncounterId === encounter.id;

  const practitionerRef = encounter.participant
    ?.map((p) => p.individual)
    .find((ref) => isReference<Practitioner>(ref, 'Practitioner'));
  const practitioner = useResource(practitionerRef);

  const title = encounter.type?.[0]?.text ?? encounter.type?.[0]?.coding?.[0]?.display ?? 'Visit';
  const periodLine = [encounter.period?.start, encounter.period?.end]
    .filter(Boolean)
    .map((date) => formatDate(date))
    .join(' – ');
  const practitionerLine = practitioner ? getDisplayString(practitioner) : practitionerRef?.display;

  return (
    <div className={classes.itemWrapper}>
      <MedplumLink to={getItemUri(encounter)} underline="never">
        <Group
          align="center"
          wrap="nowrap"
          className={cx(classes.contentContainer, {
            [classes.selected]: isSelected,
          })}
        >
          <Stack gap={0} flex={1}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Text fw={700} className={classes.title} flex={1}>
                {title}
              </Text>
              <Badge variant="light" color={getStatusColor(encounter.status)} size="sm">
                {getStatusDisplay(encounter.status)}
              </Badge>
            </Group>
            {practitionerLine && (
              <Text size="sm" c="dimmed">
                {practitionerLine}
              </Text>
            )}
            {periodLine && (
              <Text size="sm" c="dimmed">
                {periodLine}
              </Text>
            )}
          </Stack>
        </Group>
      </MedplumLink>
    </div>
  );
}

function getStatusDisplay(status: Encounter['status'] | undefined): string {
  if (!status) {
    return 'Unknown';
  }
  return status
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getStatusColor(status: Encounter['status'] | undefined): string {
  if (status === 'finished') {
    return 'green';
  }
  if (status === 'cancelled' || status === 'entered-in-error') {
    return 'red';
  }
  if (status === 'planned' || status === 'arrived' || status === 'triaged' || status === 'in-progress') {
    return 'blue';
  }
  return 'gray';
}
