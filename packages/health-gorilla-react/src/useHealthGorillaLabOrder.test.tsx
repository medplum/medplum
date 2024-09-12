import {
  createReference,
  deepClone,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Coverage, Patient, Practitioner, Reference, SearchParameter } from '@medplum/fhirtypes';
import { DiagnosisCodeableConcept, LabOrganization, TestCoding } from '@medplum/health-gorilla-core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { expectToBeDefined } from './test-utils';
import {
  HealthGorillaLabOrderState,
  useHealthGorillaLabOrder,
  UseHealthGorillaLabOrderOptions,
  UseHealthGorillaLabOrderReturn,
} from './useHealthGorillaLabOrder';
import { HealthGorillaLabOrderProvider } from './HealthGorillaLabOrderProvider';
import { useHealthGorillaLabOrderContext } from './useHealthGorillaLabOrderContext';
import {
  RWS_AOE_TEST,
  REQUIRED_AOE_TEST,
  getMockAutocompleteBot,
  QUERY_FOR_TEST_WITHOUT_AOE,
} from './autocomplete-endpoint.test';

const DIAGNOSES = [
  {
    coding: [
      {
        system: 'http://hl7.org/fhir/sid/icd-10-cm',
        code: 'D63.1',
      },
    ],
    text: 'D63.1',
  } as DiagnosisCodeableConcept,
  {
    coding: [
      {
        system: 'http://hl7.org/fhir/sid/icd-10-cm',
        code: 'E04.2',
      },
    ],
    text: 'E04.2',
  } as DiagnosisCodeableConcept,
];

