import { Anchor, Avatar, Card, Divider, Flex, Group, Paper, Stack, Text } from '@mantine/core';
import { calculateAgeString, formatHumanName } from '@medplum/core';
import { AllergyIntolerance, Condition, HumanName, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
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
    <Card sx={{ width: 400 }} withBorder padding="lg" radius="md" mx="md" my="xl" shadow="xs">
      <Card.Section
        h={100}
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80)',
        }}
      />
      <Avatar
        src="https://images.unsplash.com/photo-1623582854588-d60de57fa33f?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=250&q=80"
        size={80}
        radius={80}
        mx="auto"
        mt={-50}
        sx={{ border: '2px solid white' }}
      />
      <Text ta="center" fz="lg" fw={500}>
        {formatHumanName(patient.name?.[0] as HumanName)}
      </Text>
      <Text ta="center" fz="xs" color="dimmed">
        {patient.birthDate} ({calculateAgeString(patient.birthDate as string)})
      </Text>
      <Paper withBorder p="md" my="md">
        <Group grow>
          <Flex justify="center" align="center" direction="column" gap={0}>
            <IconUserSquare size={24} color="gray" />
            <Text fz="xs" sx={{ whiteSpace: 'nowrap' }}>
              {formatHumanName(patient.name?.[0] as HumanName)}
            </Text>
          </Flex>
          <Flex justify="center" align="center" direction="column" gap={0}>
            <IconStethoscope size={24} color="gray" />
            <Text fz="xs" sx={{ whiteSpace: 'nowrap' }}>
              Provider Name
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
