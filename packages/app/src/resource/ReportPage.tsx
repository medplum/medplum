import { DiagnosticReport, ResourceType } from '@medplum/fhirtypes';
import { DiagnosticReportDisplay, Document, useResource } from '@medplum/react';
import React from 'react';
import { useParams } from 'react-router-dom';

export function ReportPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <DiagnosticReportDisplay value={resource as DiagnosticReport} />
    </Document>
  );
}
