import { Text, Stack, Box, Card, Button, Grid, GridCol, Select, Flex } from '@mantine/core';
import { CodeableConcept, Encounter, Practitioner } from '@medplum/fhirtypes';
import { CodeableConceptInput, Loading, ResourceInput, useMedplum } from '@medplum/react';
import { Outlet, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';

export const EncounterCheckIn = (): JSX.Element => {
  const { encounterId } = useParams();
  const medplum = useMedplum();
  const [encounter, setEncounter] = useState<Encounter | undefined>();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [serviceType, setServiceType] = useState<CodeableConcept | undefined>();

  useEffect(() => {
    const fetchEncounter = async (): Promise<void> => {
      const encounterResult = await medplum.readResource('Encounter', encounterId as string);
      setEncounter(encounterResult);

      if (encounterResult.serviceType) {
        console.log(encounterResult.serviceType);
        setServiceType(encounterResult.serviceType);
      }
    };

    if (encounterId) {
      fetchEncounter().catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
    }
  }, [encounterId, medplum]);

  useEffect(() => {
    const fetchPractitioner = async (): Promise<void> => {
      if (encounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(encounter.participant[0].individual);
        setPractitioner(practitionerResult as Practitioner);
      }
    };

    fetchPractitioner().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [encounter, medplum]);

  const handlePractitionerChange = async (practitioner: Practitioner | undefined): Promise<void> => {
    if (!encounter || !practitioner) {
      return;
    }

    const updatedEncounter = {
      ...encounter,
      participant: [
        {
          individual: {
            reference: `Practitioner/${practitioner.id}`,
          },
        },
      ],
    };

    try {
      await medplum.updateResource(updatedEncounter);
      showNotification({
        color: 'green',
        title: 'Success',
        message: 'Practitioner assigned to encounter successfully',
      });
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  const handleServiceTypeChange = async (serviceType: CodeableConcept | undefined): Promise<void> => {
    if (!encounter || !serviceType) {
      return;
    }

    const updatedEncounter = {
      ...encounter,
      serviceType: serviceType,
    };

    try {
      await medplum.updateResource(updatedEncounter);
      setServiceType(serviceType);
      showNotification({
        color: 'green',
        title: 'Success',
        message: 'Service type updated successfully',
      });
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  if (!encounter) {
    return <Loading />;
  }

  return (
    <>
      <Box p="md">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
          <Card withBorder shadow="sm">
            <Stack gap="lg">
              <Text size="lg" c="dimmed" mb="lg">
                CHECK IN
              </Text>

              <ResourceInput
                resourceType="Practitioner"
                name="Patient-id"
                label="Assigned Practitioner"
                defaultValue={practitioner}
                required={true}
                onChange={handlePractitionerChange}
              />

              <CodeableConceptInput
                name="servicetype"
                label="Service Type"
                binding="http://hl7.org/fhir/ValueSet/service-type"
                required={true}
                defaultValue={serviceType}
                onChange={handleServiceTypeChange}
                maxValues={1}
                path="Encounter.serviceType"
              />

              <Grid>
                <GridCol span={6}>
                  <Select
                    label="Payment Type"
                    data={['Insurance', 'Self-pay']}
                    defaultValue="Insurance"
                    allowDeselect={false}
                  />
                </GridCol>
              </Grid>

              <Flex justify="flex-end">
                <Button>Check eligibility</Button>
              </Flex>
            </Stack>
          </Card>

          <Stack gap="lg">
            <Button>Edit Demographics </Button>
          </Stack>
        </div>
        <Outlet />
      </Box>
    </>
  );
};
