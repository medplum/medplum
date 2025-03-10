import { Title } from '@mantine/core';
import { Document, ResourceHistoryTable } from '@medplum/react';
import { useParams } from 'react-router';

/**
 * The PatientHistory component displays the history of a patient.
 * 
 * @component
 * @returns {JSX.Element} The patient history component
 */
export function PatientHistory(): JSX.Element {
  const { id } = useParams();
  return (
    <Document>
      <Title order={3} mb="xl">
        Patient History
      </Title>
      <ResourceHistoryTable resourceType="Patient" id={id} />
    </Document>
  );
}
