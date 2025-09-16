// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Card, Grid, Modal, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Coding, Encounter, PlanDefinition } from '@medplum/fhirtypes';
import { CodeInput, CodingInput, DateTimeInput, ResourceInput, useMedplum } from '@medplum/react';
import { IconAlertSquareRounded, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import classes from './EncounterModal.module.css';
import { createEncounter } from '../../utils/encounter';

export const EncounterModal = (): JSX.Element => {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = usePatient();
  const [isOpen, setIsOpen] = useState(true);
  const [start, setStart] = useState<Date | undefined>();
  const [end, setEnd] = useState<Date | undefined>();
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>();
  const [planDefinitionData, setPlanDefinitionData] = useState<PlanDefinition | undefined>();
  const [status, setStatus] = useState<Encounter['status'] | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateEncounter = async (): Promise<void> => {
    if (!patient || !encounterClass || !start || !end || !status || !planDefinitionData) {
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
      showNotification({ icon: <IconCircleCheck />, title: 'Success', message: 'Encounter created' });
      navigate(`/Patient/${patient.id}/Encounter/${encounter.id}`)?.catch(console.error);
    } catch (err) {
      showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        navigate(-1)?.catch(console.error);
        setIsOpen(false);
      }}
      size="60%"
      title="New encounter"
      styles={{ title: { fontSize: '1.125rem', fontWeight: 600 }, body: { padding: 0, height: '60vh' } }}
    >
      <Stack h="100%" justify="space-between" gap={0}>
        <Box flex={1} miw={0}>
          <Grid p="md" h="100%">
            <Grid.Col span={6} pr="md">
              <Stack gap="md">
                <ResourceInput
                  resourceType="Patient"
                  name="Patient-id"
                  defaultValue={patient}
                  disabled={true}
                  required={true}
                />

                <DateTimeInput
                  name="start"
                  label="Start Time"
                  required={true}
                  onChange={(value) => {
                    setStart(new Date(value));
                  }}
                />

                <DateTimeInput
                  name="end"
                  label="End Time"
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

                <CodeInput
                  name="status"
                  label="Status"
                  binding="http://hl7.org/fhir/ValueSet/encounter-status|4.0.1"
                  maxValues={1}
                  required={true}
                  onChange={(value) => {
                    if (value) {
                      setStatus(value as typeof status);
                    }
                  }}
                />
              </Stack>
            </Grid.Col>

            <Grid.Col span={6}>
              <Card padding="lg" radius="md" className={classes.planDefinition}>
                <Text size="md" fw={500} mb="xs">
                  Apply care template
                </Text>
                <Text size="sm" color="dimmed" mb="lg">
                  You can select template for new encounter. Tasks from the template will be automatically added to the
                  encounter. Administrators can create and edit templates in the{' '}
                  <Text component="a" href="#" variant="link">
                    Medplum app
                  </Text>
                  .
                </Text>

                <ResourceInput
                  name="plandefinition"
                  resourceType="PlanDefinition"
                  onChange={(value) => setPlanDefinitionData(value as PlanDefinition)}
                  required={true}
                />
              </Card>
            </Grid.Col>
          </Grid>
        </Box>

        <Box className={classes.footer} h={70} p="md">
          <Button fullWidth={false} onClick={handleCreateEncounter} loading={isLoading} disabled={isLoading}>
            Create Encounter
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
