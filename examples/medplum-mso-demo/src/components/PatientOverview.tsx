import { Title } from '@mantine/core';
import { Document, ResourceTable } from '@medplum/react';
import { useParams } from 'react-router-dom';

/*
 * You can combine Medplum components with plain HTML to quickly display patient data.
 * Medplum has out of the box components to render common data types such as
 *   - Addresses
 *   - Phone numbers
 *   - Patient/Provider names
 *   - Patient/Provider profile photo
 * */
export function PatientOverview(): JSX.Element {
  const { id } = useParams();
  return (
    <Document>
      <Title order={3} mb="xl">
        Patient Overview
      </Title>
      <ResourceTable value={{ reference: `Patient/${id}` }} />
    </Document>
  );
}
