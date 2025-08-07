// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Title } from '@mantine/core';
import { Immunization } from '@medplum/fhirtypes';
import { ResourceTable, useMedplum } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';
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
