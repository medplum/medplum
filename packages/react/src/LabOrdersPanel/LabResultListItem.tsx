// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import classes from './LabListItem.module.css';

interface LabResultListItemProps {
  report: DiagnosticReport;
  selected: boolean;
  to: string;
}

export function LabResultListItem(props: LabResultListItemProps): JSX.Element {
  const { report, selected, to } = props;
  const performer = useResource(report.performer?.[0]);
  const subText = getSubText(report, performer);
  const isFinalized = FINALIZED_REPORT_STATUSES.has(report.status);
  const date = formatDate(report.issued || report.effectiveDateTime || report.meta?.lastUpdated);

  return (
    <MedplumLink to={to} underline="never">
      <Group
        align="center"
        wrap="nowrap"
        className={cx(classes.contentContainer, {
          [classes.selected]: selected,
        })}
      >
        <Stack gap={0} flex={1} miw={0}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Text fw={700} className={classes.title} flex={1}>
              {getDisplayText(report)}
            </Text>
            {!isFinalized && (
              <Badge size="sm" color="yellow" variant="light">
                {getReportStatusDisplayText(report.status)}
              </Badge>
            )}
          </Group>
          <Text size="sm">{isFinalized ? `Completed ${date}` : `Received ${date}`}</Text>
          {subText && (
            <Text size="sm" c="dimmed">
              {subText}
            </Text>
          )}
        </Stack>
      </Group>
    </MedplumLink>
  );
}

// A result can still be useful to a clinician before it's finalized (e.g. an interim value from
// a multi-day culture), which is why it's listed here at all - but it must stay visually distinct
// from a final result, or there's no way to tell the two apart without opening it.
const FINALIZED_REPORT_STATUSES = new Set<DiagnosticReport['status']>(['final', 'corrected', 'amended']);

const getReportStatusDisplayText = (status: DiagnosticReport['status']): string => {
  return status === 'partial' ? 'Partial' : 'Preliminary';
};

const getDisplayText = (report: DiagnosticReport): string => {
  // If there are multiple codes (2 or more), show them separated by commas
  if (report.code?.coding && report.code.coding.length >= 2) {
    return report.code.coding.map((coding) => coding.display).join(', ');
  }

  // If there's a text field and only one code, use the text field
  if (report.code?.text) {
    return report.code.text;
  }

  // Otherwise, show the first code or fallback
  return report.code?.coding?.[0]?.display || 'Lab Result';
};

const getSubText = (report: DiagnosticReport, performer: ReturnType<typeof useResource>): string => {
  if (performer?.resourceType === 'Practitioner') {
    return `Performed by ${formatHumanName(performer.name?.[0])}`;
  }
  if (performer?.resourceType === 'Organization' && performer.name) {
    return performer.name;
  }
  const collected = formatDate(report.effectiveDateTime);
  return collected ? `Collected ${collected}` : '';
};
