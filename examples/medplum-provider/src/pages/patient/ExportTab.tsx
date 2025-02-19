import { Document, PatientExportForm } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function ExportTab(): JSX.Element | null {
  const { patientId } = useParams();
  return (
    <Document maw={600}>
      <PatientExportForm patient={{ reference: `Patient/${patientId}` }} />
    </Document>
  );
}
