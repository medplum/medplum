import { Button, Code, Container, Group, Input, Radio, Stack, Text, TextInput } from '@mantine/core';
import {
  BillingInformation,
  DiagnosisCodeableConcept,
  HealthGorillaLabOrderProvider,
  LabOrderValidationError,
  NPI_SYSTEM,
  TestCoding,
  useHealthGorillaLabOrder,
} from '@medplum-ee/hg-client';
import { ContentType, MedplumClient } from '@medplum/core';
import { Bundle, Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import {
  AsyncAutocomplete,
  AsyncAutocompleteOption,
  DateTimeInput,
  Panel,
  ResourceInput,
  useMedplum,
  ValueSetAutocomplete,
} from '@medplum/react';
import { useState } from 'react';
import { PerformingLabInput } from './components/PerformingLabInput';
import { TestMetadataCardInput } from './components/TestMetadataCardInput';
import { CoverageInput } from './components/CoverageInput';

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

export function HomePage(): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [requester, setRequester] = useState<Practitioner | undefined>();
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

  const [transactionResponse, setTransactionResponse] = useState<Bundle>();
  const [labOrder, setLabOrder] = useState<ServiceRequest>();
  const [createBundleError, setCreateBundleError] = useState<any>();

  const handleCreateOrderBundle = async (): Promise<void> => {
    try {
      const { transactionResponse, serviceRequest } = await createOrderBundle();
      setCreateBundleError(undefined);
      setLabOrder(serviceRequest);
      setTransactionResponse(transactionResponse);
    } catch (e) {
      console.error(e);
      setLabOrder(undefined);
      setTransactionResponse(undefined);
      setCreateBundleError(e);
    }
  };

  function displayError(error: any): React.ReactNode {
    if (error instanceof LabOrderValidationError) {
      return (
        <ul>
          {error.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      );
    } else {
      return error.toString();
    }
  }

  return (
    <HealthGorillaLabOrderProvider {...labOrderReturn}>
      <Container size="md">
        <Panel>
          <Stack gap="md">
            <Input.Wrapper label="Requester" required>
              <ResourceInput<Practitioner>
                resourceType="Practitioner"
                name="Requester"
                onChange={setRequester}
                searchCriteria={{ identifier: `${NPI_SYSTEM}|` }}
              />
            </Input.Wrapper>
            <Input.Wrapper label="Patient" required>
              <ResourceInput<Patient> resourceType="Patient" name="patient" onChange={setPatient} />
            </Input.Wrapper>
            <PerformingLabInput patient={patient} />
            <div>
              <AsyncAutocomplete<TestCoding>
                required
                label="Selected tests"
                disabled={!state.performingLab}
                maxValues={10}
                loadOptions={searchAvailableTests}
                toOption={TestCodingToOption}
                onChange={setTests}
              />
              {state.selectedTests.length > 0 && (
                <Group mt="md" gap="md" align="flex-start" wrap="wrap">
                  {state.selectedTests.map((test) => (
                    <TestMetadataCardInput key={test.code} test={test} metadata={state.testMetadata[test.code]} />
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
              {patient && <CoverageInput patient={patient} />}
            </Group>
            <TextInput label="Order notes" onChange={(e) => setOrderNotes(e.currentTarget.value)} />
            <DateTimeInput
              label="Specimen collection time"
              name=""
              onChange={(isoDateTimeString) => {
                setSpecimenCollectedDateTime(isoDateTimeString ? new Date(isoDateTimeString) : undefined);
              }}
            />
            <div>
              <Group>
                <Button onClick={handleCreateOrderBundle} disabled={false}>
                  Create order bundle
                </Button>
                <Button
                  onClick={() => {
                    if (labOrder) {
                      sendLabOrderToHealthGorilla(medplum, labOrder)
                        .then((response) => {
                          console.log('Sent to HG response', response);
                        })
                        .catch((error) => console.error('Error sending to HG', error));
                    }
                  }}
                  disabled={!labOrder}
                >
                  Submit Order to Health Gorilla
                </Button>
              </Group>
            </div>
            <div>
              {labOrder && (
                <>
                  <Text fw={500} c="green">
                    Created Lab Order:
                  </Text>
                  <Code block>{JSON.stringify(labOrder, null, 2)}</Code>
                </>
              )}
              {!labOrder && transactionResponse && (
                <>
                  <Text fw={500} c="red">
                    Bundle transaction response:
                  </Text>
                  <Code block>{JSON.stringify(transactionResponse, null, 2)}</Code>
                </>
              )}
              {createBundleError && (
                <>
                  <Text>Create bundle error:</Text>
                  {displayError(createBundleError)}
                  {/* <Code block>{createBundleError.toString()}</Code> */}
                </>
              )}
            </div>
            <div>
              <Text>State:</Text>
              <Code block>{JSON.stringify(state, null, 2)}</Code>
            </div>
            <div>
              <Text>Patient:</Text>
              <Code block>{JSON.stringify(patient, null, 2)}</Code>
            </div>
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
