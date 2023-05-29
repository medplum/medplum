import { Box, Title } from '@mantine/core';
import { Immunization } from '@medplum/fhirtypes';
import { ResourceTable, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { InfoSection } from '../../components/InfoSection';

export function Vaccine(): JSX.Element {
  const medplum = useMedplum();
  const { vaccineId = '' } = useParams();
  const vaccine: Immunization = medplum.readResource('Immunization', vaccineId).read();

  return (
    <Box p="xl">
      <Title order={2} mb="md">
        {vaccine.vaccineCode?.text}
      </Title>
      <InfoSection title="Vaccine">
        <ResourceTable value={vaccine} ignoreMissingValues />
      </InfoSection>
    </Box>
  );
}
