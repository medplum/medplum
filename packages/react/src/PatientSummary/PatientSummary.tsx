import { Anchor, Card, CardProps, Divider, Flex, Group, Paper, Stack, Text } from '@mantine/core';
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
import { Fragment, ReactNode, useEffect, useMemo, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { Allergies } from './Allergies';
import { Medications } from './Medications';
import { ProblemList } from './ProblemList';
import { SexualOrientation } from './SexualOrientation';
import { SmokingStatus } from './SmokingStatus';
import { Vitals } from './Vitals';

type LinkRenderer = (msg: string) => ReactNode;

export interface PatientSummaryProps extends Omit<CardProps, 'children'> {
  readonly patient: Patient | Reference<Patient>;
  readonly background?: string;
  readonly linkRenderers?: {
    appointments?: LinkRenderer;
    encounters?: LinkRenderer;
  };
}

const defaultLinkRenderer: LinkRenderer = (msg: string) => <Anchor href="#">{msg}</Anchor>;

interface PatientMedicalData {
  readonly allergies: AllergyIntolerance[];
  readonly problems: Condition[];
  readonly sexualOrientation?: Observation;
  readonly smokingStatus?: Observation;
  readonly vitals: Observation[];
  readonly medicationRequests: MedicationRequest[];
  readonly encounters?: Encounter[];
  readonly upcomingAppointments?: Appointment[];
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
  const { patient: propsPatient, background, linkRenderers, ...cardProps } = props;
  const patient = useResource(propsPatient);
  const [medicalData, setMedicalData] = useState<PatientMedicalData>();

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
          upcomingAppointments: results[4],
          encounters: results[5],
        });
      })
      .catch(console.error);
  }, [medplum, propsPatient]);

  const linksContent: ReactNode[] = useMemo(() => {
    const appointmentsLink = (linkRenderers?.appointments ?? defaultLinkRenderer)(
      pluralize(medicalData?.upcomingAppointments?.length, 'upcoming appointment', 'upcoming appointments')
    );
    const encountersLink = (linkRenderers?.encounters ?? defaultLinkRenderer)(
      pluralize(medicalData?.encounters?.length, 'documented visit', 'documented visits')
    );

    return [
      appointmentsLink ? <Fragment key="appt">{appointmentsLink}</Fragment> : undefined,
      encountersLink ? <Fragment key="enc">{encountersLink}</Fragment> : undefined,
    ].filter(Boolean);
  }, [
    linkRenderers?.appointments,
    linkRenderers?.encounters,
    medicalData?.upcomingAppointments?.length,
    medicalData?.encounters?.length,
  ]);

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
        {linksContent.length > 0 && (
          <>
            {linksContent}
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