describe('useHealthGorilla', () => {
  let medplum: MockClient;
  let patient: Patient;
  let requester: Practitioner;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();

    patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ text: 'Test Patient' }],
    });

    requester = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [{ text: 'Test Practitioner' }],
    });

    vi.spyOn(medplum, 'executeBot').mockImplementation(getMockAutocompleteBot({}));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function setup({
    patient,
    requester,
  }: UseHealthGorillaLabOrderOptions): ReturnType<typeof renderHook<UseHealthGorillaLabOrderReturn, unknown>> {
    return renderHook(() => useHealthGorillaLabOrder({ patient, requester }), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ),
    });
  }

  function setupContext(
    hookOptions: UseHealthGorillaLabOrderOptions,
    withoutProvider?: boolean
  ): ReturnType<typeof renderHook<UseHealthGorillaLabOrderReturn, unknown>> {
    function WrapperComponent({ children }: { children: React.ReactNode }): JSX.Element {
      const result = useHealthGorillaLabOrder(hookOptions);
      if (withoutProvider) {
        return <div> {children}</div>;
      }
      return <HealthGorillaLabOrderProvider {...result}>{children}</HealthGorillaLabOrderProvider>;
    }

    return renderHook(() => useHealthGorillaLabOrderContext(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <WrapperComponent>{children}</WrapperComponent>
          </MedplumProvider>
        </MemoryRouter>
      ),
    });
  }

  test('Context without provider throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => setupContext({ patient, requester }, true)).toThrow();
  });

  test.each([
    ['hook', setup],
    ['provider and context', setupContext],
  ])('Happy path to creating an order with %s', async (description, setupFunc) => {
    const { result } = setupFunc({ patient, requester });

    expect(result.current.state).toEqual(getDefaultState());
    expectToBeDefined(result.current.validateOrder());

    const labs = await result.current.searchAvailableLabs('quest');
    expect(labs).toHaveLength(1);

    const performingLab: LabOrganization = labs[0];

    await act(async () => {
      result.current.setPerformingLab(labs[0]);
    });

    expect(result.current.state).toEqual({
      ...getDefaultState(),
      performingLab,
    });
    expectToBeDefined(result.current.validateOrder());

    const tests = await result.current.searchAvailableTests(QUERY_FOR_TEST_WITHOUT_AOE);

    expect(tests).toHaveLength(1);
    const test: TestCoding = tests[0];

    await act(async () => {
      result.current.addTest(test);
    });

    expect(result.current.state).toEqual({
      ...getDefaultState(),
      performingLab,
      selectedTests: [test],
      testMetadata: { [test.code]: { aoeStatus: 'none' } },
    });

    // Is valid order now
    expect(result.current.validateOrder()).toBeUndefined();

    const specimenCollectedDateTime = new Date(2024, 8, 9, 16, 30);
    await act(async () => {
      result.current.updateTestMetadata(test, { notes: 'Test 0 note', priority: 'urgent' });
      result.current.setOrderNotes('This is a note about the whole order');
      result.current.setSpecimenCollectedDateTime(specimenCollectedDateTime);
      result.current.updateBillingInformation({ billTo: 'customer-account' });
      result.current.addDiagnosis(DIAGNOSES[0]);
      result.current.addDiagnosis(DIAGNOSES[1]);
      result.current.removeDiagnosis(DIAGNOSES[0]);
    });

    expect(result.current.state).toEqual({
      ...getDefaultState(),
      performingLab,
      selectedTests: [test],
      testMetadata: { [test.code]: { aoeStatus: 'none', priority: 'urgent', notes: 'Test 0 note' } },
      orderNotes: 'This is a note about the whole order',
      billingInformation: { billTo: 'customer-account' },
      diagnoses: [DIAGNOSES[1]],
      specimenCollectedDateTime,
    } as HealthGorillaLabOrderState);

    expect(result.current.validateOrder).not.toThrow();
    const order = await result.current.createOrderBundle();
    expect(order.serviceRequest.reasonCode).toEqual([DIAGNOSES[1]]);
  });

  test('patient and requester as references', async () => {
    setup({
      patient: createReference(patient) as Reference<Patient> & { reference: string },
      requester: createReference(requester) as Reference<Practitioner> & { reference: string },
    });
  });

  test('AOE required when specimen', async () => {
    const { result } = setup({ patient, requester });
    await act(async () => {
      result.current.addTest(RWS_AOE_TEST);
      result.current.setSpecimenCollectedDateTime(new Date());
    });

    // AOE should be required since a specimentCollectedDateTime is set
    expectToBeDefined(result.current.validateOrder()?.testMetadata?.[RWS_AOE_TEST.code]?.aoeResponses);

    await act(async () => {
      result.current.setSpecimenCollectedDateTime(undefined);
    });

    // AOE should now NOT be required since a specimentCollectedDateTime is removed
    expect(result.current.validateOrder()?.testMetadata?.[RWS_AOE_TEST.code]?.aoeResponses).toBeUndefined();
  });

  test('required AOE', async () => {
    const { result } = setup({ patient, requester });
    await act(async () => {
      result.current.addTest(REQUIRED_AOE_TEST);
    });
    expectToBeDefined(result.current.state.testMetadata[REQUIRED_AOE_TEST.code]?.aoeQuestionnaire);
    //TODO check that answers are required when submitting
  });

  test('getActivePatientCoverages', async () => {
    const withoutInputs = setup({ patient: undefined, requester: undefined });
    let coverage = await withoutInputs.result.current.getActivePatientCoverages();
    expect(coverage).toHaveLength(0);

    const { result } = setup({ patient, requester });
    coverage = await result.current.getActivePatientCoverages();
    expect(coverage).toHaveLength(0);

    const count = 2;
    for (let i = 0; i < count; i++) {
      await medplum.createResource({
        resourceType: 'Coverage',
        status: 'active',
        payor: [{ reference: getReferenceString(patient) }],
        beneficiary: { reference: getReferenceString(patient) },
      } as Coverage);
    }

    coverage = await result.current.getActivePatientCoverages();
    expect(coverage).toHaveLength(2);
  });
});

function getDefaultState(): HealthGorillaLabOrderState {
  // A bit of an abstraction violation here. Pass through deepClone to avoid considering missing `undefined` values
  return deepClone({
    performingLab: undefined,
    performingLabAccountNumber: undefined,
    billingInformation: { billTo: 'patient' },
    selectedTests: [],
    testMetadata: {},
    diagnoses: [],
    orderNotes: undefined,
    specimenCollectedDateTime: undefined,
  });
}
