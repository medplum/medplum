import { Button, Container, Group, Input, Radio, Stack, TextInput } from '@mantine/core';
import { ContentType, MedplumClient } from '@medplum/core';
import { Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import {
  BillingInformation,
  DiagnosisCodeableConcept,
  LabOrderInputErrors,
  NPI_SYSTEM,
  TestCoding,
} from '@medplum/health-gorilla-core';
import { HealthGorillaLabOrderProvider, useHealthGorillaLabOrder } from '@medplum/health-gorilla-react';
import {
  AsyncAutocomplete,
  AsyncAutocompleteOption,
  DateTimeInput,
  Panel,
  ResourceInput,
  useMedplum,
  ValueSetAutocomplete,
} from '@medplum/react';
import { PerformingLabInput } from '../components/PerformingLabInput';
import { TestMetadataCardInput } from '../components/TestMetadataCardInput';
import { CoverageInput } from '../components/CoverageInput';
import { useState, JSX, useEffect } from 'react';
import { useParams } from 'react-router';
import { showErrorNotification } from '../utils/notifications';
import { showNotification } from '@mantine/notifications';

async function sendLabOrderToHealthGorilla(medplum: MedplumClient, labOrder: ServiceRequest): Promise<void> {
  return medplum.executeBot(
    {
      system: 'https://www.medplum.com/integrations/bot-identifier',
      value: 'health-gorilla-labs/send-to-health-gorilla',
    },
    labOrder,
    ContentType.FHIR_JSON
  );
}

export interface OrderLabsPageProps {
  onSubmitLabOrder: () => void;
}

export function OrderLabsPage(props: OrderLabsPageProps): JSX.Element {
  const { onSubmitLabOrder } = props;
  const medplum = useMedplum();
  const { patientId } = useParams();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [requester, setRequester] = useState<Practitioner | undefined>(medplum.getProfile() as Practitioner);
  const labOrderReturn = useHealthGorillaLabOrder({
    patient,
    requester,
  });

  const {
    state,
    searchAvailableTests,
    setTests,
    setDiagnoses,
    updateBillingInformation,
    setSpecimenCollectedDateTime,
    setOrderNotes,
    createOrderBundle,
  } = labOrderReturn;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<{ generic?: unknown; validation?: LabOrderInputErrors } | undefined>();

  useEffect(() => {
    if (patientId) {
      medplum
        .readResource('Patient', patientId)
        .then((patient) => {
          setPatient(patient);
        })
        .catch((error) => {
          console.error('Error fetching patient:', error);
        });
    }
  }, [patientId, medplum]);

  const submitOrder = async (): Promise<void> => {
    try {
      setIsSubmitting(true);
      setCreateError(undefined);
      const { serviceRequest } = await createOrderBundle();
      await sendLabOrderToHealthGorilla(medplum, serviceRequest);

      showNotification({
        title: 'Lab Order Submitted',
        message: 'The lab order has been successfully submitted.',
        color: 'green',
      });
      onSubmitLabOrder();
    } catch (error) {
      setCreateError({ generic: error });
      showErrorNotification(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <HealthGorillaLabOrderProvider {...labOrderReturn}>
      <Container size="md">
        <Panel>
          <Stack gap="md">
            <Input.Wrapper label="Requester" required error={createError?.validation?.requester?.message}>
              <ResourceInput<Practitioner>
                resourceType="Practitioner"
                name="Requester"
                onChange={setRequester}
                defaultValue={requester}
                searchCriteria={{ identifier: `${NPI_SYSTEM}|` }}
              />
            </Input.Wrapper>
            <Input.Wrapper label="Patient" required error={createError?.validation?.patient?.message}>
              <ResourceInput<Patient>
                resourceType="Patient"
                name="patient"
                defaultValue={patient}
                onChange={setPatient}
              />
            </Input.Wrapper>
            <PerformingLabInput patient={patient} error={createError?.validation?.performingLab} />
            <div>
              <AsyncAutocomplete<TestCoding>
                required
                error={createError?.validation?.selectedTests?.message}
                label="Selected tests"
                disabled={!state.performingLab}
                maxValues={10}
                loadOptions={searchAvailableTests}
                toOption={TestCodingToOption}
                onChange={setTests}
              />
              {state.selectedTests.length > 0 && (
                <Group mt="md" gap="md" align="flex-start" wrap="wrap">
                  {state.selectedTests.map((test: TestCoding) => (
                    <TestMetadataCardInput
                      key={test.code}
                      test={test}
                      metadata={state.testMetadata[test.code]}
                      error={createError?.validation?.testMetadata?.[test.code]}
                    />
                  ))}
                </Group>
              )}
            </div>
            <div>
              <ValueSetAutocomplete
                label="Diagnoses"
                binding="http://hl7.org/fhir/sid/icd-10-cm"
                name="diagnoses"
                maxValues={10}
                onChange={(items) => {
                  const codeableConcepts = items.map((item) => ({ coding: [item] })) as DiagnosisCodeableConcept[];
                  setDiagnoses(codeableConcepts);
                }}
              />
            </div>
            <Group align="flex-start" gap={48}>
              <div>
                <Radio.Group
                  value={state.billingInformation.billTo}
                  error={createError?.validation?.billingInformation?.billTo?.message}
                  onChange={(newBillTo) => {
                    updateBillingInformation({ billTo: newBillTo as BillingInformation['billTo'] });
                  }}
                  label="Bill to"
                  withAsterisk
                >
                  <Stack gap={4}>
                    <Radio value="patient" label="Patient" />
                    <Radio value="insurance" label="Insurance" />
                    <Radio value="customer-account" label="Customer" />
                  </Stack>
                </Radio.Group>
              </div>
              {patient && (
                <CoverageInput patient={patient} error={createError?.validation?.billingInformation?.patientCoverage} />
              )}
            </Group>
            <TextInput label="Order notes" onChange={(e) => setOrderNotes(e.currentTarget.value)} />
            <DateTimeInput
              label="Specimen collection time"
              name=""
              onChange={(isoDateTimeString) => {
                setSpecimenCollectedDateTime(isoDateTimeString ? new Date(isoDateTimeString) : undefined);
              }}
            />
            <Group>
              <Button onClick={submitOrder} loading={isSubmitting} disabled={isSubmitting}>
                Submit Order
              </Button>
            </Group>
          </Stack>
        </Panel>
      </Container>
    </HealthGorillaLabOrderProvider>
  );
}

function TestCodingToOption(element: TestCoding): AsyncAutocompleteOption<TestCoding> {
  return {
    value: toKey(element),
    label: getDisplay(element),
    resource: element,
  };
}

function toKey(element: TestCoding): string {
  if (typeof element.code === 'string') {
    return element.code;
  }
  return JSON.stringify(element);
}

function getDisplay(item: TestCoding): string {
  if (typeof item.display === 'string') {
    return item.display;
  }
  return toKey(item);
}
