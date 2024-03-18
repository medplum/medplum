import { Title } from '@mantine/core';
import { Document, ResourceHistoryTable } from '@medplum/react';
import { useParams } from 'react-router-dom';

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
