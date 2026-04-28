// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Text } from '@mantine/core';
import type { EPrescribingExtensions } from '@medplum/core';
import { formatCodeableConcept, formatDate, formatHumanName, getEPrescribingPendingOrderStatus } from '@medplum/core';
import type { HumanName, MedicationRequest, Practitioner } from '@medplum/fhirtypes';
import { MedplumLink, useResource } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import classes from './MedListItem.module.css';

export type MedTab = 'active' | 'draft' | 'completed';

interface MedListItemProps {
  item: MedicationRequest;
  selectedItem: MedicationRequest | undefined;
  activeTab: MedTab;
  onItemSelect: (item: MedicationRequest) => string;
  ePrescribingExtensions: EPrescribingExtensions;
}

export function MedListItem(props: MedListItemProps): JSX.Element {
  const { item, selectedItem, activeTab, onItemSelect, ePrescribingExtensions } = props;
  const isSelected = selectedItem?.id === item.id;
  const requester = useResource(item.requester) as Practitioner | undefined;
  const pendingStatus = getEPrescribingPendingOrderStatus(item, ePrescribingExtensions);

  return (
    <MedplumLink to={onItemSelect(item)} underline="never">
      <Group
        align="center"
        wrap="nowrap"
        className={cx(classes.contentContainer, {
          [classes.selected]: isSelected,
        })}
      >
        <Stack gap={0} flex={1}>
          <Group justify="space-between" align="flex-start">
            <Text fw={700} className={classes.title} flex={1}>
              {getMedicationDisplay(item)}
            </Text>
            <Group gap={4}>
              {pendingStatus && (
                <Badge size="sm" color="violet" variant="light">
                  ScriptSure: {pendingStatus}
                </Badge>
              )}
              {activeTab !== 'completed' && (
                <Badge size="sm" color={getStatusColor(item.status)} variant="light">
                  {getStatusDisplayText(item.status)}
                </Badge>
              )}
            </Group>
          </Group>
          <Text size="sm" c="dimmed">
            {getSubText(item, requester)}
          </Text>
        </Stack>
      </Group>
    </MedplumLink>
  );
}

function getMedicationDisplay(mr: MedicationRequest): string {
  const mc = mr.medicationCodeableConcept;
  if (mc?.text) {
    return mc.text;
  }
  return formatCodeableConcept(mc) || 'Medication order';
}

const getStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'blue';
    case 'draft':
      return 'yellow';
    case 'on-hold':
      return 'orange';
    case 'cancelled':
    case 'entered-in-error':
      return 'red';
    case 'completed':
      return 'green';
    case 'stopped':
      return 'gray';
    default:
      return 'gray';
  }
};

const getStatusDisplayText = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'draft':
      return 'Draft';
    case 'on-hold':
      return 'On Hold';
    case 'cancelled':
      return 'Cancelled';
    case 'entered-in-error':
      return 'Error';
    case 'completed':
      return 'Completed';
    case 'stopped':
      return 'Stopped';
    default:
      return status || 'Unknown';
  }
};

const getSubText = (item: MedicationRequest, requester: Practitioner | undefined): string => {
  const date = formatDate(item.authoredOn || item.meta?.lastUpdated);
  const dosage = item.dosageInstruction?.[0]?.text;
  const dosagePart = dosage ? ` · ${dosage}` : '';
  if (requester?.resourceType === 'Practitioner') {
    return `${date} · ${formatHumanName(requester.name?.[0] as HumanName)}${dosagePart}`;
  }
  return `${date}${dosagePart}`;
};
