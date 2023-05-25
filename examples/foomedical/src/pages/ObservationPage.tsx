import { Title } from '@mantine/core';
import { Document, ResourceTable, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function ObservationPage(): JSX.Element {
  const medplum = useMedplum();
  const { observationId = '' } = useParams();
  const resource = medplum.readResource('Observation', observationId).read();

  return (
    <Document>
      <Title>Observation</Title>
      <ResourceTable value={resource} ignoreMissingValues />
    </Document>
  );
}
