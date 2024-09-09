import { createReference, deepClone, getIdentifier, isResource } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  Coverage,
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
  LabOrderTestMetadata,
  LabOrganization,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
  TestCoding,
  createLabOrderBundle,
  isReferenceOfType,
  normalizeAoeQuestionnaire,
} from '@medplum/health-gorilla-common';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AOESearch, HGSearchFunction, LabSearch, TestSearch, prepareAutocompleteBot } from './autocomplete-endpoint';

export type UseHealthGorillaLabOrderOptions = {
  /** Patient the tests are ordered for. */
  patient: Patient | (Reference<Patient> & { reference: string }) | undefined;
  /**
   * The physician who requests diagnostic procedures for the patient and responsible for the order.
   * The Practitioner MUST have an NPI identifier with the system http://hl7.org/fhir/sid/us-npi.
   */
  requester: Practitioner | (Reference<Practitioner> & { reference: string }) | undefined;
};

export type HealthGorillaLabOrderState = {
  performingLab: LabOrganization | undefined;
  performingLabAccountNumber: string | undefined;
  selectedTests: TestCoding[];
  testMetadata: Record<string, TestMetadata | undefined>;
  diagnoses: DiagnosisCodeableConcept[];
  billingInformation: BillingInformation;
  specimenCollectedDateTime: Date | undefined;
  orderNotes: string | undefined;
};

export type TestMetadata = LabOrderTestMetadata & {
  aoeStatus: 'loading' | 'loaded' | 'none' | 'error';
  /** The AOE `Questionnaire`, if any, containing Ask at Order Entry (AOE) questions for the test.  */
  aoeQuestionnaire?: Questionnaire;
};

export type EditableLabOrderTestMetadata = Pick<LabOrderTestMetadata, 'priority' | 'notes' | 'aoeResponses'>;
const EDITABLE_TEST_METADATA_KEYS: (keyof LabOrderTestMetadata)[] = ['priority', 'notes', 'aoeResponses'];

export type UseHealthGorillaLabOrderReturn = {
  state: HealthGorillaLabOrderState;

  searchAvailableLabs: (query: string) => Promise<LabOrganization[]>;
  /**
   * Set the desired performer for doing the diagnostic testing. Compatible with
   * results from the `searchAvailableLabs` function.
   */
  setPerformingLab: (lab: LabOrganization | undefined) => void;
  /**
   * Sets the account number for the performing lab. If not provided, the
   * `HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER` `Project.secret` is used.
   */
  setPerformingLabAccountNumber: (accountNumber: string | undefined) => void;

  searchAvailableTests: (query: string) => Promise<TestCoding[]>;
  addTest: (test: TestCoding) => void;
  removeTest: (test: TestCoding) => void;
  setTests: (tests: TestCoding[]) => void;

  updateTestMetadata: (test: TestCoding, metadata: Partial<LabOrderTestMetadata>) => void;

  addDiagnosis: (diagnosis: DiagnosisCodeableConcept) => void;
  removeDiagnosis: (diagnosis: DiagnosisCodeableConcept) => void;
  setDiagnoses: (diagnoses: DiagnosisCodeableConcept[]) => void;

  getActivePatientCoverages: () => Promise<Coverage[]>;
  updateBillingInformation: (billingInfo: Partial<BillingInformation>) => void;

  setSpecimenCollectedDateTime: (date: Date | undefined) => void;

  setOrderNotes: (orderNotes: string | undefined) => void;

  validateOrder: () => Error[] | undefined;
  createOrderBundle: () => Promise<{ transactionResponse: Bundle; serviceRequest: ServiceRequest }>;
};

const INITIAL_TESTS: TestCoding[] = [];
const INITIAL_DIAGNOSES: DiagnosisCodeableConcept[] = [];
const INITIAL_TEST_METADATA = {};
const INITIAL_BILLING_INFORMATION: BillingInformation = { billTo: 'patient', patientCoverage: undefined };

type TestsAndMetadata = {
  selectedTests: TestCoding[];
  testMetadata: Record<string, TestMetadata | undefined>;
};

type TestsAction =
  | { type: 'add'; test: TestCoding }
  | { type: 'remove'; test: TestCoding }
  | { type: 'set'; tests: TestCoding[] }
  | { type: 'updateMetadata'; test: TestCoding; partialMetadata: Partial<EditableLabOrderTestMetadata> }
  | { type: 'aoeLoaded'; testAoes: [TestCoding, Questionnaire | undefined][] }
  | { type: 'aoeError'; tests: TestCoding[] };

