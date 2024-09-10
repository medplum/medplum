import { deepClone, isResource, isResourceType } from '@medplum/core';
import { Patient, Practitioner } from '@medplum/fhirtypes';
import {
  HEALTH_GORILLA_SYSTEM,
  HGAutocompleteBotInput,
  LabOrganization,
  TestCoding,
} from '@medplum/health-gorilla-common';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import {
  HealthGorillaLabOrderState,
  useHealthGorillaLabOrder,
  UseHealthGorillaLabOrderReturn,
} from './useHealthGorillaLabOrder';

const ALL_TESTS = [
  {
    system: 'urn:uuid:f:777777777777777777777777',
    code: 'NO_AOE',
    display: 'does not have an AOE',
  },
  // {
  //   system: 'urn:uuid:f:777777777777777777777777',
  //   code: 'RWS_AOE',
  //   display: 'required when specimen AOE',
  // },
];

const QUERY_FOR_TEST_WITHOUT_AOE = 'does not';
// const QUERY_FOR_TEST_WITH_REQUIRED_WHEN_SPECIMEN_AOE = 'required when specimen';

describe('useHealthGorilla', () => {
  let medplum: MockClient;
  let patient: Patient;
  let requester: Practitioner;

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

    vi.spyOn(medplum, 'executeBot').mockImplementation(async (idOrIdentifier, botInput) => {
      if (
        typeof idOrIdentifier === 'string' ||
        idOrIdentifier.system !== 'https://www.medplum.com/integrations/bot-identifier' ||
        idOrIdentifier.value !== 'health-gorilla-labs/autocomplete'
      ) {
        throw new Error(`Attempted to execute a non-mocked Bot ${JSON.stringify(idOrIdentifier)}`);
      }

      const input = botInput as HGAutocompleteBotInput;
      switch (input.type) {
        case 'lab': {
          const result = [];
          if (input.query.toLocaleLowerCase().includes('quest')) {
            result.push({
              resourceType: 'Organization',
              name: 'Quest Diagnostics',
              identifier: [{ system: HEALTH_GORILLA_SYSTEM, value: 'f-12345' }],
            });
          }
          return { type: 'lab', result };
        }
        case 'test': {
          const q = input.query.toLocaleLowerCase();
          const result = ALL_TESTS.filter((test) => test.display.toLocaleLowerCase().includes(q));
          return { type: 'test', result };
        }
        case 'aoe': {
          return { type: 'aoe', result: undefined };
        }
        default: {
          input satisfies never;
          throw new Error('Unexpected search type: ' + (input as any).type);
        }
      }
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function setup({
    patient,
    requester,
  }: {
    patient?: Patient;
    requester?: Practitioner;
  }): ReturnType<typeof renderHook<UseHealthGorillaLabOrderReturn, unknown>> {
    return renderHook(() => useHealthGorillaLabOrder({ patient, requester }), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ),
    });
  }

  test.only('Happy path', async () => {
    const { result } = setup({ patient, requester });

    expect(result.current.state).toEqual(getDefaultState());
    expect(result.current.validateOrder).toThrow();

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
    expect(result.current.validateOrder).toThrow();

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
    expect(result.current.validateOrder).not.toThrow();

    const specimenCollectedDateTime = new Date(2024, 8, 9, 16, 30);
    await act(async () => {
      result.current.updateTestMetadata(test, { notes: 'Test 0 note', priority: 'urgent' });
      result.current.setOrderNotes('This is a note about the whole order');
      result.current.setSpecimenCollectedDateTime(specimenCollectedDateTime);
    });

    expect(result.current.state).toEqual({
      ...getDefaultState(),
      performingLab,
      selectedTests: [test],
      testMetadata: { [test.code]: { aoeStatus: 'none', priority: 'urgent', notes: 'Test 0 note' } },
      orderNotes: 'This is a note about the whole order',
      specimenCollectedDateTime,
    } as HealthGorillaLabOrderState);

    expect(result.current.validateOrder).not.toThrow();
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
