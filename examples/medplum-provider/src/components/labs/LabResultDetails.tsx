// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Divider, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import { CodeableConceptDisplay } from '@medplum/react';
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
            <Stack gap="0">
              <Text size="xl" fw={800}>
                <CodeableConceptDisplay value={result.code} />
              </Text>
              <Text size="sm" c="gray.7">
                Issued {formatDate(result.issued)}
                {result.effectiveDateTime && ` • Collected ${formatDate(result.effectiveDateTime)}`}
              </Text>
            </Stack>
            <Divider />
            <Group justify="flex-end" align="center">
              <Badge size="lg" color={getStatusColor(result.status)} variant="light">
                {getStatusDisplayText(result.status)}
              </Badge>
            </Group>
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
