// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import { MedplumLink, useResource } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
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
          <Text fw={700} className={classes.title} flex={1}>
            {getDisplayText(report)}
          </Text>
          <Text size="sm">
            Completed {formatDate(report.issued || report.effectiveDateTime || report.meta?.lastUpdated)}
          </Text>
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
