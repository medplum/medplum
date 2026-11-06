// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { Attachment, DiagnosticReport, Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import type { RenderResourceLink } from '../DiagnosticReportDisplay/DiagnosticReportDisplayView';
import { LabDetailLayout } from './LabDetailLayout';
import { LabReportContentView } from './LabReportContentView';

export interface LabResultDetailsViewProps {
  readonly result: DiagnosticReport;
  /** The lab documents, resolved by the caller. See LabReportContentView. */
  readonly attachments?: Attachment[];
  /** The resources the report references, resolved by the caller. See DiagnosticReportDisplayView. */
  readonly resources?: Resource[];
  /** Renders the links in the report display. Default: no links. */
  readonly renderLink?: RenderResourceLink;
}

/**
 * The details of a lab result that has no order. It holds no client: the caller resolves the
 * documents and the referenced resources.
 * @param props - The result and its resolved documents and resources.
 * @returns The result details.
 */
export function LabResultDetailsView(props: LabResultDetailsViewProps): JSX.Element {
  const { result, attachments, resources, renderLink } = props;

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
      <LabReportContentView report={result} attachments={attachments} resources={resources} renderLink={renderLink} />
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
