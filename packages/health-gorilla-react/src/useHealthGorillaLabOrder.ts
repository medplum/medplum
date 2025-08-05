// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ResourceArray, createReference, deepClone, getExtensionValue, getIdentifier, isResource } from '@medplum/core';
import {
  Bundle,
  Coverage,
  Location,
  Organization,
  Patient,
  Practitioner,
  Questionnaire,
  Reference,
  ServiceRequest,
} from '@medplum/fhirtypes';
import {
  BillingInformation,
  DiagnosisCodeableConcept,
  HEALTH_GORILLA_SYSTEM,
  LabOrderServiceRequest,
  LabOrderTestMetadata,
  LabOrganization,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
  TestCoding,
  createLabOrderBundle,
  isReferenceOfType,
  normalizeAoeQuestionnaire,
  questionnaireItemIterator,
  validateLabOrderInputs,
} from '@medplum/health-gorilla-core';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AOESearch, LabSearch, TestSearch, getAutocompleteSearchFunction } from './autocomplete-endpoint';
import {
  HealthGorillaLabOrderState,
  TestMetadata,
  UseHealthGorillaLabOrderReturn,
} from './HealthGorillaLabOrderContext';

export type UseHealthGorillaLabOrderOptions = {
  /** Patient the tests are ordered for. */
  patient: Patient | (Reference<Patient> & { reference: string }) | undefined;
  /**
   * The physician who requests diagnostic procedures for the patient and responsible for the order.
   * The Practitioner MUST have an NPI identifier with the system http://hl7.org/fhir/sid/us-npi.
   */
  requester: Practitioner | (Reference<Practitioner> & { reference: string }) | undefined;

  /** For multi-location practices, optionally specify the location from which the order is being placed */
  requestingLocation?: Location | Organization | (Reference<Location | Organization> & { reference: string });
};

export type EditableLabOrderTestMetadata = Pick<LabOrderTestMetadata, 'priority' | 'notes' | 'aoeResponses'>;
const EDITABLE_TEST_METADATA_KEYS: (keyof LabOrderTestMetadata)[] = ['priority', 'notes', 'aoeResponses'];

const INITIAL_TESTS: TestCoding[] = [];
const INITIAL_DIAGNOSES: DiagnosisCodeableConcept[] = [];
const INITIAL_TEST_METADATA = {};
const INITIAL_BILLING_INFORMATION: BillingInformation = {};

type TestsReducerState = {
  // Don't use any optional fields here, e.g. `selectedTests?: TestCoding[]` since that would cause
  // some loss of type safety in the reducer function by allowing the reducer to potentially return
  // incomplete state if a field is forgotten about. Instead, always use explicity `| undefined` for
  // fields that may legitimately be undefined in the state.

  selectedTests: TestCoding[];
  testMetadata: Record<string, TestMetadata | undefined>;
  specimenCollectedDateTime: Date | undefined;
};

type AddTestAction = { type: 'add'; test: TestCoding };
type RemoveTestAction = { type: 'remove'; test: TestCoding };
type SetTestsAction = { type: 'set'; tests: TestCoding[] };
type UpdateMetadataAction = {
  type: 'updateMetadata';
  test: TestCoding;
  partialMetadata: Partial<EditableLabOrderTestMetadata>;
};
type AoeLoadedAction = { type: 'aoeLoaded'; testAoes: [TestCoding, Questionnaire | undefined][] };
type SpecimentCollectionDateChangeAction = { type: 'specimenCollectionDateChange'; newDate: Date | undefined };
type AoeErrorAction = { type: 'aoeError'; tests: TestCoding[] };

type TestsAction =
  | AddTestAction
  | RemoveTestAction
  | SetTestsAction
  | UpdateMetadataAction
  | AoeLoadedAction
  | SpecimentCollectionDateChangeAction
  | AoeErrorAction;

function testsReducer(prev: TestsReducerState, action: TestsAction): TestsReducerState {
  switch (action.type) {
    case 'add':
      return addTest(prev, action);
    case 'remove':
      return removeTest(prev, action);
    case 'set':
      return setTests(prev, action);
    case 'updateMetadata':
      return updateMetadata(prev, action);
    case 'aoeLoaded':
      return aoeLoaded(prev, action);
    case 'aoeError':
      return aoeError(prev, action);
    case 'specimenCollectionDateChange':
      return specimenCollectionDateChange(prev, action);
    default:
      action satisfies never;
      return prev;
  }
}

