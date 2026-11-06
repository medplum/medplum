// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { DiagnosticReport, Organization, Practitioner } from '@medplum/fhirtypes';
import cx from 'clsx';
import type { JSX } from 'react';
import classes from './LabListItem.module.css';

export interface LabResultListItemViewProps {
  readonly report: DiagnosticReport;
  readonly selected: boolean;
  /** The performer, resolved by the caller. Omitted: falls back to "Collected <date>". */
  readonly performer?: Practitioner | Organization;
}

/**
 * The body of a lab result row. It holds no client and no link: the caller resolves the
 * performer and wraps the row in its own link.
 * @param props - The report and its resolved performer.
 * @returns The row body.
 */
export function LabResultListItemView(props: LabResultListItemViewProps): JSX.Element {
  const { report, selected, performer } = props;
  const subText = getSubText(report, performer);
  const isFinalized = FINALIZED_REPORT_STATUSES.has(report.status);
  const date = formatDate(report.issued || report.effectiveDateTime || report.meta?.lastUpdated);

  return (
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

const getSubText = (report: DiagnosticReport, performer: Practitioner | Organization | undefined): string => {
  if (performer?.resourceType === 'Practitioner') {
    return `Performed by ${formatHumanName(performer.name?.[0])}`;
  }
  if (performer?.resourceType === 'Organization' && performer.name) {
    return performer.name;
  }
  const collected = formatDate(report.effectiveDateTime);
  return collected ? `Collected ${collected}` : '';
};
