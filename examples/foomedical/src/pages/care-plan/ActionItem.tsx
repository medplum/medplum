import { Box, Title } from '@mantine/core';
import { CarePlan } from '@medplum/fhirtypes';
import { ResourceTable, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { InfoSection } from '../../components/InfoSection';

export function ActionItem(): JSX.Element {
  const medplum = useMedplum();
  const { itemId } = useParams();
  const resource: CarePlan = medplum.readResource('CarePlan', itemId as string).read();

  return (
    <Box p="xl">
      <Title order={2} mb="md">
        {resource.title}
      </Title>
      <InfoSection title="Action Item">
        <ResourceTable value={resource} ignoreMissingValues />
      </InfoSection>
    </Box>
  );
}