function addTest(prev: TestsReducerState, action: AddTestAction): TestsReducerState {
  if (prev.selectedTests.some((test) => test.code === action.test.code)) {
    return prev;
  }

  return {
    ...prev,
    selectedTests: [...prev.selectedTests, action.test],
    testMetadata: {
      ...prev.testMetadata,
      [action.test.code]: { aoeStatus: 'loading' },
    },
  };
}

function removeTest(prev: TestsReducerState, action: RemoveTestAction): TestsReducerState {
  return {
    ...prev,
    selectedTests: prev.selectedTests.filter((test) => test.code !== action.test.code),
    testMetadata: Object.fromEntries(Object.entries(prev.testMetadata).filter(([code]) => code !== action.test.code)),
  };
}

function setTests(prev: TestsReducerState, action: SetTestsAction): TestsReducerState {
  return {
    ...prev,
    selectedTests: action.tests,
    testMetadata: Object.fromEntries(
      action.tests.map((test) => {
        return [test.code, prev.testMetadata[test.code] ?? { aoeStatus: 'loading' }];
      })
    ),
  };
}

function updateMetadata(prev: TestsReducerState, action: UpdateMetadataAction): TestsReducerState {
  const { test, partialMetadata } = action;

  const prevTestMetadata = prev.testMetadata[test.code];
  if (!prev.selectedTests.some((t) => t.code === test.code) || !prevTestMetadata) {
    console.warn(`Cannot update metadata for test ${test.code} since it is not a selected tests`);
    return prev;
  }

  let allowedUpdates = partialMetadata;
  const restrictedKeys = Object.keys(partialMetadata).filter((k) => !EDITABLE_TEST_METADATA_KEYS.includes(k as any));

  if (restrictedKeys.length > 0) {
    console.warn(`Cannot update test metadata fields: ${restrictedKeys.join(', ')}`);

    allowedUpdates = Object.fromEntries(Object.entries(partialMetadata).filter(([k]) => !restrictedKeys.includes(k)));
  }

  return {
    ...prev,
    testMetadata: {
      ...prev.testMetadata,
      [test.code]: { ...prevTestMetadata, ...allowedUpdates },
    },
  };
}

function aoeLoaded(prev: TestsReducerState, action: AoeLoadedAction): TestsReducerState {
  let newTestMetadata: TestsReducerState['testMetadata'] | undefined;
  for (const [test, aoeQuestionnaire] of action.testAoes) {
    const prevMetadata = prev.testMetadata[test.code];
    if (!prevMetadata) {
      continue;
    }

    newTestMetadata ??= { ...prev.testMetadata };
    newTestMetadata[test.code] = {
      ...prevMetadata,
      aoeStatus: aoeQuestionnaire ? 'loaded' : 'none',
      aoeQuestionnaire:
        aoeQuestionnaire &&
        (updateAoeQuestionnaireRequiredItems(aoeQuestionnaire, prev.specimenCollectedDateTime) ?? aoeQuestionnaire),
    };
  }

  if (!newTestMetadata) {
    return prev;
  }

  return {
    ...prev,
    testMetadata: newTestMetadata,
  };
}

function aoeError(prev: TestsReducerState, action: AoeErrorAction): TestsReducerState {
  let newTestMetadata: TestsReducerState['testMetadata'] | undefined;
  for (const test of action.tests) {
    const prevMetadata = prev.testMetadata[test.code];
    if (!prevMetadata || prevMetadata.aoeStatus !== 'loading') {
      continue;
    }

    newTestMetadata ??= { ...prev.testMetadata };
    newTestMetadata[test.code] = {
      ...prevMetadata,
      aoeStatus: 'error',
    };
  }

  if (!newTestMetadata) {
    return prev;
  }

  return {
    ...prev,
    testMetadata: newTestMetadata,
  };
}

function specimenCollectionDateChange(
  prev: TestsReducerState,
  action: SpecimentCollectionDateChangeAction
): TestsReducerState {
  // check if we can reuse the previous testMetadata object to avoid unnecessary downstream re-renders
  let newTestMetadata: TestsReducerState['testMetadata'] | undefined;
  for (const test of prev.selectedTests) {
    const prevTestMetadata = prev.testMetadata[test.code];
    if (!prevTestMetadata) {
      continue;
    }

    if (prevTestMetadata.aoeQuestionnaire) {
      const newAoeQ = updateAoeQuestionnaireRequiredItems(prevTestMetadata.aoeQuestionnaire, action.newDate);
      if (newAoeQ) {
        newTestMetadata ??= { ...prev.testMetadata };
        newTestMetadata[test.code] = { ...prevTestMetadata, aoeQuestionnaire: newAoeQ };
      }
    }
  }

  return {
    ...prev,
    // If no changes to AOE questionnaire item.required, reuse the previous object
    testMetadata: newTestMetadata ?? prev.testMetadata,
    specimenCollectedDateTime: action.newDate,
  };
}

