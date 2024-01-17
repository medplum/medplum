import { Anchor, Card, CardProps, Divider, Flex, Group, Paper, Stack, Text } from '@mantine/core';
import { calculateAgeString, formatHumanName, resolveId } from '@medplum/core';
import {
  AllergyIntolerance,
  Condition,
  HumanName,
  MedicationRequest,
  Observation,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconGenderFemale, IconStethoscope, IconUserSquare } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { Allergies } from './Allergies';
import { Medications } from './Medications';
import { ProblemList } from './ProblemList';
import { SmokingStatus } from './SmokingStatus';
import { Vitals } from './Vitals';

export interface PatientSummaryProps extends Omit<CardProps, 'children'> {
  readonly patient: Patient | Reference<Patient>;
  readonly background?: string;
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const { patient: propsPatient, background, ...rest } = props;
  const [patient, setPatient] = useState<Patient>();
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>();
  const [problems, setProblems] = useState<Condition[]>();
  const [smokingStatus, setSmokingStatus] = useState<Observation>();
  const [vitals, setVitals] = useState<Observation[]>();
  const [medicationRequest, setMedicationRequest] = useState<MedicationRequest[]>();

  useEffect(() => {
    const id = resolveId(propsPatient) as string;
    const ref = `Patient/${id}`;
    const searchMeta = { _count: 100, _sort: '-_lastUpdated' };

    Promise.all([
      medplum.readResource('Patient', id),
      medplum.searchResources('AllergyIntolerance', { patient: ref, ...searchMeta }),
      medplum.searchResources('Condition', { patient: ref, ...searchMeta }),
      medplum.searchResources('MedicationRequest', { subject: ref, ...searchMeta }),
      medplum.searchResources('Observation', { subject: ref, ...searchMeta }),
    ])
      .then((results) => {
        setPatient(results[0] as Patient);
        setAllergies(results[1] as AllergyIntolerance[]);
        setProblems(results[2] as Condition[]);
        setMedicationRequest(results[3] as MedicationRequest[]);

        const observations = results[4] as Observation[];
        setSmokingStatus(observations.find((obs) => obs.code?.coding?.[0].code === '72166-2'));
        setVitals(observations.filter((obs) => obs.category?.[0]?.coding?.[0].code === 'vital-signs'));
      })
      .catch(console.error);
  }, [medplum, propsPatient]);

  if (!patient) {
    return null;
  }

  return (
    <Card {...rest}>
      <Card.Section h={100} style={{ background }} />
      <ResourceAvatar value={patient} size={80} radius={80} mx="auto" mt={-50} style={{ border: '2px solid white' }} />
      <Text ta="center" fz="lg" fw={500}>
        {formatHumanName(patient.name?.[0] as HumanName)}
      </Text>
      <Text ta="center" fz="xs" color="dimmed">
        {patient.birthDate} ({calculateAgeString(patient.birthDate as string)})
      </Text>
      <Paper withBorder p="md" my="md">
        <Group grow>
          <Flex justify="center" align="center" direction="column" gap={0} maw="33%">
            <IconUserSquare size={24} color="gray" />
            <Text fz="xs" ta="center" style={{ whiteSpace: 'nowrap' }}>
              Self
            </Text>
          </Flex>
          <Flex justify="center" align="center" direction="column" gap={0}>
            <IconStethoscope size={24} color="gray" />
            <Text fz="xs" style={{ whiteSpace: 'nowrap' }}>
              {patient?.generalPractitioner?.[0]?.display ?? 'No provider'}
            </Text>
          </Flex>
          <Flex justify="center" align="center" direction="column" gap={0}>
            <IconGenderFemale size={24} color="gray" />
            <Text fz="xs" style={{ whiteSpace: 'nowrap' }}>
              {patient.gender}
            </Text>
          </Flex>
        </Group>
      </Paper>
      <Stack gap="xs">
        <Anchor href="#">No upcoming appointments</Anchor>
        <Anchor href="#">No documented visits</Anchor>
        <Divider />
        <Allergies patient={patient} allergies={allergies as AllergyIntolerance[]} />
        <Divider />
        <ProblemList patient={patient} problems={problems as Condition[]} />
        <Divider />
        <Medications patient={patient} medicationRequests={medicationRequest as MedicationRequest[]} />
        <Divider />
        <SmokingStatus patient={patient} smokingStatus={smokingStatus} />
        <Divider />
        <Vitals patient={patient} vitals={vitals as Observation[]} />
      </Stack>
    </Card>
  );
}
