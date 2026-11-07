// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { Attachment, DiagnosticReport, Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import type { RenderResourceLink } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { renderMedplumLink, useDiagnosticReportResources } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { LabDetailLayout } from './LabDetailLayout';
import { LabReportContentView, useLabReportAttachments } from './LabReportContent';

export interface LabResultDetailsProps {
  result: DiagnosticReport;
}

/**
 * Resolves the lab documents and referenced resources for a result, for LabResultDetailsView.
 * @param result - The report, or undefined to keep the hook idle.
 * @returns The resolved attachments and the resources the report references.
 */
export function useLabResultDetailsData(result: DiagnosticReport | undefined): {
  attachments: Attachment[];
  resources: Resource[] | undefined;
} {
  return {
    attachments: useLabReportAttachments(result),
    resources: useDiagnosticReportResources(result),
  };
}

/**
 * The details of a lab result that has no order, resolving its documents and referenced resources
 * through the Medplum client and linking with MedplumLink.
 * @param props - The result.
 * @returns The result details.
 */
export function LabResultDetails(props: LabResultDetailsProps): JSX.Element {
  const { result } = props;
  const { attachments, resources } = useLabResultDetailsData(result);
  return (
    <LabResultDetailsView
      result={result}
      attachments={attachments}
      resources={resources}
      renderLink={renderMedplumLink}
    />
  );
}

export interface LabResultDetailsViewProps {
  readonly result: DiagnosticReport;
  readonly attachments?: Attachment[];
  readonly resources?: Resource[];
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
