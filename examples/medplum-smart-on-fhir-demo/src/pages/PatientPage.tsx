// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Badge, Container, Divider, Group, Loader, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { calculateAgeString, formatDate, formatHumanName } from '@medplum/core';
import type { Bundle, Condition, HumanName, Observation, Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, useMedplum } from '@medplum/react';
import { IconArrowLeft } from '@tabler/icons-react';
import type { ChartData } from 'chart.js';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { LineChart } from '../components/LineChart';
import classes from './PatientPage.module.css';

function getConditionName(condition: Condition): string {
  return condition.code?.text ?? condition.code?.coding?.[0]?.display ?? 'Unknown condition';
}

function classifyBp(systolic: number, diastolic: number): { label: string; color: string } {
  if (systolic >= 140 || diastolic >= 90) {
    return { label: 'Stage 2', color: 'red' };
  }
  if (systolic >= 130 || diastolic >= 80) {
    return { label: 'Stage 1', color: 'orange' };
  }
  if (systolic >= 120 && diastolic < 80) {
    return { label: 'Elevated', color: 'yellow' };
  }
  return { label: 'Normal', color: 'green' };
}

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [bpReadings, setBpReadings] = useState<Observation[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [latestWeight, setLatestWeight] = useState<Observation>();
  const [latestBmi, setLatestBmi] = useState<Observation>();
  const [isMedplumFlow, setIsMedplumFlow] = useState(false);

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        const token = sessionStorage.getItem('smart_access_token');
        const fhirBaseUrl = sessionStorage.getItem('smart_fhir_base_url');
        const patientId = sessionStorage.getItem('smart_patient');

        if (!token || !fhirBaseUrl || !patientId) {
          throw new Error('No authentication data found. Please launch the app again.');
        }

        const fhirHostname = new URL(fhirBaseUrl).hostname;
        const isMedplum = fhirHostname === 'medplum.com' || fhirHostname.endsWith('.medplum.com');
        setIsMedplumFlow(isMedplum);

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
            setLatestWeight(weightBundle.entry?.[0]?.resource);
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
            setLatestBmi(bmiBundle.entry?.[0]?.resource);
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
      const systolic = obs.component?.find((c) => c.code?.coding?.[0]?.code === '8480-6');
      return Math.round(systolic?.valueQuantity?.value ?? 0);
    });
    const diastolicData = bpReadings.map((obs) => {
      const diastolic = obs.component?.find((c) => c.code?.coding?.[0]?.code === '8462-4');
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

  const weightValue = latestWeight?.valueQuantity?.value;
  const weightUnit = latestWeight?.valueQuantity?.unit ?? 'kg';

  const bmiValue = latestBmi?.valueQuantity?.value;
  const bmiUnit = latestBmi?.valueQuantity?.unit ?? 'kg/m²';

  const patientName = formatHumanName(patient.name?.[0] as HumanName);
  const gender = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : undefined;

  return (
    <Container size="lg" my="xl">
      <Stack gap="md">
        {/* Back link — only available in Medplum flow which has an in-app patient picker */}
        {isMedplumFlow && (
          <Anchor
            onClick={() => navigate('/select-patient')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <IconArrowLeft size={16} />
            Back to patients
          </Anchor>
        )}

        {/* Patient header */}
        <Paper p="lg" radius="md" withBorder className={classes.header}>
          <Group gap="md" align="flex-start">
            <ResourceAvatar value={patient} size={56} radius={56} />
            <Stack gap={4}>
              <Group gap="xs" align="center">
                <Title order={2} fw={700}>
                  {patientName}
                </Title>
                {gender && (
                  <Badge variant="light" color="blue" size="sm">
                    {gender}
                  </Badge>
                )}
              </Group>
              {patient.birthDate && (
                <Text size="sm" c="dimmed">
                  DOB: {formatDate(patient.birthDate)} &middot; Age: {calculateAgeString(patient.birthDate)}
                </Text>
              )}
            </Stack>
          </Group>
        </Paper>

        {/* Vitals summary */}
        <div className={classes.vitalsGrid}>
          <Paper p="lg" radius="md" withBorder className={classes.vitalCard}>
            <Text className={classes.vitalLabel}>Blood Pressure</Text>
            <Text className={classes.vitalValue}>
              {lastBpSystolic !== undefined && lastBpDiastolic !== undefined
                ? `${Math.round(lastBpSystolic)}/${Math.round(lastBpDiastolic)}`
                : '—'}
            </Text>
            <Text className={classes.vitalUnit}>mmHg</Text>
            {lastBp?.effectiveDateTime && (
              <Text size="xs" c="dimmed" mt={4}>
                {formatDate(lastBp.effectiveDateTime)}
              </Text>
            )}
          </Paper>
          <Paper p="lg" radius="md" withBorder className={classes.vitalCard}>
            <Text className={classes.vitalLabel}>Weight</Text>
            <Text className={classes.vitalValue}>
              {weightValue !== undefined ? `${Math.round(weightValue * 10) / 10}` : '—'}
            </Text>
            <Text className={classes.vitalUnit}>{weightUnit}</Text>
            {latestWeight?.effectiveDateTime && (
              <Text size="xs" c="dimmed" mt={4}>
                {formatDate(latestWeight.effectiveDateTime)}
              </Text>
            )}
          </Paper>
          <Paper p="lg" radius="md" withBorder className={classes.vitalCard}>
            <Text className={classes.vitalLabel}>BMI</Text>
            <Text className={classes.vitalValue}>
              {bmiValue !== undefined ? `${Math.round(bmiValue * 10) / 10}` : '—'}
            </Text>
            <Text className={classes.vitalUnit}>{bmiUnit}</Text>
            {latestBmi?.effectiveDateTime && (
              <Text size="xs" c="dimmed" mt={4}>
                {formatDate(latestBmi.effectiveDateTime)}
              </Text>
            )}
          </Paper>
        </div>

        {/* Blood pressure trends */}
        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Blood Pressure Trends</Title>
            {bpReadings.length > 0 ? (
              <>
                <LineChart chartData={getBpChartData()} />
                <Divider />
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Systolic (mmHg)</Table.Th>
                      <Table.Th>Diastolic (mmHg)</Table.Th>
                      <Table.Th>Classification</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {[...bpReadings].reverse().map((obs, i) => {
                      const sys = obs.component?.find((c) => c.code?.coding?.[0]?.code === '8480-6')?.valueQuantity
                        ?.value;
                      const dia = obs.component?.find((c) => c.code?.coding?.[0]?.code === '8462-4')?.valueQuantity
                        ?.value;
                      const classification =
                        sys !== undefined && dia !== undefined ? classifyBp(Math.round(sys), Math.round(dia)) : null;
                      return (
                        <Table.Tr key={i}>
                          <Table.Td>{obs.effectiveDateTime ? formatDate(obs.effectiveDateTime) : '—'}</Table.Td>
                          <Table.Td>{sys !== undefined ? Math.round(sys) : '—'}</Table.Td>
                          <Table.Td>{dia !== undefined ? Math.round(dia) : '—'}</Table.Td>
                          <Table.Td>
                            {classification && (
                              <Badge color={classification.color} variant="light" size="sm">
                                {classification.label}
                              </Badge>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </>
            ) : (
              <Text c="dimmed">No blood pressure readings available</Text>
            )}
          </Stack>
        </Paper>

        {/* Active conditions */}
        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Active Conditions</Title>
            {conditions.length > 0 ? (
              <Stack gap={0}>
                {conditions.map((c, i) => (
                  <div key={i}>
                    {i > 0 && <Divider />}
                    <Group justify="space-between" py="sm">
                      <Group gap="sm">
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: 'var(--mantine-color-blue-5)',
                            flexShrink: 0,
                          }}
                        />
                        <Text size="sm">{getConditionName(c)}</Text>
                      </Group>
                      <Badge variant="light" color="green" size="sm">
                        Active
                      </Badge>
                    </Group>
                  </div>
                ))}
              </Stack>
            ) : (
              <Text c="dimmed">No conditions on record</Text>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