export function useHealthGorillaLabOrder(opts: UseHealthGorillaLabOrderOptions): UseHealthGorillaLabOrderReturn {
  const medplum = useMedplum();
  const [performingLab, privateSetPerformingLab] = useState<LabOrganization | undefined>();
  const [performingLabAccountNumber, privateSetPerformingLabAccountNumber] = useState<string | undefined>();
  const [testsAndMetadata, dispatchTests] = useReducer(testsReducer, {
    specimenCollectedDateTime: undefined,
    selectedTests: INITIAL_TESTS,
    testMetadata: INITIAL_TEST_METADATA,
  });
  const [diagnoses, privateSetDiagnoses] = useState<DiagnosisCodeableConcept[]>(INITIAL_DIAGNOSES);
  const [billingInformation, setBillingInformation] = useState<BillingInformation>(INITIAL_BILLING_INFORMATION);
  const [orderNotes, privateSetOrderNotes] = useState<string | undefined>();

  const healthGorillaAutocomplete = useMemo(() => {
    return getAutocompleteSearchFunction(medplum, {
      system: 'https://www.medplum.com/integrations/bot-identifier',
      value: 'health-gorilla-labs/autocomplete',
    });
  }, [medplum]);

  const fetchAoeQuestionnaire = useCallback(
    async (testCode: TestCoding): Promise<Questionnaire | undefined> => {
      const response = await healthGorillaAutocomplete<AOESearch>({ type: 'aoe', testCode });
      const questionnaire = response.result;
      if (questionnaire) {
        normalizeAoeQuestionnaire(questionnaire);
      }
      return response.result;
    },
    [healthGorillaAutocomplete]
  );

  const lastSelectedTests = useRef<TestCoding[]>([]);
  useEffect(() => {
    // effect only runs when selectedTests changes
    if (lastSelectedTests.current === testsAndMetadata.selectedTests) {
      return;
    }
    lastSelectedTests.current = testsAndMetadata.selectedTests;

    const testCodingAoesBeingFetched: TestCoding[] = [];
    async function fetchNeededAoeQuestions(): Promise<[TestCoding, Questionnaire | undefined][]> {
      const promises: Promise<[TestCoding, Questionnaire | undefined]>[] = [];
      for (const test of testsAndMetadata.selectedTests) {
        const metadata = testsAndMetadata.testMetadata[test.code];
        if (metadata?.aoeStatus !== 'loading') {
          continue;
        }

        testCodingAoesBeingFetched.push(test);
        promises.push(
          new Promise((resolve, reject) => {
            fetchAoeQuestionnaire(test)
              .then((questionnaire) => {
                resolve([test, questionnaire]);
              })
              .catch(reject);
          })
        );
      }
      return Promise.all(promises);
    }

    fetchNeededAoeQuestions()
      .then((results) => {
        if (results.length === 0) {
          return;
        }

        dispatchTests({ type: 'aoeLoaded', testAoes: results });
      })
      .catch((err) => {
        console.error('Error fetching AOE questions', err);
        dispatchTests({ type: 'aoeError', tests: testCodingAoesBeingFetched });
      });
  }, [fetchAoeQuestionnaire, testsAndMetadata]);

  const patientRef = useMemo<(Reference<Patient> & { reference: string }) | undefined>(() => {
    if (isReferenceOfType('Patient', opts.patient)) {
      return opts.patient;
    } else if (isResource(opts.patient)) {
      return createReference(opts.patient);
    } else {
      return undefined;
    }
  }, [opts.patient]);

  const requesterRef = useMemo<(Reference<Practitioner> & { reference: string }) | undefined>(() => {
    if (isReferenceOfType('Practitioner', opts.requester)) {
      return opts.requester;
    } else if (isResource(opts.requester)) {
      return createReference(opts.requester) as Reference<Practitioner> & { reference: string };
    } else {
      opts.requester satisfies undefined;
      return undefined;
    }
  }, [opts.requester]);

  const requestingLocationRef = useMemo<
    (Reference<Location | Organization> & { reference: string }) | undefined
  >(() => {
    if (
      isReferenceOfType('Location', opts.requestingLocation) ||
      isReferenceOfType('Organization', opts.requestingLocation)
    ) {
      return opts.requestingLocation;
    } else if (isResource(opts.requestingLocation)) {
      return createReference(opts.requestingLocation);
    } else {
      return undefined;
    }
  }, [opts.requestingLocation]);

  const state: HealthGorillaLabOrderState = useMemo(() => {
    const cloned = deepClone({
      performingLab,
      performingLabAccountNumber,
      selectedTests: testsAndMetadata.selectedTests,
      testMetadata: testsAndMetadata.testMetadata,
      diagnoses,
      billingInformation,
      specimenCollectedDateTime: testsAndMetadata.specimenCollectedDateTime,
      orderNotes,
    });

    // specimenCollectedDateTime is a Date object which is serialized in deepClone
    if (cloned.specimenCollectedDateTime) {
      cloned.specimenCollectedDateTime = new Date(cloned.specimenCollectedDateTime);
    }

    return cloned;
  }, [
    performingLab,
    performingLabAccountNumber,
    testsAndMetadata.selectedTests,
    testsAndMetadata.testMetadata,
    testsAndMetadata.specimenCollectedDateTime,
    diagnoses,
    billingInformation,
    orderNotes,
  ]);

  const getActivePatientCoverages = useCallback(async (): Promise<ResourceArray<Coverage>> => {
    if (!patientRef) {
      const emptyResult: Coverage[] = [];
      return Object.assign(emptyResult, {
        bundle: { resourceType: 'Bundle', type: 'searchset', entry: [], total: 0 } as Bundle<Coverage>,
      });
    }

    const coverageSearch = new URLSearchParams({
      patient: patientRef.reference,
      status: 'active',
    });
    const coverages = (await medplum.searchResources('Coverage', coverageSearch)).sort((a, b) => {
      return (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY);
    });

    return coverages;
  }, [medplum, patientRef]);

  const updateBillingInformation = useCallback((billingInfo: Partial<BillingInformation>): void => {
    setBillingInformation((prev) => {
      return { ...prev, ...billingInfo };
    });
  }, []);

  const result: UseHealthGorillaLabOrderReturn = useMemo(() => {
    return {
      state,
      searchAvailableLabs: async (query: string) => {
        const response = await healthGorillaAutocomplete<LabSearch>({ type: 'lab', query });
        // consider filtering to labs that have the https://www.healthgorilla.com/fhir/StructureDefinition/provider-compendium extension?
        return response.result;
      },
      searchAvailableTests: async (query: string): Promise<TestCoding[]> => {
        if (!performingLab) {
          return [];
        }

        const hgLabId = getIdentifier(performingLab, HEALTH_GORILLA_SYSTEM);
        if (!hgLabId) {
          throw new Error('No Health Gorilla identifier found for performing lab');
        }

        if (query.length === 0) {
          return [];
        }
        const response = await healthGorillaAutocomplete<TestSearch>({ type: 'test', query, labId: hgLabId });

        const tests = response.result;
        return tests;
      },
      setPerformingLab: (newLab: LabOrganization | undefined) => {
        privateSetPerformingLab(newLab);
      },
      setPerformingLabAccountNumber: (newAccountNumber: string | undefined) => {
        privateSetPerformingLabAccountNumber(newAccountNumber);
      },
      addTest: (test: TestCoding) => {
        dispatchTests({ type: 'add', test });
      },
      removeTest: (test: TestCoding) => {
        dispatchTests({ type: 'remove', test });
      },
      setTests: (newTests: TestCoding[]) => {
        dispatchTests({ type: 'set', tests: newTests });
      },

      updateTestMetadata: (test: TestCoding, partialMetadata: Partial<LabOrderTestMetadata>) => {
        dispatchTests({ type: 'updateMetadata', test, partialMetadata });
      },

      addDiagnosis(diagnosis: DiagnosisCodeableConcept) {
        privateSetDiagnoses((prev) => {
          if (prev.some((item) => toDiagnosisKey(item) === toDiagnosisKey(diagnosis))) {
            return prev;
          }
          return [...prev, diagnosis];
        });
      },
      removeDiagnosis(diagnosis: DiagnosisCodeableConcept) {
        privateSetDiagnoses((prev) => {
          const idx = prev.findIndex((item) => toDiagnosisKey(item) === toDiagnosisKey(diagnosis));
          if (idx === -1) {
            return prev;
          }
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      },
      setDiagnoses: (newDiagnoses: DiagnosisCodeableConcept[]) => {
        privateSetDiagnoses(newDiagnoses);
      },

      getActivePatientCoverages,
      updateBillingInformation,

      setSpecimenCollectedDateTime: (newDate: Date | undefined) => {
        dispatchTests({ type: 'specimenCollectionDateChange', newDate });
      },

      setOrderNotes: (newOrderNotes: string | undefined) => {
        // || instead of ?? so that empty string becomes undefined
        privateSetOrderNotes(newOrderNotes || undefined);
      },

      validateOrder: () => {
        return validateLabOrderInputs({
          patient: patientRef,
          requester: requesterRef,
          performingLab: state.performingLab,
          performingLabAccountNumber: state.performingLabAccountNumber,
          selectedTests: state.selectedTests,
          testMetadata: state.testMetadata,
          diagnoses: state.diagnoses,
          billingInformation: state.billingInformation,
          specimenCollectedDateTime: state.specimenCollectedDateTime,
          orderNotes: state.orderNotes,
        });
      },
      createOrderBundle: async (): Promise<{ transactionResponse: Bundle; serviceRequest: ServiceRequest }> => {
        const txn = createLabOrderBundle({
          patient: patientRef,
          requester: requesterRef,
          requestingLocation: requestingLocationRef,
          performingLab: state.performingLab,
          performingLabAccountNumber: state.performingLabAccountNumber,
          selectedTests: state.selectedTests,
          testMetadata: state.testMetadata,
          diagnoses: state.diagnoses,
          billingInformation: state.billingInformation,
          specimenCollectedDateTime: state.specimenCollectedDateTime,
          orderNotes: state.orderNotes,
        });

        const transactionResponse = await medplum.executeBatch(txn);

        let labOrderServiceRequest: LabOrderServiceRequest | undefined;

        for (const entry of transactionResponse?.entry ?? []) {
          if (!entry.response?.status.startsWith('2')) {
            throw new Error('Error creating lab order: Non-2XX status code in response entry', {
              cause: transactionResponse,
            });
          }
          if (entry.resource?.meta?.profile?.includes(MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE)) {
            labOrderServiceRequest = entry.resource as LabOrderServiceRequest;
          }
        }

        if (!labOrderServiceRequest) {
          throw new Error('Error creating lab order: Lab Order Service Request not found in response entries', {
            cause: transactionResponse,
          });
        }

        return { transactionResponse, serviceRequest: labOrderServiceRequest };
      },
    };
  }, [
    getActivePatientCoverages,
    healthGorillaAutocomplete,
    medplum,
    patientRef,
    performingLab,
    requestingLocationRef,
    requesterRef,
    state,
    updateBillingInformation,
  ]);

  return result;
}

function toDiagnosisKey(diagnosis: DiagnosisCodeableConcept): string {
  return diagnosis.coding[0].code as string;
}

const REQUIRED_WHEN_SPECIMEN =
  'https://www.healthgorilla.com/fhir/StructureDefinition/questionnaire-requiredwhenspecimen';

/**
 * Updates the required status of items in an AOE questionnaire based on whether a specimen is being collected.
 * @param questionnaire - The Questionnaire to update
 * @param specimenCollectedDateTime - The date and time the specimen was collected, if any
 * @returns A new Questionnaire with the required status of items updated, or undefined if no changes are needed
 */
function updateAoeQuestionnaireRequiredItems(
  questionnaire: Questionnaire,
  specimenCollectedDateTime: Date | undefined
): Questionnaire | undefined {
  let newQuestionnaire: Questionnaire | undefined;
  const requiredWhenSpecimen = Boolean(specimenCollectedDateTime);

  // first, check if the questionnaire needs any changes
  for (const item of questionnaireItemIterator(questionnaire.item)) {
    if (getExtensionValue(item, REQUIRED_WHEN_SPECIMEN) === true && Boolean(item.required) !== requiredWhenSpecimen) {
      // at least one item needs updating, so crete a clone to be updated rather than updating in place
      newQuestionnaire = deepClone(questionnaire);
      break;
    }
  }

  // if no changes are needed, return the original Questionnaire
  if (!newQuestionnaire) {
    return undefined;
  }

  // otherwise, update the cloned Questionnaire
  for (const item of questionnaireItemIterator(newQuestionnaire.item)) {
    if (getExtensionValue(item, REQUIRED_WHEN_SPECIMEN) === true) {
      if (Boolean(item.required) !== requiredWhenSpecimen) {
        item.required = requiredWhenSpecimen;
      }
    }
  }

  return newQuestionnaire;
}