function testsReducer(prev: TestsAndMetadata, action: TestsAction): TestsAndMetadata {
  switch (action.type) {
    case 'add': {
      if (prev.selectedTests.some((test) => test.code === action.test.code)) {
        return prev;
      }

      return {
        selectedTests: [...prev.selectedTests, action.test],
        testMetadata: {
          ...prev.testMetadata,
          [action.test.code]: { aoeStatus: 'loading' },
        },
      };
    }
    case 'remove': {
      return {
        selectedTests: prev.selectedTests.filter((test) => test.code !== action.test.code),
        testMetadata: Object.fromEntries(
          Object.entries(prev.testMetadata).filter(([code]) => code !== action.test.code)
        ),
      };
    }
    case 'set': {
      return {
        selectedTests: action.tests,
        testMetadata: Object.fromEntries(
          action.tests.map((test) => {
            return [test.code, prev.testMetadata[test.code] ?? { aoeStatus: 'loading' }];
          })
        ),
      };
    }

    case 'updateMetadata': {
      const { test, partialMetadata } = action;

      const prevTestMetadata = prev.testMetadata[test.code];
      if (!prev.selectedTests.some((t) => t.code === test.code) || !prevTestMetadata) {
        console.warn(`Cannot update metadata for test ${test.code} since it is not a selected tests`);
        return prev;
      }

      let allowedUpdates = partialMetadata;
      const restrictedKeys = Object.keys(partialMetadata).filter(
        (k) => !EDITABLE_TEST_METADATA_KEYS.includes(k as any)
      );

      if (restrictedKeys.length > 0) {
        console.warn(`Cannot update test metadata fields: ${restrictedKeys.join(', ')}`);

        allowedUpdates = Object.fromEntries(
          Object.entries(partialMetadata).filter(([k]) => !restrictedKeys.includes(k))
        );
      }

      return {
        selectedTests: prev.selectedTests,
        testMetadata: {
          ...prev.testMetadata,
          [test.code]: { ...prevTestMetadata, ...allowedUpdates },
        },
      };
    }
    case 'aoeLoaded': {
      let newTestMetadata: TestsAndMetadata['testMetadata'] | undefined;
      for (const [test, aoeQuestionnaire] of action.testAoes) {
        const prevMetadata = prev.testMetadata[test.code];
        if (!prevMetadata) {
          continue;
        }

        newTestMetadata ??= { ...prev.testMetadata };
        newTestMetadata[test.code] = {
          ...prevMetadata,
          aoeStatus: aoeQuestionnaire ? 'loaded' : 'none',
          aoeQuestionnaire,
        };
      }

      if (!newTestMetadata) {
        return prev;
      }

      return {
        selectedTests: prev.selectedTests,
        testMetadata: newTestMetadata,
      };
    }

    case 'aoeError': {
      let newTestMetadata: TestsAndMetadata['testMetadata'] | undefined;
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
        selectedTests: prev.selectedTests,
        testMetadata: newTestMetadata,
      };
    }
    default:
      action satisfies never;
      return prev;
  }
}

