import { Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { calculateAgeString, formatDate, formatDateTime, formatHumanName } from '@medplum/core';
import { Bundle, Condition, HumanName, Observation, Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, useMedplum } from '@medplum/react';
import { ChartData } from 'chart.js';
import { JSX, useEffect, useState } from 'react';
import { LineChart } from '../components/LineChart';

function getConditionName(condition: Condition): string {
  return condition.code?.text ?? condition.code?.coding?.[0]?.display ?? 'Unknown condition';
}

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient>();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>();
  const [bpReadings, setBpReadings] = useState<Observation[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [latestWeight, setLatestWeight] = useState<Observation>();
  const [latestBmi, setLatestBmi] = useState<Observation>();

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        const token = sessionStorage.getItem('smart_access_token');
        const fhirBaseUrl = sessionStorage.getItem('smart_fhir_base_url');
        const patientId = sessionStorage.getItem('smart_patient');

        if (!token || !fhirBaseUrl || !patientId) {
          throw new Error('No authentication data found. Please launch the app again.');
        }

        const isMedplum = fhirBaseUrl.includes('medplum.com');

        if (isMedplum) {
          // Medplum flow: use the SDK client (token already set via setAccessToken in LaunchPage).
          // BP is stored as panel observations identified by component-code 8480-6 (systolic).
          const [patientData, bpData, conditionData, weightData, bmiData] = await Promise.all([
            medplum.readResource('Patient', patientId),
            medplum.searchResources('Observation', {
              subject: `Patient/${patientId}`,
              'component-code': '8480-6',
              _sort: 'date',
              _count: '10',
            }),
            medplum.searchResources('Condition', {
              subject: `Patient/${patientId}`,
              _count: '20',
            }),
            medplum.searchResources('Observation', {
              subject: `Patient/${patientId}`,
              code: '29463-7',
              _sort: '-date',
              _count: '1',
            }),
            medplum.searchResources('Observation', {
              subject: `Patient/${patientId}`,
              code: '39156-5',
              _sort: '-date',
              _count: '1',
            }),
          ]);

          setPatient(patientData);
          setBpReadings(bpData);
          setConditions(conditionData);
          setLatestWeight(weightData[0]);
          setLatestBmi(bmiData[0]);
        } else {
          // Sandbox flow: raw fetch with Bearer token.
          // BP is stored as panel observations (55284-4) with systolic/diastolic components.
          const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/fhir+json',
          };

          const patientResponse = await fetch(`${fhirBaseUrl}/Patient/${patientId}`, { headers });
          if (!patientResponse.ok) {
            throw new Error('Failed to fetch patient');
          }
          setPatient(await patientResponse.json());

          // Fetch blood pressure panel readings sorted oldest→newest for the chart.
          // Synthea (used by SMART Health IT sandbox) codes BP panels as 55284-4.
          const bpParams = new URLSearchParams({
            subject: `Patient/${patientId}`,
            code: '55284-4',
            _sort: 'date',
            _count: '10',
          });
          const bpResponse = await fetch(`${fhirBaseUrl}/Observation?${bpParams}`, { headers });
          if (!bpResponse.ok) {
            throw new Error('Failed to fetch blood pressure readings');
          }
          const bpBundle: Bundle<Observation> = await bpResponse.json();
          setBpReadings((bpBundle.entry ?? []).map((e) => e.resource as Observation));

          // Fetch active conditions for risk factors
          const conditionParams = new URLSearchParams({
            subject: `Patient/${patientId}`,
            _count: '20',
          });
          const conditionResponse = await fetch(`${fhirBaseUrl}/Condition?${conditionParams}`, { headers });
          if (conditionResponse.ok) {
            const conditionBundle: Bundle<Condition> = await conditionResponse.json();
            setConditions((conditionBundle.entry ?? []).map((e) => e.resource as Condition));
          }

          // Fetch latest weight (LOINC 29463-7)
          const weightParams = new URLSearchParams({
            subject: `Patient/${patientId}`,
            code: '29463-7',
            _sort: '-date',
            _count: '1',
          });
          const weightResponse = await fetch(`${fhirBaseUrl}/Observation?${weightParams}`, { headers });
          if (weightResponse.ok) {
            const weightBundle: Bundle<Observation> = await weightResponse.json();
            setLatestWeight(weightBundle.entry?.[0]?.resource as Observation | undefined);
          }

          // Fetch latest BMI (LOINC 39156-5)
          const bmiParams = new URLSearchParams({
            subject: `Patient/${patientId}`,
            code: '39156-5',
            _sort: '-date',
            _count: '1',
          });
          const bmiResponse = await fetch(`${fhirBaseUrl}/Observation?${bmiParams}`, { headers });
          if (bmiResponse.ok) {
            const bmiBundle: Bundle<Observation> = await bmiResponse.json();
            setLatestBmi(bmiBundle.entry?.[0]?.resource as Observation | undefined);
          }
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    fetchData().catch(console.error);
  }, [medplum]);

  const getBpChartData = (): ChartData<'line', number[]> => {
    const dates = bpReadings.map((obs) => formatDate(obs.effectiveDateTime as string));
    const systolicData = bpReadings.map((obs) => {
      const systolic = obs.component?.find((c) => c.code?.coding?.[0].code === '8480-6');
      return Math.round(systolic?.valueQuantity?.value ?? 0);
    });
    const diastolicData = bpReadings.map((obs) => {
      const diastolic = obs.component?.find((c) => c.code?.coding?.[0].code === '8462-4');
      return Math.round(diastolic?.valueQuantity?.value ?? 0);
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

  const lastBp = bpReadings[bpReadings.length - 1];
  const lastBpSystolic = lastBp?.component?.find((c) => c.code?.coding?.[0]?.code === '8480-6')?.valueQuantity?.value;
  const lastBpDiastolic = lastBp?.component?.find((c) => c.code?.coding?.[0]?.code === '8462-4')?.valueQuantity?.value;
  const lastBpDisplay =
    lastBpSystolic !== undefined && lastBpDiastolic !== undefined
      ? `${Math.round(lastBpSystolic)}/${Math.round(lastBpDiastolic)} mmHg`
      : '—';

  const weightValue = latestWeight?.valueQuantity?.value;
  const weightUnit = latestWeight?.valueQuantity?.unit ?? 'kg';
  const weightDisplay = weightValue !== undefined ? `${Math.round(weightValue * 10) / 10} ${weightUnit}` : '—';

  const bmiValue = latestBmi?.valueQuantity?.value;
  const bmiUnit = latestBmi?.valueQuantity?.unit ?? 'kg/m²';
  const bmiDisplay = bmiValue !== undefined ? `${Math.round(bmiValue * 10) / 10} ${bmiUnit}` : '—';

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
            <Title order={2}>Risk Factors</Title>
            {conditions.length > 0 ? (
              <Stack gap="xs">
                {conditions.map((c, i) => (
                  <Text key={i}>• {getConditionName(c)}</Text>
                ))}
              </Stack>
            ) : (
              <Text c="dimmed">No conditions on record</Text>
            )}
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={2}>Latest Vitals</Title>
            <Group grow>
              <Stack>
                <Text c="dimmed">Last BP</Text>
                <Text fw={500}>{lastBpDisplay}</Text>
                {lastBp?.effectiveDateTime && (
                  <Text size="sm" c="dimmed">
                    {formatDateTime(lastBp.effectiveDateTime)}
                  </Text>
                )}
              </Stack>
              <Stack>
                <Text c="dimmed">BMI</Text>
                <Text fw={500}>{bmiDisplay}</Text>
                {latestBmi?.effectiveDateTime && (
                  <Text size="sm" c="dimmed">
                    {formatDateTime(latestBmi.effectiveDateTime)}
                  </Text>
                )}
              </Stack>
              <Stack>
                <Text c="dimmed">Weight</Text>
                <Text fw={500}>{weightDisplay}</Text>
                {latestWeight?.effectiveDateTime && (
                  <Text size="sm" c="dimmed">
                    {formatDateTime(latestWeight.effectiveDateTime)}
                  </Text>
                )}
              </Stack>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
