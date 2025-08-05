// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { JSX } from 'react';
import { Container, Stack, Title } from '@mantine/core';
import { Practitioner } from '@medplum/fhirtypes';
import {
  Document,
  ResourceName,
  SearchControl,
  useMedplumNavigate,
  useMedplumProfile,
} from '@medplum/react';

export function PatientPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useMedplumNavigate();

  return (
    <Document mt="xl">
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <Title order={2} fw={500}>
            Welcome, <ResourceName value={profile} link />
          </Title>
          <SearchControl
            search={{ resourceType: 'Patient', fields: ['name', 'birthDate', 'gender'] }}
            onClick={(e) => navigate(`/Patient/${e.resource.id}`)}
            hideToolbar
          />
        </Stack>
      </Container>
    </Document>
  );
}
