import {
  Text,
  Stack,
  Box,
  Card,
  Button,
  Grid,
  GridCol,
  Select,
  Flex,
  Anchor,
  Group,
  useMantineTheme,
} from '@mantine/core';
import { CodeableConcept, Coverage, Encounter, Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import { CodeableConceptInput, Loading, ResourceInput, useMedplum } from '@medplum/react';
import { Outlet, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { IconCircleOff, IconCheck } from '@tabler/icons-react';
import { EncounterHeader } from '../components/Encounter/EncounterHeader';

enum PaymentType {
  Insurance = 'Insurance',
  SelfPay = 'Self-pay',
}

export const EncounterCheckIn = (): JSX.Element => {
  const theme = useMantineTheme();
  const { patientId, encounterId } = useParams();
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [encounter, setEncounter] = useState<Encounter | undefined>();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [serviceType, setServiceType] = useState<CodeableConcept | undefined>();
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [organization, setOrganization] = useState<Organization | undefined>();
  const [paymentType, setPaymentType] = useState<PaymentType>(PaymentType.SelfPay);
  const [coverageFetched, setCoverageFetched] = useState<boolean>(false);
  const [eligibilityChecked, setEligibilityChecked] = useState<boolean>(false);

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
    const fetchPatient = async (): Promise<void> => {
      if (patientId) {
        const patientResult = await medplum.readResource('Patient', patientId);
        setPatient(patientResult);
      }
    };

    fetchPatient().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [patientId, medplum]);

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

  useEffect(() => {
    const fetchCoverage = async (): Promise<void> => {
      if (patientId) {
        const coverageResult = await medplum.searchResources('Coverage', `patient=Patient/${patientId}`);
        if (coverageResult.length > 0) {
          setCoverage(coverageResult[0] as Coverage);
          setPaymentType(PaymentType.Insurance);
        }
        setCoverageFetched(true);
      }
    };

    fetchCoverage().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [patientId, medplum]);

  useEffect(() => {
    if (paymentType === PaymentType.SelfPay) {
      setOrganization(undefined);
      return;
    }

    const fetchOrganization = async (): Promise<void> => {
      if (coverage?.payor?.[0]?.reference) {
        const organizationResult = await medplum.readReference({ reference: coverage.payor[0].reference });
        setOrganization(organizationResult as Organization);
      }
    };

    fetchOrganization().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [coverage, medplum, paymentType]);

  const handlePractitionerChange = async (practitioner: Practitioner | undefined): Promise<void> => {
    if (!encounter || !practitioner) {
      return;
    }

    const updatedEncounter = {
      ...encounter,
      participant: [
        {
          individual: {
            reference: getReferenceString(practitioner),
          },
        },
      ],
    };

    try {
      setPractitioner(practitioner);
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

  const togglePaymentType = (type: string | null): void => {
    if (!type) {
      return;
    }
    setPaymentType(type as PaymentType);
  };

  const handleCheckEligibility = (): void => {
    setEligibilityChecked(true);
  };

  if (!patient || !encounter || !coverageFetched) {
    return <Loading />;
  }

  return (
    <>
      <Stack justify="space-between" gap={0}>
        <EncounterHeader patient={patient} encounter={encounter} practitioner={practitioner} />

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
                      data={Object.values(PaymentType)}
                      defaultValue={paymentType}
                      onChange={togglePaymentType}
                      allowDeselect={false}
                      pr="lg"
                    />
                  </GridCol>
                  <GridCol span={6}>
                    {paymentType === PaymentType.Insurance && organization && (
                      <Stack gap={0}>
                        <Text fw={500}>Patient’s insurance</Text>
                        <Anchor href={`/Coverage/${coverage?.id}`} target="_blank">
                          {organization.name}
                        </Anchor>
                      </Stack>
                    )}
                  </GridCol>
                </Grid>

                {organization && (
                  <Flex justify="space-between" align="center">
                    {eligibilityChecked && (
                      <Stack gap={0}>
                        <Text fw={500}>Insurance eligibility</Text>
                        <Anchor href={`/Coverage/${coverage?.id}`} target="_blank">
                          {organization.name}
                        </Anchor>
                        <Group gap={5}>
                          <IconCheck size={20} color={theme.colors.green[8]} />{' '}
                          <Text color={theme.colors.green[8]}>Clear.</Text>
                          <Text c="dimmed">Last checked.</Text>
                          <Text c="dimmed">{new Date().toLocaleDateString()}</Text>
                        </Group>
                      </Stack>
                    )}
                    <Button variant="outline" onClick={handleCheckEligibility} style={{ marginLeft: 'auto' }}>
                      Check eligibility
                    </Button>
                  </Flex>
                )}
              </Stack>
            </Card>

            <Stack gap="lg">
              <Button>Edit Demographics </Button>
            </Stack>
          </div>
          <Outlet />
        </Box>
      </Stack>
    </>
  );
};
