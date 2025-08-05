// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CodingInput, DateTimeInput, Form, ResourceInput, useMedplum } from '@medplum/react';
import { useState, useEffect, JSX } from 'react';
import { SlotInfo } from 'react-big-calendar';
import { Button, Card, Flex, Stack, Text, Title } from '@mantine/core';
import { Coding, Patient, PlanDefinition, PlanDefinitionAction } from '@medplum/fhirtypes';
import { IconAlertSquareRounded, IconCircleCheck, IconCirclePlus } from '@tabler/icons-react';
import classes from './CreateVisit.module.css';
import { createEncounter } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { useNavigate } from 'react-router';
import { showNotification } from '@mantine/notifications';

interface CreateVisitProps {
  appointmentSlot: SlotInfo | undefined;
}

export function CreateVisit(props: CreateVisitProps): JSX.Element {
  const { appointmentSlot } = props;
  const [formattedDate, setFormattedDate] = useState<string>('');
  const [formattedSlotTime, setFormattedSlotTime] = useState<string>('');
  const [patient, setPatient] = useState<Patient | undefined>();
  const [planDefinitionData, setPlanDefinitionData] = useState<PlanDefinition | undefined>();
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>();
  const [start, setStart] = useState<Date | undefined>(appointmentSlot?.start);
  const [end, setEnd] = useState<Date | undefined>(appointmentSlot?.end);
  const [isLoading, setIsLoading] = useState(false);
  const medplum = useMedplum();
  const navigate = useNavigate();

  useEffect(() => {
    if (!appointmentSlot) {
      return;
    }

    const startDate = new Date(appointmentSlot?.start);
    const endDate = new Date(appointmentSlot?.end);

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    };
    const dateStr = startDate.toLocaleDateString('en-US', options);

    const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
    const startTimeStr = startDate.toLocaleTimeString('en-US', timeOptions);
    const endTimeStr = endDate.toLocaleTimeString('en-US', timeOptions);

    const formattedTime = `${startTimeStr} – ${endTimeStr}`;
    setFormattedDate(dateStr);
    setFormattedSlotTime(formattedTime);
  }, [appointmentSlot]);

  async function handleSubmit(): Promise<void> {
    if (!patient || !planDefinitionData || !encounterClass || !start || !end) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Please fill out required fields.',
      });
      return;
    }
    setIsLoading(true);
    try {
      const encounter = await createEncounter(medplum, start, end, encounterClass, patient, planDefinitionData);
      showNotification({ icon: <IconCircleCheck />, title: 'Success', message: 'Visit created' });
      navigate(`/Patient/${patient.id}/Encounter/${encounter.id}`)?.catch(console.error);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Flex direction="column" gap="md" h="100%" justify="space-between">
        <Stack gap="md" h="100%">
          <Stack gap={0}>
            <Title order={1} fw={500}>
              {formattedDate}
            </Title>
            <Text size="lg">{formattedSlotTime}</Text>
          </Stack>

          <ResourceInput
            label="Patient"
            resourceType="Patient"
            name="Patient-id"
            required={true}
            onChange={(value) => setPatient(value as Patient)}
          />

          <DateTimeInput
            name="start"
            label="Start Time"
            defaultValue={appointmentSlot?.start?.toISOString()}
            required={true}
            onChange={(value) => {
              setStart(new Date(value));
            }}
          />

          <DateTimeInput
            name="end"
            label="End Time"
            defaultValue={appointmentSlot?.end?.toISOString()}
            required={true}
            onChange={(value) => {
              setEnd(new Date(value));
            }}
          />

          <CodingInput
            name="class"
            label="Class"
            binding="http://terminology.hl7.org/ValueSet/v3-ActEncounterCode"
            required={true}
            onChange={setEncounterClass}
            path="Encounter.type"
          />

          <ResourceInput
            name="plandefinition"
            resourceType="PlanDefinition"
            label="Care template"
            onChange={(value) => {
              setPlanDefinitionData(value as PlanDefinition);
            }}
            required={true}
          />
        </Stack>

        {planDefinitionData?.action && planDefinitionData.action.length > 0 && (
          <Card className={classes.planDefinition}>
            <Stack gap={0}>
              <Text fw={500}>Included Tasks</Text>
              {planDefinitionData?.action?.map((action: PlanDefinitionAction) => (
                <Text key={action.id}>- {action.title}</Text>
              ))}
            </Stack>
          </Card>
        )}

        <Button fullWidth mt="xl" type="submit" loading={isLoading} disabled={isLoading}>
          <IconCirclePlus /> <Text ml="xs">Create Visit</Text>
        </Button>
      </Flex>
    </Form>
  );
}
