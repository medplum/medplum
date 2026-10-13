// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Center, Container, Group, Input, Loader, Radio, Stack, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { MedplumClient } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type {
  Coding,
  Encounter,
  Patient,
  Practitioner,
  Reference,
  ServiceRequest,
  Task,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import type {
  BillingInformation,
  DiagnosisCodeableConcept,
  LabOrderInputErrors,
  LabOrganization,
  TestCoding,
} from '@medplum/health-gorilla-core';
import { NPI_SYSTEM } from '@medplum/health-gorilla-core';
import { HealthGorillaLabOrderProvider, useHealthGorillaLabOrder } from '@medplum/health-gorilla-react';
import type { AsyncAutocompleteOption } from '@medplum/react';
import {
  AsyncAutocomplete,
  DateTimeInput,
  Panel,
  ResourceInput,
  useMedplum,
  useResource,
  ValueSetAutocomplete,
} from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { PerformingLabInput } from '../../components/PerformingLabInput';
import { CoverageInput } from '../../components/labs/CoverageInput';
import { TestMetadataCardInput } from '../../components/labs/TestMetadataCardInput';
import { addDiagnosesToEncounter } from '../../utils/encounter';
import type { LabOrderDraftDefaults } from '../../utils/labOrderDraft';
import { getLabOrderDraftDefaults } from '../../utils/labOrderDraft';
import { showErrorNotification } from '../../utils/notifications';

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
  patient?: Patient | Reference<Patient> | undefined;
  encounter?: Encounter | Reference<Encounter> | undefined;
  task?: Task | Reference<Task> | undefined;
  tests?: TestCoding[] | undefined;
  performingLab?: LabOrganization | undefined;
  draftOrder?: ServiceRequest | undefined;
  onSubmitLabOrder: (serviceRequest?: ServiceRequest) => void;
}

