// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Divider, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { LabReportContent } from './LabReportContent';

interface LabResultDetailsProps {
  result: DiagnosticReport;
}

export function LabResultDetails(props: LabResultDetailsProps): JSX.Element {
  const { result } = props;

  return (
    <ScrollArea h="100%">
      <Paper h="100%">
        <Stack gap="0">
          <Stack gap="md" p="md">
            <Stack gap="md">
              <Stack gap="0">
                <Text size="xl" fw={800}>
                  {(() => {
                    // If there are multiple codes (2 or more), show them separated by commas
                    if (result.code?.coding && result.code.coding.length >= 2) {
                      return result.code.coding.map((coding) => coding.display).join(', ');
                    }

                    // If there's a text field and only one code, use the text field
                    if (result.code?.text) {
                      return result.code.text;
                    }

                    // Otherwise, show the first code or fallback
                    return result.code?.coding?.[0]?.display || 'Lab Result';
                  })()}
                </Text>
                <Text size="sm" c="gray.7">
                  {result.effectiveDateTime
                    ? `Issued ${formatDate(result.issued)} • Collected ${formatDate(result.effectiveDateTime)}`
                    : `Issued ${formatDate(result.issued)}`}
                </Text>
              </Stack>
              <Divider />
              <Group justify="flex-end" align="center">
                <Badge size="lg" color={getStatusColor(result.status)} variant="light">
                  {getStatusDisplayText(result.status)}
                </Badge>
              </Group>
            </Stack>
          </Stack>

          <Stack gap="xs" p="md">
            <LabReportContent report={result} />
          </Stack>
        </Stack>
      </Paper>
    </ScrollArea>
  );
}

const getStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'final':
      return 'green';
    case 'partial':
      return 'yellow';
    case 'preliminary':
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
    case 'final':
      return 'Final';
    case 'partial':
      return 'Partial';
    case 'preliminary':
      return 'Preliminary';
    case 'cancelled':
      return 'Cancelled';
    case 'entered-in-error':
      return 'Error';
    default:
      return status || 'Unknown';
  }
};
