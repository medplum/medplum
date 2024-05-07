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
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconGenderFemale, IconGenderMale, IconStethoscope, IconUserSquare } from '@tabler/icons-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { Allergies } from './Allergies';
import { Medications } from './Medications';
import { ProblemList } from './ProblemList';
import { SexualOrientation } from './SexualOrientation';
import { SmokingStatus } from './SmokingStatus';
import { Vitals } from './Vitals';

export interface PatientSummaryProps extends Omit<CardProps, 'children'> {
  readonly patient: Patient | Reference<Patient>;
  readonly background?: string;
  readonly topContent?: ReactNode;
}

interface PatientMedicalData {
  readonly allergies: AllergyIntolerance[];
  readonly problems: Condition[];
  readonly sexualOrientation?: Observation;
  readonly smokingStatus?: Observation;
  readonly vitals: Observation[];
  readonly medicationRequests: MedicationRequest[];
}

type IconType = typeof IconGenderFemale;

function getGenderIcon(patient?: Patient): IconType | undefined {
  switch (patient?.gender) {
    case 'female':
      return IconGenderFemale;
    case 'male':
      return IconGenderMale;
    default:
      return undefined;
  }
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const { patient: propsPatient, background, topContent, ...rest } = props;
  const patient = useResource(propsPatient);
  const [medicalData, setMedicalData] = useState<PatientMedicalData>();

  useEffect(() => {
    const id = resolveId(propsPatient) as string;
    const ref = `Patient/${id}`;
    const searchMeta = { _count: 100, _sort: '-_lastUpdated' };

    Promise.all([
      medplum.searchResources('AllergyIntolerance', { patient: ref, ...searchMeta }),
      medplum.searchResources('Condition', { patient: ref, ...searchMeta }),
      medplum.searchResources('MedicationRequest', { subject: ref, ...searchMeta }),
      medplum.searchResources('Observation', { subject: ref, ...searchMeta }),
    ])
      .then((results) => {
        const observations = results[3];
        setMedicalData({
          allergies: results[0] as AllergyIntolerance[],
          problems: results[1] as Condition[],
          medicationRequests: results[2] as MedicationRequest[],
          sexualOrientation: observations.find((obs) => obs.code?.coding?.[0].code === '76690-7'),
          smokingStatus: observations.find((obs) => obs.code?.coding?.[0].code === '72166-2'),
          vitals: observations.filter((obs) => obs.category?.[0]?.coding?.[0].code === 'vital-signs'),
        });
      })
      .catch(console.error);
  }, [medplum, propsPatient]);

  const topContentWithFallback = useMemo(() => {
    return (
      topContent ?? (
        <>
          <Anchor href="#">No upcoming appointments</Anchor>
          <Anchor href="#">No documented visits</Anchor>
        </>
      )
    );
  }, [topContent]);

  if (!patient) {
    return null;
  }

  const GenderIconComponent = getGenderIcon(patient);

  return (
    <Card {...rest}>
      <Card.Section h={100} style={{ background }} />
      <ResourceAvatar value={patient} size={80} radius={80} mx="auto" mt={-50} style={{ border: '2px solid white' }} />
      <Text ta="center" fz="lg" fw={500}>
        {formatHumanName(patient.name?.[0] as HumanName)}
      </Text>
      {patient.birthDate && (
        <Text ta="center" fz="xs" c="dimmed">
          {patient.birthDate} ({calculateAgeString(patient.birthDate)})
        </Text>
      )}
      <Paper withBorder p="md" my="md">
        <Group wrap="nowrap" justify="space-evenly">
          <Flex justify="center" align="center" direction="column" gap={0}>
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
          {GenderIconComponent && (
            <Flex justify="center" align="center" direction="column" gap={0}>
              <GenderIconComponent size={24} color="gray" />
              <Text fz="xs" style={{ whiteSpace: 'nowrap' }}>
                {patient.gender}
              </Text>
            </Flex>
          )}
        </Group>
      </Paper>
      <Stack gap="xs">
        {topContentWithFallback}
        {medicalData && (
          <>
            <Divider />
            <Allergies patient={patient} allergies={medicalData.allergies} />
            <Divider />
            <ProblemList patient={patient} problems={medicalData.problems} />
            <Divider />
            <Medications patient={patient} medicationRequests={medicalData.medicationRequests} />
            <Divider />
            <SexualOrientation patient={patient} sexualOrientation={medicalData.sexualOrientation} />
            <Divider />
            <SmokingStatus patient={patient} smokingStatus={medicalData.smokingStatus} />
            <Divider />
            <Vitals patient={patient} vitals={medicalData.vitals} />
          </>
        )}
      </Stack>
    </Card>
  );
}
