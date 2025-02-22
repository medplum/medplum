import { useNavigate } from 'react-router-dom';
import { Button, Modal, Text, Card, Grid, Box, Stack } from '@mantine/core';
import { useState } from 'react';
import { CodeInput, CodingInput, ResourceInput, useMedplum, ValueSetAutocomplete } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff, IconAlertSquareRounded } from '@tabler/icons-react';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Coding, Encounter, PlanDefinition, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { usePatient } from '../../hooks/usePatient';
import classes from './EncounterModal.module.css';

export const EncounterModal = (): JSX.Element => {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = usePatient();
  const [isOpen, setIsOpen] = useState(true);
  const [serviceType, setServiceType] = useState<ValueSetExpansionContains[]>([]);
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>();
  const [planDefinitionData, setPlanDefinitionData] = useState<PlanDefinition | undefined>();
  const [status, setStatus] = useState<Encounter['status'] | undefined>();

  const handleCreateEncounter = async (): Promise<void> => {
    if (!patient || !encounterClass || !serviceType || !status) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Fill up mandatory fields.',
      });
      return;
    }

    const encounterData: Encounter = {
      resourceType: 'Encounter',
      status: status,
      statusHistory: [],
      class: encounterClass,
      classHistory: [],
      serviceType: { coding: serviceType },
      subject: createReference(patient),
    };

    try {
      const encounter = await medplum.createResource(encounterData);

      if (planDefinitionData) {
        await medplum.post(medplum.fhirUrl('PlanDefinition', planDefinitionData.id as string, '$apply'), {
          resourceType: 'Parameters',
          parameter: [
            { name: 'subject', valueString: getReferenceString(patient) },
            { name: 'encounter', valueString: getReferenceString(encounter) },
          ],
        });
      }

      showNotification({ icon: <IconCircleCheck />, title: 'Success', message: 'Encounter created' });

      navigate(`/Patient/${patient.id}/Encounter/${encounter.id}`);
    } catch (err) {
      showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        navigate(-1);
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

                <ValueSetAutocomplete
                  name="type"
                  label="Service Type"
                  binding="http://hl7.org/fhir/ValueSet/service-type"
                  withHelpText={true}
                  maxValues={1}
                  required={true}
                  onChange={(items: ValueSetExpansionContains[]) => setServiceType(items)}
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
                  Optionally you can select template for new encounter. Tasks from the template will be automatically
                  added to the encounter. Administrators can create and edit templates in the{' '}
                  <Text component="a" href="#" variant="link">
                    Medplum app
                  </Text>
                  .
                </Text>

                <ResourceInput
                  name="plandefinition"
                  resourceType="PlanDefinition"
                  onChange={(value) => setPlanDefinitionData(value as PlanDefinition)}
                />
              </Card>
            </Grid.Col>
          </Grid>
        </Box>

        <Box className={classes.footer} h={70} p="md">
          <Button fullWidth={false} onClick={handleCreateEncounter}>
            Create Encounter
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
