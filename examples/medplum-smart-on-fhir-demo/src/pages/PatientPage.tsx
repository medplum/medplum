import { Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { calculateAgeString, formatDate, formatDateTime, formatHumanName } from '@medplum/core';
import { HumanName, Observation, Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, useMedplum } from '@medplum/react';
import { ChartData } from 'chart.js';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart } from '../components/LineChart';

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient>();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>();
  const [bpReadings, setBpReadings] = useState<Observation[]>([]);

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        const patientId = sessionStorage.getItem('smart_patient');

        if (!medplum.getAccessToken() || !patientId) {
          throw new Error('No authentication token or patient ID found');
        }

        const patient = await medplum.readResource('Patient', patientId);
        setPatient(patient);

        // Fetch blood pressure readings
        const bpObservations = await medplum.searchResources('Observation', {
          subject: `Patient/${patientId}`,
          code: '85354-9', // LOINC code for blood pressure panel
          _sort: '-date',
          _count: '10',
        });
        setBpReadings(bpObservations);

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    fetchData().catch((err) => {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    });
  }, [navigate, medplum]);

  const getBpChartData = (): ChartData<'line', number[]> => {
    const dates = bpReadings.map((obs) => formatDate(obs.effectiveDateTime as string));
    const systolicData = bpReadings.map((obs) => {
      const systolic = obs.component?.find((c) => c.code?.coding?.[0].code === '8480-6');
      return systolic?.valueQuantity?.value ?? 0;
    });
    const diastolicData = bpReadings.map((obs) => {
      const diastolic = obs.component?.find((c) => c.code?.coding?.[0].code === '8462-4');
      return diastolic?.valueQuantity?.value ?? 0;
    });

    return {
      labels: dates,
      datasets: [
        {
          label: 'Systolic',
          data: systolicData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
        },
        {
          label: 'Diastolic',
          data: diastolicData,
          borderColor: 'rgb(53, 162, 235)',
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
        },
      ],
    };
  };

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
    <Container size="xl" mt="xl">
      <Stack>
        <Paper p="md">
          <ResourceAvatar
            value={patient}
            size={80}
            radius={80}
            mx="auto"
            mt={-50}
            style={{ border: '2px solid white' }}
          />
          <Text ta="center" fz="lg" fw={500}>
            {formatHumanName(patient.name?.[0] as HumanName)}
          </Text>
          {patient.birthDate && (
            <Text ta="center" fz="xs" c="dimmed">
              {patient.birthDate} ({calculateAgeString(patient.birthDate)})
            </Text>
          )}
        </Paper>
        <Paper p="md" withBorder>
          <Stack>
            <Title order={2}>Blood Pressure Trends</Title>
            {bpReadings.length > 0 ? (
              <LineChart chartData={getBpChartData()} />
            ) : (
              <Text c="dimmed">No blood pressure readings available</Text>
            )}
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={2}>Cardiac Risk Assessment</Title>
            <Group>
              <Paper p="md" withBorder style={{ flex: 1 }}>
                <Stack align="center">
                  <Title order={3}>10-Year ASCVD Risk</Title>
                  <Text size="xl" fw={700} style={{ color: 'rgb(255, 99, 132)' }}>
                    7.2%
                  </Text>
                  <Text size="sm" c="dimmed">
                    Based on ACC/AHA Guidelines
                  </Text>
                </Stack>
              </Paper>
              <Paper p="md" withBorder style={{ flex: 1 }}>
                <Stack align="center">
                  <Title order={3}>Risk Factors</Title>
                  <Stack gap="xs">
                    <Text>• High Blood Pressure</Text>
                    <Text>• High Cholesterol</Text>
                    <Text>• Family History</Text>
                  </Stack>
                </Stack>
              </Paper>
            </Group>
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={2}>Latest Vitals</Title>
            <Group grow>
              <Stack>
                <Text c="dimmed">Last BP</Text>
                <Text fw={500}>
                  {bpReadings[0]?.component
                    ?.map((c) => c.valueQuantity?.value)
                    .filter(Boolean)
                    .join('/')}{' '}
                  mmHg
                </Text>
                <Text size="sm" c="dimmed">
                  {formatDateTime(bpReadings[0]?.effectiveDateTime as string)}
                </Text>
              </Stack>
              <Stack>
                <Text c="dimmed">Heart Rate</Text>
                <Text fw={500}>72 bpm</Text>
                <Text size="sm" c="dimmed">
                  Today
                </Text>
              </Stack>
              <Stack>
                <Text c="dimmed">Weight</Text>
                <Text fw={500}>180 lbs</Text>
                <Text size="sm" c="dimmed">
                  2 days ago
                </Text>
              </Stack>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
