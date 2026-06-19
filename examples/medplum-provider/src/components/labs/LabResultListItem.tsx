// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import { MedplumLink } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
// Reuse the order row's chrome so result rows and order rows are visually consistent.
import classes from './LabListItem.module.css';

interface LabResultListItemProps {
  item: DiagnosticReport;
  selectedItem: DiagnosticReport | undefined;
  onItemSelect: (item: DiagnosticReport) => string;
}

export function LabResultListItem(props: LabResultListItemProps): JSX.Element {
  const { item, selectedItem, onItemSelect } = props;
  const isSelected = selectedItem?.id === item.id;

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
              {getDisplayText(item)}
            </Text>
            <Badge size="sm" color={getStatusColor(item.status)} variant="light">
              {getStatusDisplayText(item.status)}
            </Badge>
          </Group>
          <Text size="sm">Resulted {formatDate(item.issued || item.effectiveDateTime || item.meta?.lastUpdated)}</Text>
          {item.performer?.[0]?.display && (
            <Text size="sm" c="dimmed">
              {item.performer[0].display}
            </Text>
          )}
        </Stack>
      </Group>
    </MedplumLink>
  );
}

const getDisplayText = (report: DiagnosticReport): string => {
  // If there are multiple codes (2 or more), show them separated by commas
  if (report.code?.coding && report.code.coding.length >= 2) {
    return report.code.coding.map((coding) => coding.display).join(', ');
  }

  // If there's a text field, use it
  if (report.code?.text) {
    return report.code.text;
  }

  // Otherwise, show the first code or fallback
  return report.code?.coding?.[0]?.display || 'Lab Result';
};

const getStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'final':
      return 'green';
    case 'partial':
    case 'preliminary':
      return 'yellow';
    case 'amended':
    case 'corrected':
    case 'appended':
      return 'blue';
    case 'cancelled':
    case 'entered-in-error':
      return 'red';
    default:
      return 'gray';
  }
};

const getStatusDisplayText = (status: string | undefined): string => {
  switch (status) {
    case 'registered':
      return 'Registered';
    case 'partial':
      return 'Partial';
    case 'preliminary':
      return 'Preliminary';
    case 'final':
      return 'Final';
    case 'amended':
      return 'Amended';
    case 'corrected':
      return 'Corrected';
    case 'appended':
      return 'Appended';
    case 'cancelled':
      return 'Cancelled';
    case 'entered-in-error':
      return 'Error';
    case 'unknown':
      return 'Unknown';
    default:
      return status || 'Unknown';
  }
};
