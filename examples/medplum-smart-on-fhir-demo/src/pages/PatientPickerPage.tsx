// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Container, Title } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

export function PatientPickerPage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Container size="xl" mt="xl">
      <Anchor onClick={() => navigate('/')} mb="md" display="block">
        ← Back to Home
      </Anchor>
      <Title order={1} mb="md">
        Select a Patient
      </Title>
      <SearchControl
        search={{ resourceType: 'Patient', fields: ['name', 'birthdate', 'gender'] }}
        onClick={(e) => {
          const patient = e.resource as Patient;
          sessionStorage.setItem('smart_patient', patient.id as string);
          Promise.resolve(navigate('/patient')).catch(() => {});
        }}
        hideToolbar
      />
    </Container>
  );
}
