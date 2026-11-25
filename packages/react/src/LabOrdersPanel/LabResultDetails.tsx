// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { LabDetailLayout } from './LabDetailLayout';
import { LabReportContent } from './LabReportContent';

export interface LabResultDetailsProps {
  result: DiagnosticReport;
}

export function LabResultDetails(props: LabResultDetailsProps): JSX.Element {
  const { result } = props;

  return (
    <LabDetailLayout
      title={<CodeableConceptDisplay value={result.code} />}
      subtitle={
        <>
          Issued {formatDate(result.issued)}
          {result.effectiveDateTime && ` • Collected ${formatDate(result.effectiveDateTime)}`}
        </>
      }
      actions={
        <Group justify="flex-end" align="center">
          <Badge size="lg" color={getStatusColor(result.status)} variant="light">
            {getStatusDisplayText(result.status)}
          </Badge>
        </Group>
      }
    >
      <LabReportContent report={result} />
    </LabDetailLayout>
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