export function OrderLabsPage(props: OrderLabsPageProps): JSX.Element {
  const {
    patient: defaultPatient,
    encounter,
    task,
    tests: defaultTests,
    performingLab: defaultPerformingLab,
    draftOrder,
    onSubmitLabOrder,
  } = props;
  const medplum = useMedplum();
  const { patientId } = useParams();
  const [requester, setRequester] = useState<Practitioner | undefined>(medplum.getProfile() as Practitioner);
  const defaultPatientResource = useResource(defaultPatient);
  const [patient, setPatient] = useState<Patient | undefined>(defaultPatientResource);
  const [draftDefaults, setDraftDefaults] = useState<LabOrderDraftDefaults | undefined>();
  const tests = defaultTests ?? draftDefaults?.tests;
  const performingLab = defaultPerformingLab ?? draftDefaults?.performingLab;
  const encounterResource = useResource(encounter);
  const taskResource = useResource(task);
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
    setPerformingLabAccountNumber,
    updateTestMetadata,
    createOrderBundle,
  } = labOrderReturn;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<{ generic?: unknown; validation?: LabOrderInputErrors } | undefined>();
  const prevTestsRef = useRef<TestCoding[] | undefined>(undefined);

  useEffect(() => {
    // Only set tests if they're provided and different from the previous value
    // Compare by checking if arrays have different lengths or different test codes
    const testsChanged =
      tests &&
      (prevTestsRef.current?.length !== tests.length ||
        prevTestsRef.current.some((prevTest, index) => prevTest.code !== tests[index]?.code));

    if (testsChanged) {
      setTests(tests);
      prevTestsRef.current = tests;
    }
  }, [tests, setTests]);

  // Resolve the draft's referenced resources before the form mounts, since the
  // inputs only read their default values at mount.
  useEffect(() => {
    if (!draftOrder) {
      setDraftDefaults(undefined);
      return;
    }
    const loadDraftDefaults = async (): Promise<void> => {
      try {
        setDraftDefaults(await getLabOrderDraftDefaults(medplum, draftOrder));
      } catch (error) {
        showErrorNotification(error);
      }
    };
    loadDraftDefaults().catch(console.error);
  }, [medplum, draftOrder]);

  useEffect(() => {
    if (!draftDefaults) {
      return;
    }
    if (draftDefaults.patient) {
      setPatient(draftDefaults.patient);
    }
    if (draftDefaults.requester) {
      setRequester(draftDefaults.requester);
    }
    for (const test of draftDefaults.tests) {
      const metadata = draftDefaults.testMetadata[test.code];
      if (metadata) {
        updateTestMetadata(test, metadata);
      }
    }
    setDiagnoses(draftDefaults.diagnoses);
    if (draftDefaults.billTo) {
      updateBillingInformation({ billTo: draftDefaults.billTo });
    }
    setPerformingLabAccountNumber(draftDefaults.performingLabAccountNumber);
    setOrderNotes(draftDefaults.orderNotes);
    setSpecimenCollectedDateTime(draftDefaults.specimenCollectedDateTime);
  }, [
    draftDefaults,
    updateTestMetadata,
    setDiagnoses,
    updateBillingInformation,
    setPerformingLabAccountNumber,
    setOrderNotes,
    setSpecimenCollectedDateTime,
  ]);

  useEffect(() => {
    if (patientId) {
      medplum
        .readResource('Patient', patientId)
        .then((patient) => {
          setPatient(patient);
        })
        .catch((error) => {
          showErrorNotification(error);
        });
    }
  }, [patientId, medplum]);

  const submitOrder = async (): Promise<void> => {
    try {
      setIsSubmitting(true);
      setCreateError(undefined);
      let { serviceRequest } = await createOrderBundle();
      if (encounterResource) {
        serviceRequest = {
          ...serviceRequest,
          encounter: createReference(encounterResource),
        };
        if (state.diagnoses.length > 0) {
          // Surface diagnoses on the encounter so they flow into billing, but don't
          // fail the already-created lab order if the sync errors.
          try {
            await addDiagnosesToEncounter(medplum, encounterResource, state.diagnoses);
          } catch (error) {
            showErrorNotification(error);
          }
        }
      }
      if (taskResource) {
        await medplum.updateResource({
          ...taskResource,
          output: [
            ...(taskResource.output || []),
            {
              type: { text: 'ServiceRequest' },
              valueReference: createReference(serviceRequest),
            },
          ],
          focus: createReference(serviceRequest),
        });
      }
      await sendLabOrderToHealthGorilla(medplum, serviceRequest);

      if (draftOrder?.id) {
        // The resumed draft has been superseded by the order that was just sent.
        try {
          await medplum.patchResource('ServiceRequest', draftOrder.id, [
            { op: 'replace', path: '/status', value: 'revoked' },
          ]);
        } catch (error) {
          showErrorNotification(error);
        }
      }

      showNotification({
        title: 'Lab Order Submitted',
        message: 'The lab order has been successfully submitted.',
        color: 'green',
      });
      onSubmitLabOrder({ ...serviceRequest, status: 'active' });
    } catch (error) {
      setCreateError({ generic: error });
      showErrorNotification(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (draftOrder && !draftDefaults) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

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
                defaultValue={draftDefaults?.requester ?? requester}
                searchCriteria={{ identifier: `${NPI_SYSTEM}|` }}
              />
            </Input.Wrapper>
            <Input.Wrapper label="Patient" required error={createError?.validation?.patient?.message}>
              <ResourceInput<Patient>
                key={patient?.id ?? 'patient'}
                resourceType="Patient"
                name="patient"
                defaultValue={patient}
                onChange={setPatient}
              />
            </Input.Wrapper>
            <PerformingLabInput
              patient={patient}
              performingLab={performingLab}
              error={createError?.validation?.performingLab}
            />
            <TextInput
              label="Performing lab account number"
              description="Overrides the practice-level account number for this order"
              disabled={!state.performingLab}
              value={state.performingLabAccountNumber ?? ''}
              onChange={(e) => setPerformingLabAccountNumber(e.currentTarget.value || undefined)}
            />
            <div>
              <AsyncAutocomplete<TestCoding>
                required
                error={createError?.validation?.selectedTests?.message}
                label="Selected tests"
                disabled={!state.performingLab}
                maxValues={10}
                defaultValue={tests}
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
                binding="http://hl7.org/fhir/sid/icd-10-cm/vs/billable"
                name="diagnoses"
                maxValues={10}
                defaultValue={draftDefaults?.diagnoses.map((concept) => concept.coding[0])}
                onChange={(items) => {
                  const codeableConcepts = items.map((item) => ({
                    coding: [valueSetElementToCoding(item)],
                  })) as DiagnosisCodeableConcept[];
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
            <TextInput
              label="Order notes"
              defaultValue={draftDefaults?.orderNotes}
              onChange={(e) => setOrderNotes(e.currentTarget.value)}
            />
            <DateTimeInput
              label="Specimen collection time"
              name=""
              defaultValue={draftDefaults?.specimenCollectedDateTime?.toISOString()}
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

/**
 * Local copy — not all published `@medplum/react` bundles export this helper in `.d.ts`.
 * @param element - A row from ValueSet expansion.
 * @returns A FHIR Coding for the expansion element.
 */
function valueSetElementToCoding(element: ValueSetExpansionContains): Coding {
  return {
    system: element.system,
    code: element.code,
    display: element.display,
  };
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
