// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DiagnosticReport, MeasureReport, ResourceType } from '@medplum/fhirtypes';
import { DiagnosticReportDisplay, Document, MeasureReportDisplay, useResource } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

export function ReportPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Document>
      {resourceType === 'MeasureReport' ? (
        <MeasureReportDisplay measureReport={resource as MeasureReport} />
      ) : (
        <DiagnosticReportDisplay value={resource as DiagnosticReport} />
      )}
    </Document>
  );
}
