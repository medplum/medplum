import { Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient>();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const fetchPatient = async (): Promise<void> => {
      try {
        const patientId = sessionStorage.getItem('smart_patient');

        if (!medplum.getAccessToken() || !patientId) {
          throw new Error('No authentication token or patient ID found');
        }

        const patient = await medplum.readResource('Patient', patientId);
        setPatient(patient);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    fetchPatient().catch((err) => {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    });
  }, [navigate, medplum]);

  if (loading) {
    return (
      <Container>
        <Loader size="xl" mt="xl" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Text c="red" ta="center" mt="xl">
          Error: {error}
        </Text>
      </Container>
    );
  }

  if (!patient) {
    return (
      <Container>
        <Text ta="center" mt="xl">
          No patient found
        </Text>
      </Container>
    );
  }

  return (
    <Container size="md" mt="xl">
      <Stack>
        <Title order={1}>Patient Information</Title>
        <Paper p="md" withBorder>
          <Stack>
            <Group>
              <Text fw={500}>Name:</Text>
              <Text>
                {patient.name?.[0]?.given?.join(' ')} {patient.name?.[0]?.family}
              </Text>
            </Group>
            <Group>
              <Text fw={500}>Birth Date:</Text>
              <Text>{patient.birthDate}</Text>
            </Group>
            <Group>
              <Text fw={500}>Gender:</Text>
              <Text>{patient.gender}</Text>
            </Group>
            {patient.address?.[0] && (
              <Group>
                <Text fw={500}>Address:</Text>
                <Text>
                  {patient.address[0].line?.join(', ')}, {patient.address[0].city}, {patient.address[0].state}{' '}
                  {patient.address[0].postalCode}
                </Text>
              </Group>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
