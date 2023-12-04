import { DiagnosticReport, MeasureReport, ResourceType } from '@medplum/fhirtypes';
import { DiagnosticReportDisplay, Document, useResource, MeasureReportDisplay } from '@medplum/react';
import { useParams } from 'react-router-dom';

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
