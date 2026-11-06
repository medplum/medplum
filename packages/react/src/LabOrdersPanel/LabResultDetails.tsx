// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DiagnosticReport } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { renderMedplumLink, useDiagnosticReportResources } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { useLabReportAttachments } from './LabReportContent';
import { LabResultDetailsView } from './LabResultDetailsView';

export interface LabResultDetailsProps {
  result: DiagnosticReport;
}

/**
 * The details of a lab result that has no order, resolving its documents and referenced resources
 * through the Medplum client and linking with MedplumLink.
 * @param props - The result.
 * @returns The result details.
 */
export function LabResultDetails(props: LabResultDetailsProps): JSX.Element {
  const { result } = props;
  const attachments = useLabReportAttachments(result);
  const resources = useDiagnosticReportResources(result);
  return (
    <LabResultDetailsView result={result} attachments={attachments} resources={resources} renderLink={renderMedplumLink} />
  );
}
