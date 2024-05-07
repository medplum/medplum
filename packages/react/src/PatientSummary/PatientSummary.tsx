import { Card, CardProps, Divider, Flex, Group, Paper, Stack, Text } from '@mantine/core';
import { calculateAgeString, formatHumanName, resolveId } from '@medplum/core';
import {
  AllergyIntolerance,
  Appointment,
  Condition,
  Encounter,
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
import { MedplumLink } from '../MedplumLink/MedplumLink';

export interface PatientSummaryProps extends Omit<CardProps, 'children'> {
  readonly patient: Patient | Reference<Patient>;
  readonly background?: string;
  /** The URL that the upcoming appointments link should navigate to or `undefined` to not show the link. */
  readonly appointmentsUrl?: string | undefined;
  /** The URL that the documented visits (encounters) link should navigate to or `undefined` to not show the link. */
  readonly encountersUrl?: string | undefined;
}

interface PatientMedicalData {
  readonly allergies: AllergyIntolerance[];
  readonly problems: Condition[];
  readonly sexualOrientation?: Observation;
  readonly smokingStatus?: Observation;
  readonly vitals: Observation[];
  readonly medicationRequests: MedicationRequest[];
  readonly encounters?: Encounter[];
  readonly appointments?: Appointment[];
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

function pluralize(count: number | undefined, singular: string, plural: string): string {
  if (count === 0) {
    return `No ${plural}`;
  } else if (count === 1) {
    return `1 ${singular}`;
  } else {
    return `${count} ${plural}`;
  }
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const {
    patient: propsPatient,
    background,
    appointmentsUrl: propsAppointmentsUrl,
    encountersUrl: propsEncountersUrl,
    ...cardProps
  } = props;
  const patient = useResource(propsPatient);
  const [medicalData, setMedicalData] = useState<PatientMedicalData>();

  // If a URL is explicitly specified in `props`, use it even if `undefined`.
  // If not included in `props`, use '#' as a demonstration value.
  const appointmentsUrl = 'appointmentsUrl' in props ? propsAppointmentsUrl : '#';
  const encountersUrl = 'encountersUrl' in props ? propsEncountersUrl : '#';

  useEffect(() => {
    const id = resolveId(propsPatient) as string;
    const ref = `Patient/${id}`;
    const searchMeta = { _count: 100, _sort: '-_lastUpdated' };
    const today = new Date().toISOString().substring(0, 10);

    Promise.all([
      medplum.searchResources('AllergyIntolerance', { patient: ref, ...searchMeta }),
      medplum.searchResources('Condition', { patient: ref, ...searchMeta }),
      medplum.searchResources('MedicationRequest', { subject: ref, ...searchMeta }),
      medplum.searchResources('Observation', { subject: ref, ...searchMeta }),
      medplum.searchResources('Appointment', {
        patient: ref,
        date: `ge${today}`,
        status: 'proposed,pending,booked',
        ...searchMeta,
      }),
      medplum.searchResources('Encounter', { subject: ref, date: `le${today}`, status: 'finished', ...searchMeta }),
    ])
      .then((results) => {
        const observations = results[3];
        setMedicalData({
          allergies: results[0],
          problems: results[1],
          medicationRequests: results[2],
          sexualOrientation: observations.find((obs) => obs.code?.coding?.[0].code === '76690-7'),
          smokingStatus: observations.find((obs) => obs.code?.coding?.[0].code === '72166-2'),
          vitals: observations.filter((obs) => obs.category?.[0]?.coding?.[0].code === 'vital-signs'),
          appointments: results[4],
          encounters: results[5],
        });
      })
      .catch(console.error);
  }, [medplum, propsPatient]);

  const links: ReactNode[] = useMemo(() => {
    const appointmentsLink =
      appointmentsUrl === undefined ? undefined : (
        <MedplumLink key="appt" to={appointmentsUrl}>
          {pluralize(medicalData?.appointments?.length, 'upcoming appointment', 'upcoming appointments')}
        </MedplumLink>
      );
    const encountersLink =
      encountersUrl === undefined ? undefined : (
        <MedplumLink key="enc" to={encountersUrl}>
          {pluralize(medicalData?.encounters?.length, 'documented visit', 'documented visits')}
        </MedplumLink>
      );

    return [appointmentsLink, encountersLink].filter(Boolean);
  }, [appointmentsUrl, medicalData?.appointments?.length, medicalData?.encounters?.length, encountersUrl]);

  if (!patient) {
    return null;
  }

  const GenderIconComponent = getGenderIcon(patient);

  return (
    <Card {...cardProps}>
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
        {links.length > 0 && (
          <>
            {links}
            <Divider />
          </>
        )}
        {medicalData && (
          <>
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
