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
import { CodeableConcept, Coverage, Encounter, Organization, Practitioner } from '@medplum/fhirtypes';
import { CodeableConceptInput, Loading, ResourceInput, useMedplum } from '@medplum/react';
import { Outlet, useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { IconCircleOff, IconCheck } from '@tabler/icons-react';
import { EncounterHeader } from '../components/Encounter/EncounterHeader';
import { usePatient } from '../../hooks/usePatient';

enum PaymentType {
  Insurance = 'Insurance',
  SelfPay = 'Self-pay',
}

export const EncounterCheckIn = (): JSX.Element => {
  const { encounterId } = useParams();
  const theme = useMantineTheme();
  const medplum = useMedplum();
  const patient = usePatient();
  const [encounter, setEncounter] = useState<Encounter | undefined>();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [organization, setOrganization] = useState<Organization | undefined>();
  const [paymentType, setPaymentType] = useState<PaymentType>(PaymentType.SelfPay);
  const [coverageFetched, setCoverageFetched] = useState<boolean>(false);
  const [eligibilityChecked, setEligibilityChecked] = useState<boolean>(false);

  useEffect(() => {
    const fetchEncounter = async (): Promise<void> => {
      const encounterResult = await medplum.readResource('Encounter', encounterId as string);
      setEncounter(encounterResult);
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

  useEffect(() => {
    const fetchCoverage = async (): Promise<void> => {
      if (patient) {
        const coverageResult = await medplum.searchResources('Coverage', `patient=${getReferenceString(patient)}`);
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
  }, [patient, medplum]);

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

    try {
      const updatedEncounter = await medplum.updateResource({
        ...encounter,
        participant: [
          {
            individual: {
              reference: getReferenceString(practitioner),
            },
          },
        ],
      });
      setPractitioner(practitioner);
      setEncounter(updatedEncounter);
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

    try {
      const updatedEncounter = await medplum.updateResource({
        ...encounter,
        serviceType: serviceType,
      });
      setEncounter(updatedEncounter);
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
                  onChange={handlePractitionerChange}
                />

                <CodeableConceptInput
                  name="servicetype"
                  label="Service Type"
                  binding="http://hl7.org/fhir/ValueSet/service-type"
                  defaultValue={encounter.serviceType}
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