export function useHealthGorillaLabOrder(opts: UseHealthGorillaLabOrderOptions): UseHealthGorillaLabOrderReturn {
  const medplum = useMedplum();
  const [performingLab, _setPerformingLab] = useState<LabOrganization | undefined>();
  const [performingLabAccountNumber, _setPerformingLabAccountNumber] = useState<string | undefined>();
  const [testsAndMetadata, dispatchTests] = useReducer(testsReducer, {
    selectedTests: INITIAL_TESTS,
    testMetadata: INITIAL_TEST_METADATA,
  });
  const [diagnoses, _setDiagnoses] = useState<DiagnosisCodeableConcept[]>(INITIAL_DIAGNOSES);
  const [healthGorillaAutocomplete, setHealthGorillaAutocomplete] = useState<HGSearchFunction>();
  const [billingInformation, setBillingInformation] = useState<BillingInformation>(INITIAL_BILLING_INFORMATION);
  const [specimenCollectedDateTime, _setSpecimenCollectedDateTime] = useState<Date | undefined>();
  const [orderNotes, _setOrderNotes] = useState<string | undefined>();

  const fetchAoeQuestionnaire = useCallback(
    async (testCode: TestCoding): Promise<Questionnaire | undefined> => {
      if (!healthGorillaAutocomplete) {
        return undefined;
      }

      const response = await healthGorillaAutocomplete<AOESearch>({ type: 'aoe', testCode });
      const questionnaire = response.result;
      if (questionnaire) {
        normalizeAoeQuestionnaire(questionnaire);
      }
      return response.result;
    },
    [healthGorillaAutocomplete]
  );

  useEffect(() => {
    let cancelled = false;
    prepareAutocompleteBot(medplum, {
      system: 'https://www.medplum.com/integrations/bot-identifier',
      value: 'health-gorilla-labs/autocomplete',
    })
      .then((autocompleteFunc) => {
        if (cancelled) {
          return;
        }
        setHealthGorillaAutocomplete(() => autocompleteFunc);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('Error initializing autocomplete function', error);
      });

    return () => {
      cancelled = true;
    };
  }, [medplum]);

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
        if (!metadata) {
          console.warn(`Test metadata not found for test ${test.code}`, JSON.stringify(testsAndMetadata, null, 2));
          continue;
        }

        if (metadata.aoeStatus !== 'loading') {
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
      return createReference(opts.patient) as Reference<Patient> & { reference: string };
    } else if (opts.patient === undefined) {
      return undefined;
    }
    opts.patient satisfies never;
    throw new Error('Invalid patient', { cause: opts.patient });
  }, [opts.patient]);

  const requesterRef = useMemo<(Reference<Practitioner> & { reference: string }) | undefined>(() => {
    if (isReferenceOfType('Practitioner', opts.requester)) {
      return opts.requester;
    } else if (isResource(opts.requester)) {
      return createReference(opts.requester) as Reference<Practitioner> & { reference: string };
    } else if (opts.requester === undefined) {
      return undefined;
    }
    opts.requester satisfies never;
    throw new Error('Invalid requester', { cause: opts.requester });
  }, [opts.requester]);

  const state: HealthGorillaLabOrderState = useMemo(() => {
    const cloned = deepClone({
      performingLab,
      performingLabAccountNumber,
      selectedTests: testsAndMetadata.selectedTests,
      testMetadata: testsAndMetadata.testMetadata,
      diagnoses,
      billingInformation,
      specimenCollectedDateTime,
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
    diagnoses,
    billingInformation,
    specimenCollectedDateTime,
    orderNotes,
  ]);

  const getActivePatientCoverages = useCallback(async (): Promise<Coverage[]> => {
    if (!patientRef) {
      return [];
      // throw new Error('Patient must be provided to get available coverages');
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
        if (!healthGorillaAutocomplete) {
          return [];
        }
        const response = await healthGorillaAutocomplete<LabSearch>({ type: 'lab', query });
        // consider filtering to labs that have the https://www.healthgorilla.com/fhir/StructureDefinition/provider-compendium extension?
        return response.result;
      },
      searchAvailableTests: async (query: string): Promise<TestCoding[]> => {
        if (!healthGorillaAutocomplete) {
          return [];
        }
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
        _setPerformingLab(newLab);
      },
      setPerformingLabAccountNumber: (newAccountNumber: string | undefined) => {
        _setPerformingLabAccountNumber(newAccountNumber);
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
        _setDiagnoses((prev) => {
          if (prev.some((item) => toDiagnosisKey(item) === toDiagnosisKey(diagnosis))) {
            return prev;
          }
          return [...prev, diagnosis];
        });
      },
      removeDiagnosis(diagnosis: DiagnosisCodeableConcept) {
        _setDiagnoses((prev) => {
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
        _setDiagnoses(newDiagnoses);
      },

      getActivePatientCoverages,
      updateBillingInformation,

      setSpecimenCollectedDateTime: (newDate: Date | undefined) => {
        _setSpecimenCollectedDateTime(newDate);
      },

      setOrderNotes: (newOrderNotes: string | undefined) => {
        _setOrderNotes(newOrderNotes || undefined);
      },

      validateOrder: () => {
        return undefined;
      },
      createOrderBundle: async (): Promise<{ transactionResponse: Bundle; serviceRequest: ServiceRequest }> => {
        const txn = createLabOrderBundle({
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

        const labOrderIdx = txn.entry?.findIndex((entry) => {
          return (
            entry.resource?.resourceType === 'ServiceRequest' &&
            entry.resource.meta?.profile?.includes(MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE)
          );
        });

        if (labOrderIdx === -1) {
          throw new Error('Error creating lab order: Lab Order Service Request not found in Bundle', { cause: txn });
        }

        const transactionResponse = await medplum.executeBatch(txn);

        if (transactionResponse.entry?.length === undefined) {
          throw new Error('Error creating lab order: No entries in response', { cause: transactionResponse });
        }

        let labOrderEntry: BundleEntry | undefined;

        for (const entry of transactionResponse.entry) {
          if (!entry.response?.status.startsWith('2')) {
            throw new Error('Error creating lab order: Non-2XX status code in response entry', { cause: entry });
          }
          if (entry.resource?.meta?.profile?.includes(MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE)) {
            labOrderEntry = entry;
          }
        }

        if (!labOrderEntry) {
          throw new Error('Error creating lab order: Lab Order Service Request not found in response entries', {
            cause: transactionResponse,
          });
        }

        const serviceRequest = labOrderEntry.resource as ServiceRequest;

        return { transactionResponse, serviceRequest };
      },
    };
  }, [
    getActivePatientCoverages,
    healthGorillaAutocomplete,
    medplum,
    patientRef,
    performingLab,
    requesterRef,
    state,
    updateBillingInformation,
  ]);

  return result;
}

function toDiagnosisKey(diagnosis: DiagnosisCodeableConcept): string {
  // TODO feels slightly dangerous since users can alter a diagnosis along the way...
  return diagnosis.coding[0].code as string;
}
