import { Box, Button, Card, Grid, Modal, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import {
  ChargeItem,
  ClinicalImpression,
  Coding,
  Encounter,
  PlanDefinition,
  ServiceRequest,
  Task,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { CodeInput, CodingInput, ResourceInput, useMedplum, ValueSetAutocomplete } from '@medplum/react';
import { IconAlertSquareRounded, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import { useNavigate } from 'react-router';
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
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateEncounter = async (): Promise<void> => {
    if (!patient || !encounterClass || !serviceType || !status) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Please fill out required fields.',
      });
      return;
    }

    setIsLoading(true);

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
      const clinicalImpressionData: ClinicalImpression = {
        resourceType: 'ClinicalImpression',
        status: 'completed',
        description: 'Initial clinical impression',
        subject: createReference(patient),
        encounter: createReference(encounter),
        date: new Date().toISOString(),
      };

      await medplum.createResource(clinicalImpressionData);

      if (planDefinitionData) {
        await medplum.post(medplum.fhirUrl('PlanDefinition', planDefinitionData.id as string, '$apply'), {
          resourceType: 'Parameters',
          parameter: [
            { name: 'subject', valueString: getReferenceString(patient) },
            { name: 'encounter', valueString: getReferenceString(encounter) },
          ],
        });
      }

      await handleChargeItemsFromTasks(encounter);

      showNotification({ icon: <IconCircleCheck />, title: 'Success', message: 'Encounter created' });
      navigate(`/Patient/${patient.id}/Encounter/${encounter.id}/chart`)?.catch(console.error);
    } catch (err) {
      showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
    }
  };

  const handleChargeItemsFromTasks = async (encounter: Encounter): Promise<void> => {
    try {
      const tasks = await medplum.search('Task', {
        encounter: getReferenceString(encounter),
      });

      if (!tasks.entry?.length) {
        return;
      }

      await Promise.all(
        tasks.entry.map(async (entry) => {
          const task = entry.resource as Task;
          const serviceRequestRef = task.focus?.reference;

          if (!serviceRequestRef?.startsWith('ServiceRequest/')) {
            return;
          }

          try {
            const serviceRequest: ServiceRequest = await medplum.readReference({
              reference: serviceRequestRef,
            });
            await createChargeItemFromServiceRequest(serviceRequest);
          } catch (err) {
            console.error(`Error processing ServiceRequest ${serviceRequestRef}:`, err);
          }
        })
      );
    } catch (error) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  async function createChargeItemFromServiceRequest(serviceRequest: ServiceRequest): Promise<void> {
    if (!patient) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Patient not found.',
      });
      return;
    }

    // Look for ChargeItemDefinition
    let definitionCanonical: string[] = [];
    const chargeDefinitionExtension = serviceRequest.extension?.find(
      (ext) => ext.url === 'http://medplum.com/fhir/StructureDefinition/applicable-charge-definition'
    );
    if (chargeDefinitionExtension?.valueCanonical) {
      const canonicalUrl = chargeDefinitionExtension.valueCanonical;
      definitionCanonical = [canonicalUrl];
    }

    const chargeItem: ChargeItem = {
      resourceType: 'ChargeItem',
      status: 'planned',
      supportingInformation: [
        {
          reference: `ServiceRequest/${serviceRequest.id}`,
        },
      ],
      subject: createReference(patient),
      context: serviceRequest.encounter,
      occurrenceDateTime: serviceRequest.occurrenceDateTime || new Date().toISOString(),
      code: serviceRequest.code || { coding: [] },
      quantity: {
        value: 1,
      },
      definitionCanonical: definitionCanonical,
    };

    try {
      await medplum.createResource(chargeItem);
    } catch (error) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  }

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
          <Button fullWidth={false} onClick={handleCreateEncounter} loading={isLoading} disabled={isLoading}>
            Create Encounter
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
