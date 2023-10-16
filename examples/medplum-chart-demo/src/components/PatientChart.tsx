import { Anchor, Avatar, Card, Divider, Flex, Group, Paper, Stack, Text } from '@mantine/core';
import { calculateAgeString, formatHumanName } from '@medplum/core';
import { AllergyIntolerance, Condition, HumanName, Observation, Patient, Resource } from '@medplum/fhirtypes';
import { useMedplum, ResourceAvatar, useResource } from '@medplum/react';
import { IconGenderFemale, IconStethoscope, IconUserSquare } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Allergies } from './Allergies';
import { ProblemList } from './ProblemList';
import { SmokingStatus } from './SmokingStatus';
import { Vitals } from './Vitals';

export function PatientChart(): JSX.Element | null {
  const { id } = useParams();
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient>();
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>();
  const [problems, setProblems] = useState<Condition[]>();
  const [smokingStatus, setSmokingStatus] = useState<Observation>();
  const [vitals, setVitals] = useState<Observation[]>();

  useEffect(() => {
    const query = `{
      Patient(id: "${id}") {
        resourceType,
        id,
        birthDate,
        gender,
        generalPractitioner { reference },
        name { given, family },
        address { line, city, state }
        photo { contentType, url, title },
        AllergyIntoleranceList(_reference: patient, _count: 100, _sort: "-_lastUpdated") {
          id,
          meta { lastUpdated },
          code { coding { code, display } },
          criticality
        }
        ConditionList(_reference: patient, _count: 100, _sort: "-_lastUpdated") {
          id,
          meta { lastUpdated },
          category { coding { code } },
          clinicalStatus { coding { display } },
          code { coding { display } },
          onsetDateTime
        }
        ObservationList(_reference: subject, _count: 100, _sort: "-_lastUpdated") {
          id,
          category { coding { code } },
          code { coding { code, system, display } },
          valueCodeableConcept { coding { code, display } text },
          valueQuantity { value, unit },
          component {
            code { coding { code, system, display } },
            valueCodeableConcept { coding { code, display } text },
            valueQuantity { value, unit },
          }
          effectiveDateTime
        }
      }
    }`;

    medplum
      .graphql(query)
      .then((response) => {
        const newPatient = response.data.Patient;
        const observations = (newPatient.ObservationList ?? []) as Observation[];
        setPatient(newPatient as Patient);
        setAllergies((newPatient.AllergyIntoleranceList ?? []) as AllergyIntolerance[]);
        setProblems(newPatient.ConditionList as Condition[]);
        setSmokingStatus(observations.find((obs) => obs.code?.coding?.[0].code === '72166-2'));
        setVitals(observations.filter((obs) => obs.category?.[0]?.coding?.[0].code === 'vital-signs'));
      })
      .catch(console.error);
  }, [medplum, id]);

  if (!patient) {
    return null;
  }

  return (
    <Card sx={{ width: 600 }} withBorder padding="lg" radius="md" mx="md" my="xl" shadow="xs">
      <Card.Section
        h={100}
        style={{
          backgroundColor: '#3994e8',
        }}
      />
      <ResourceAvatar value={patient} size={80} radius={80} mx="auto" mt={-50} sx={{ border: '2px solid white' }} />
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
            <Text fz="xs" align="center" sx={{ whiteSpace: 'nowrap' }}>
              {formatHumanName(patient.name?.[0] as HumanName)}
            </Text>
          </Flex>
          <Flex justify="center" align="center" direction="column" gap={0}>
            <IconStethoscope size={24} color="gray" />
            <Text fz="xs" sx={{ whiteSpace: 'nowrap' }}>
              <ProviderName patient={patient} />
            </Text>
          </Flex>
          <Flex justify="center" align="center" direction="column" gap={0}>
            <IconGenderFemale size={24} color="gray" />
            <Text fz="xs" sx={{ whiteSpace: 'nowrap' }}>
              Female
            </Text>
          </Flex>
        </Group>
      </Paper>
      <Stack spacing="xs">
        <Anchor href="#">No upcoming appointments</Anchor>
        <Anchor href="#">No documented visits</Anchor>
        <Divider />
        <Allergies patient={patient} allergies={allergies as AllergyIntolerance[]} />
        <Divider />
        <ProblemList patient={patient} problems={problems as Condition[]} />
        <Divider />
        <SmokingStatus patient={patient} smokingStatus={smokingStatus} />
        <Divider />
        <Vitals patient={patient} vitals={vitals as Observation[]} />
      </Stack>
    </Card>
  );
}

function ProviderName(props: { patient: Patient }): JSX.Element {
  const patient = props.patient;
  const provider = useResource(patient?.generalPractitioner?.[0]);
  if (provider?.resourceType === 'Practitioner') {
    return <>{formatHumanName(provider.name?.[0] as HumanName)}</>;
  }
  if (provider?.resourceType === 'Organization') {
    return <>{provider.name as string}</>;
  }
  return <></>;
}
