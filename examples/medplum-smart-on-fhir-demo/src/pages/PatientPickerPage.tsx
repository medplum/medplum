import { Container, Title } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';

export function PatientPickerPage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Container size="xl" mt="xl">
      <Title order={1} mb="md">Select a Patient</Title>
      <SearchControl
        search={{ resourceType: 'Patient', fields: ['name', 'birthdate', 'gender'] }}
        onClick={(e) => {
          const patient = e.resource as Patient;
          sessionStorage.setItem('smart_patient', patient.id as string);
          navigate('/patient')?.catch(console.error);
        }}
        hideToolbar
      />
    </Container>
  );
}
