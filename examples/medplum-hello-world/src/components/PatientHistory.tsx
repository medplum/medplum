import React from 'react';
import { usePatientInfo } from '../pages/PatientPage';
import { Document, ResourceHistoryTable } from '@medplum/react';

export function PatientHistory(): JSX.Element {
  const { patient } = usePatientInfo().data;
  return (
    <Document>
      <ResourceHistoryTable resourceType="Patient" id={patient.id} />
    </Document>
  );
}
